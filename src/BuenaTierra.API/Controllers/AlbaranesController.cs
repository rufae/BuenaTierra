using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;
using OfficeOpenXml.Style;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AlbaranesController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly ILoteAsignacionService _loteService;
    private readonly ISerieFacturacionService _serieService;
    private readonly IFacturaService _facturaService;

    public AlbaranesController(
        IUnitOfWork uow,
        ILoteAsignacionService loteService,
        ISerieFacturacionService serieService,
        IFacturaService facturaService)
    {
        _uow = uow;
        _loteService = loteService;
        _serieService = serieService;
        _facturaService = facturaService;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>GET /api/albaranes — Listar albaranes con filtros opcionales de fecha (paginación opcional)</summary>
    [HttpGet]
    public async Task<ActionResult> GetAll(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta,
        [FromQuery] int? page = null, [FromQuery] int? pageSize = null,
        CancellationToken ct = default)
    {
        var albaranes = await _uow.Albaranes.GetByEmpresaAsync(EmpresaId, desde, hasta, ct);
        var resultado = albaranes.Select(a => new AlbaranResumen(
            a.Id, a.NumeroAlbaran ?? $"ALB-{a.Id}",
            a.FechaAlbaran.ToString("yyyy-MM-dd"),
            a.Estado.ToString(),
            a.Cliente?.NombreCompleto ?? "",
            a.Cliente?.Nif,
            a.Total,
            a.PedidoId,
            a.Cliente?.NoRealizarFacturas ?? false
        )).ToList();

        var pg = new PaginationParams(page, pageSize);
        if (pg.HasPagination)
        {
            var paged = resultado.Skip((pg.SafePage - 1) * pg.SafePageSize).Take(pg.SafePageSize);
            return Ok(PagedResponse<AlbaranResumen>.Ok(paged, resultado.Count, pg.SafePage, pg.SafePageSize));
        }
        return Ok(ApiResponse<IEnumerable<AlbaranResumen>>.Ok(resultado));
    }

    /// <summary>GET /api/albaranes/{id} — Detalle de albarán con todas sus líneas y lotes</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<AlbaranDetalle>>> Get(int id, CancellationToken ct)
    {
        var albaran = await _uow.Albaranes.GetConLineasAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<AlbaranDetalle>.Fail("Albarán no encontrado"));

        return Ok(ApiResponse<AlbaranDetalle>.Ok(MapToDetalle(albaran)));
    }

    /// <summary>
    /// POST /api/albaranes/crear
    /// Crea un albarán con asignación FIFO automática de lotes (igual que factura).
    /// </summary>
    [HttpPost("crear")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<AlbaranCreado>>> Crear(
        [FromBody] CrearAlbaranRequest request, CancellationToken ct)
    {
        request.EmpresaId = EmpresaId;
        request.UsuarioId = UsuarioId;

        // Validar cliente y cargar condiciones especiales comerciales
        var cliente = await _uow.Clientes.GetQueryable()
            .Include(c => c.CondicionesEspeciales)
            .FirstOrDefaultAsync(c => c.Id == request.ClienteId && c.EmpresaId == EmpresaId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), request.ClienteId);

        // Por cada item, asignar lotes FIFO
        var lineasConLotes = new List<(LineaAlbaranRequest Item, Producto Producto, List<LoteAsignado> Lotes)>();

        foreach (var item in request.Items)
        {
            var producto = await _uow.Productos.GetByIdAsync(item.ProductoId, ct)
                ?? throw new EntidadNotFoundException(nameof(Producto), item.ProductoId);

            List<LoteAsignado> lotesAsignados;
            if (producto.RequiereLote)
                lotesAsignados = await _loteService.AsignarLotesAsync(EmpresaId, item.ProductoId, item.Cantidad, ct);
            else
                lotesAsignados = [new LoteAsignado(0, "", item.ProductoId, item.Cantidad, DateOnly.MinValue, null)];

            lineasConLotes.Add((item, producto, lotesAsignados));
        }

        await _uow.BeginTransactionAsync(ct);
        try
        {
            // RE y retención del cliente
            bool aplicaRE = cliente.TipoImpuesto == TipoImpuesto.RecargoEquivalencia
                         || cliente.RecargoEquivalencia;
            decimal retencionPorc = !cliente.NoAplicarRetenciones && cliente.PorcentajeRetencion > 0
                ? cliente.PorcentajeRetencion : 0m;

            // Cargar tabla de RE desde BD para la empresa (en vez de hardcoded)
            var tablaRE = aplicaRE
                ? (await _uow.TiposIvaRe.FindAsync(t => t.EmpresaId == EmpresaId && t.Activo, ct))
                    .ToDictionary(t => t.IvaPorcentaje, t => t.RecargoEquivalenciaPorcentaje)
                : new Dictionary<decimal, decimal>();

            // Número de albarán (usa misma serie que facturas o serie propia)
            string numeroAlbaran;
            if (request.SerieId.HasValue)
                numeroAlbaran = $"ALB-{await _serieService.SiguienteNumeroAsync(EmpresaId, request.SerieId.Value, ct)}";
            else
                numeroAlbaran = $"ALB-{DateTime.UtcNow:yyyyMMddHHmmss}";

            var albaran = new Albaran
            {
                EmpresaId = EmpresaId,
                ClienteId = request.ClienteId,
                UsuarioId = UsuarioId,
                PedidoId = request.PedidoId,
                SerieId = request.SerieId,
                NumeroAlbaran = numeroAlbaran,
                FechaAlbaran = request.FechaAlbaran,
                Estado = EstadoAlbaran.Pendiente,
                Notas = request.Notas
            };

            short orden = 0;
            foreach (var (item, producto, lotes) in lineasConLotes)
            {
                var condicion = ResolveCondicionEspecial(cliente, producto);

                decimal precio = item.PrecioUnitario
                    ?? (condicion?.Tipo is TipoCondicionEspecial.Precio or TipoCondicionEspecial.PrecioEspecial
                        ? condicion.Precio
                        : producto.PrecioVenta);

                decimal ivaPorc = GetIvaPorcentaje(cliente, producto);
                decimal rePorc = aplicaRE ? GetRecargoEquivalenciaPorcentaje(ivaPorc, tablaRE) : 0m;

                // Precedencia comercial: línea > condición especial > descuento cliente > descuento producto.
                decimal descuentoEfectivo = item.Descuento > 0
                    ? item.Descuento
                    : condicion?.Tipo == TipoCondicionEspecial.Descuento
                        ? condicion.Descuento
                        : cliente.DescuentoGeneral > 0
                            ? cliente.DescuentoGeneral
                            : (producto.DescuentoPorDefecto ?? 0m);

                foreach (var lote in lotes)
                {
                    albaran.Lineas.Add(new AlbaranLinea
                    {
                        ProductoId  = item.ProductoId,
                        LoteId      = lote.LoteId > 0 ? lote.LoteId : null,
                        Descripcion = producto.Nombre + (lote.LoteId > 0 ? $" (Lote: {lote.CodigoLote})" : ""),
                        Cantidad     = lote.Cantidad,
                        PrecioUnitario = precio,
                        Descuento    = descuentoEfectivo,
                        IvaPorcentaje = ivaPorc,
                        RecargoEquivalenciaPorcentaje = rePorc,
                        Orden = orden++
                    });
                }
            }

            // Calcular totales
            albaran.Subtotal = albaran.Lineas.Sum(l => l.Subtotal);
            albaran.IvaTotal = albaran.Lineas.Sum(l => l.IvaImporte);
            albaran.RecargoEquivalenciaTotal = Math.Round(albaran.Lineas.Sum(l => l.RecargoEquivalenciaImporte), 2);
            albaran.RetencionTotal = Math.Round(albaran.Subtotal * retencionPorc / 100, 2);
            albaran.Total = albaran.Subtotal + albaran.IvaTotal + albaran.RecargoEquivalenciaTotal - albaran.RetencionTotal;

            await _uow.Albaranes.AddAsync(albaran, ct);
            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            return Ok(ApiResponse<AlbaranCreado>.Ok(
                new AlbaranCreado(albaran.Id, albaran.NumeroAlbaran!, albaran.Total),
                $"Albarán {albaran.NumeroAlbaran} creado correctamente"));
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>
    /// POST /api/albaranes/{id}/convertir-factura
    /// Convierte un albarán en factura usando los lotes ya asignados en las líneas del albarán.
    /// NO relanza FIFO — garantiza trazabilidad: la factura refleja exactamente los lotes del albarán.
    /// </summary>
    [HttpPost("{id:int}/convertir-factura")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<FacturaCreada>>> ConvertirAFactura(
        int id, [FromBody] ConvertirAlbaranRequest request, CancellationToken ct)
    {
        var albaran = await _uow.Albaranes.GetConLineasAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<FacturaCreada>.Fail("Albarán no encontrado"));

        if (albaran.Estado == EstadoAlbaran.Facturado)
            return BadRequest(ApiResponse<FacturaCreada>.Fail("El albarán ya ha sido facturado"));

        var cliente = albaran.Cliente
            ?? await _uow.Clientes.GetByIdAsync(albaran.ClienteId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), albaran.ClienteId);

        if (cliente.NoRealizarFacturas)
            return BadRequest(ApiResponse<FacturaCreada>.Fail("Este cliente tiene configurado que no se le realicen facturas"));

        // RE y retención del cliente
        bool aplicaRE = cliente.TipoImpuesto == TipoImpuesto.RecargoEquivalencia
                     || cliente.RecargoEquivalencia;
        decimal retencionPorc = !cliente.NoAplicarRetenciones && cliente.PorcentajeRetencion > 0
            ? cliente.PorcentajeRetencion : 0m;

        // Cargar tabla de RE desde BD para la empresa
        var tablaRE = aplicaRE
            ? (await _uow.TiposIvaRe.FindAsync(t => t.EmpresaId == EmpresaId && t.Activo, ct))
                .ToDictionary(t => t.IvaPorcentaje, t => t.RecargoEquivalenciaPorcentaje)
            : new Dictionary<decimal, decimal>();

        // Obtener número de factura
        string numeroFactura = await _serieService.SiguienteNumeroAsync(EmpresaId, request.SerieId, ct);

        await _uow.BeginTransactionAsync(ct);
        try
        {
            var factura = new Factura
            {
                EmpresaId = EmpresaId,
                ClienteId = albaran.ClienteId,
                AlbaranId = albaran.Id,
                SerieId = request.SerieId,
                UsuarioId = UsuarioId,
                NumeroFactura = numeroFactura,
                FechaFactura = request.FechaFactura ?? DateOnly.FromDateTime(DateTime.Today),
                Estado = EstadoFactura.Emitida,
                EsSimplificada = request.EsSimplificada,
                Notas = albaran.Notas
            };

            // Construir líneas de factura directamente desde las líneas del albarán
            // (NO se relanza FIFO — se usan los lotes ya asignados)
            short orden = 0;
            foreach (var linea in albaran.Lineas.OrderBy(l => l.Orden))
            {
                decimal rePorc = aplicaRE ? GetRecargoEquivalenciaPorcentaje(linea.IvaPorcentaje, tablaRE) : 0m;
                factura.Lineas.Add(new FacturaLinea
                {
                    ProductoId = linea.ProductoId,
                    LoteId = linea.LoteId,
                    Descripcion = linea.Descripcion,
                    Cantidad = linea.Cantidad,
                    PrecioUnitario = linea.PrecioUnitario,
                    Descuento = linea.Descuento,
                    IvaPorcentaje = linea.IvaPorcentaje,
                    RecargoEquivalenciaPorcentaje = rePorc,
                    Orden = orden++
                });
            }

            // Calcular totales
            factura.Subtotal = factura.Lineas.Sum(l => l.Subtotal);
            factura.BaseImponible = factura.Subtotal - factura.DescuentoTotal;
            factura.IvaTotal = factura.Lineas.Sum(l => l.IvaImporte);
            factura.RecargoEquivalenciaTotal = Math.Round(factura.Lineas.Sum(l => l.RecargoEquivalenciaImporte), 2);
            factura.RetencionTotal = Math.Round(factura.BaseImponible * retencionPorc / 100, 2);
            factura.Total = factura.BaseImponible + factura.IvaTotal + factura.RecargoEquivalenciaTotal - factura.RetencionTotal;

            await _uow.Facturas.AddAsync(factura, ct);
            await _uow.SaveChangesAsync(ct);

            // Descontar stock y registrar trazabilidad para cada línea con lote
            foreach (var linea in albaran.Lineas.Where(l => l.LoteId.HasValue))
            {
                var stock = await _uow.Stock.GetByProductoLoteAsync(
                    EmpresaId, linea.ProductoId, linea.LoteId!.Value, ct)
                    ?? throw new DomainException($"Stock no encontrado: producto={linea.ProductoId}, lote={linea.LoteId}");

                decimal cantidadAntes = stock.CantidadDisponible;
                stock.CantidadDisponible -= linea.Cantidad;
                // Liberar la reserva que se creó al confirmar el pedido (si existía)
                stock.CantidadReservada = Math.Max(0, stock.CantidadReservada - linea.Cantidad);
                stock.UpdatedAt = DateTime.UtcNow;
                await _uow.Stock.UpdateAsync(stock, ct);

                await _uow.MovimientosStock.AddAsync(new MovimientoStock
                {
                    EmpresaId = EmpresaId,
                    ProductoId = linea.ProductoId,
                    LoteId = linea.LoteId!.Value,
                    Tipo = TipoMovimientoStock.Venta,
                    Cantidad = linea.Cantidad,
                    CantidadAntes = cantidadAntes,
                    CantidadDespues = stock.CantidadDisponible,
                    ReferenciaTipo = "factura",
                    ReferenciaId = factura.Id,
                    UsuarioId = UsuarioId
                }, ct);

                await _uow.Trazabilidades.AddAsync(new Trazabilidad
                {
                    EmpresaId = EmpresaId,
                    LoteId = linea.LoteId!.Value,
                    ProductoId = linea.ProductoId,
                    ClienteId = albaran.ClienteId,
                    FacturaId = factura.Id,
                    Cantidad = linea.Cantidad,
                    TipoOperacion = "venta_factura",
                    FechaOperacion = DateTime.UtcNow,
                    UsuarioId = UsuarioId
                }, ct);
            }

            await _uow.SaveChangesAsync(ct);

            // Marcar albarán como facturado
            albaran.Estado = EstadoAlbaran.Facturado;
            await _uow.Albaranes.UpdateAsync(albaran, ct);
            await _uow.SaveChangesAsync(ct);

            await _uow.CommitTransactionAsync(ct);

            return Ok(ApiResponse<FacturaCreada>.Ok(
                new FacturaCreada(factura.Id, numeroFactura, factura.Total),
                $"Factura {numeroFactura} generada desde albarán {albaran.NumeroAlbaran}"));
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>POST /api/albaranes/{id}/entregar — Marcar albarán como entregado</summary>
    [HttpPost("{id:int}/entregar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Entregar(int id, CancellationToken ct)
    {
        var albaran = await _uow.Albaranes.GetByIdAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Albarán no encontrado"));

        albaran.Estado = EstadoAlbaran.Entregado;
        await _uow.Albaranes.UpdateAsync(albaran, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("OK", "Albarán marcado como entregado"));
    }

    /// <summary>POST /api/albaranes/{id}/en-reparto — Marcar albarán como EnReparto</summary>
    [HttpPost("{id:int}/en-reparto")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> MarcarEnReparto(int id, CancellationToken ct)
    {
        var albaran = await _uow.Albaranes.GetByIdAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Albarán no encontrado"));
        if (albaran.Estado != EstadoAlbaran.Pendiente)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden enviar a reparto albaranes en estado Pendiente"));

        albaran.Estado = EstadoAlbaran.EnReparto;
        await _uow.Albaranes.UpdateAsync(albaran, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Albarán en reparto"));
    }

    /// <summary>POST /api/albaranes/{id}/cancelar — Cancelar albarán y devolver stock consumido</summary>
    [HttpPost("{id:int}/cancelar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Cancelar(int id, CancellationToken ct)
    {
        var albaran = await _uow.Albaranes.GetConLineasAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Albarán no encontrado"));
        if (albaran.Estado == EstadoAlbaran.Facturado)
            return BadRequest(ApiResponse<string>.Fail("No se puede cancelar un albarán ya facturado"));
        if (albaran.Estado == EstadoAlbaran.Cancelado)
            return BadRequest(ApiResponse<string>.Fail("El albarán ya está cancelado"));

        await _uow.BeginTransactionAsync(ct);
        try
        {
            // Solo se repone stock si hubo consumo real previo asociado al albarán (escenario legacy).
            var ventasAsociadas = await _uow.MovimientosStock.GetQueryable()
                .Where(m => m.EmpresaId == EmpresaId
                    && m.ReferenciaId == albaran.Id
                    && m.Tipo == TipoMovimientoStock.Venta
                    && (m.ReferenciaTipo == "albaran" || m.ReferenciaTipo == "venta_albaran"))
                .ToListAsync(ct);

            foreach (var mov in ventasAsociadas)
            {
                var stock = await _uow.Stock.GetByProductoLoteAsync(EmpresaId, mov.ProductoId, mov.LoteId, ct);
                if (stock == null)
                    continue;

                decimal cantidadAntes = stock.CantidadDisponible;
                stock.CantidadDisponible += mov.Cantidad;
                stock.UpdatedAt = DateTime.UtcNow;
                await _uow.Stock.UpdateAsync(stock, ct);

                await _uow.MovimientosStock.AddAsync(new MovimientoStock
                {
                    EmpresaId = EmpresaId,
                    ProductoId = mov.ProductoId,
                    LoteId = mov.LoteId,
                    Tipo = TipoMovimientoStock.Devolucion,
                    Cantidad = mov.Cantidad,
                    CantidadAntes = cantidadAntes,
                    CantidadDespues = stock.CantidadDisponible,
                    ReferenciaTipo = "cancelacion_albaran",
                    ReferenciaId = albaran.Id,
                    UsuarioId = UsuarioId,
                    Notas = $"Devolución por cancelación de albarán {albaran.NumeroAlbaran}"
                }, ct);
            }

            albaran.Estado = EstadoAlbaran.Cancelado;
            await _uow.Albaranes.UpdateAsync(albaran, ct);
            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            var msg = ventasAsociadas.Count > 0
                ? "Albarán cancelado y stock restituido"
                : "Albarán cancelado (sin devolución de stock, no existía consumo previo)";
            return Ok(ApiResponse<string>.Ok("OK", msg));
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>GET /api/albaranes/{id}/pdf — Generar PDF del albarán</summary>
    [HttpGet("{id:int}/pdf")]
    public async Task<IActionResult> GetPdf(int id, CancellationToken ct)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var albaran = await _uow.Albaranes.GetConLineasAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Albarán no encontrado"));

        var empresa = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(1.5f, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Arial"));

                // ─── HEADER ───────────────────────────────────────────────
                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text(empresa?.RazonSocial ?? empresa?.Nombre ?? "BuenaTierra")
                                .Bold().FontSize(14);
                            if (empresa != null)
                            {
                                c.Item().Text($"NIF: {empresa.Nif}");
                                if (empresa.Direccion != null)
                                    c.Item().Text(empresa.Direccion);
                                if (empresa.Ciudad != null)
                                    c.Item().Text($"{empresa.CodigoPostal} {empresa.Ciudad} ({empresa.Provincia})");
                                if (empresa.Telefono != null)
                                    c.Item().Text($"Tel: {empresa.Telefono}");
                            }
                        });

                        row.ConstantItem(200).Column(c =>
                        {
                            c.Item().AlignRight().Text("ALBARÁN")
                                .Bold().FontSize(18).FontColor("#2980B9");
                            c.Item().AlignRight().Text($"Nº: {albaran.NumeroAlbaran}").Bold().FontSize(11);
                            c.Item().AlignRight().Text($"Fecha: {albaran.FechaAlbaran:dd/MM/yyyy}");
                            c.Item().AlignRight().Text($"Estado: {albaran.Estado}");
                        });
                    });

                    col.Item().PaddingTop(5).LineHorizontal(1).LineColor("#2980B9");

                    col.Item().PaddingTop(8).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("CLIENTE").Bold().FontSize(8).FontColor("#888888");
                            c.Item().Text(albaran.Cliente?.NombreCompleto ?? "—").Bold();
                            if (albaran.Cliente?.Nif != null)
                                c.Item().Text($"NIF/CIF: {albaran.Cliente.Nif}");
                            if (albaran.Cliente?.Direccion != null)
                                c.Item().Text(albaran.Cliente.Direccion);
                            if (albaran.Cliente?.Ciudad != null)
                                c.Item().Text($"{albaran.Cliente.CodigoPostal} {albaran.Cliente.Ciudad}");
                        });
                    });

                    col.Item().PaddingTop(8).LineHorizontal(0.5f).LineColor("#DDDDDD");
                });

                // ─── CONTENT ──────────────────────────────────────────────
                page.Content().PaddingTop(10).Column(col =>
                {
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(3);
                            cols.RelativeColumn(2);
                            cols.RelativeColumn(1.5f);
                            cols.RelativeColumn(1.5f);
                            cols.ConstantColumn(45);
                            cols.ConstantColumn(55);
                            cols.ConstantColumn(35);
                            cols.ConstantColumn(35);
                            cols.ConstantColumn(60);
                        });

                        static IContainer HeaderCell(IContainer container) =>
                            container.Background("#2980B9").Padding(4).AlignCenter();

                        table.Header(header =>
                        {
                            header.Cell().Element(HeaderCell).Text("Producto").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Nº Lote").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("F. Fabricación").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("F. Caducidad").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Cant.").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Precio").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Dto%").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("IVA%").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Total").Bold().FontColor(Colors.White).FontSize(8);
                        });

                        bool odd = true;
                        foreach (var linea in albaran.Lineas.OrderBy(l => l.Orden))
                        {
                            string bg = odd ? "#FFFFFF" : "#F9F9F9";
                            odd = !odd;

                            IContainer BodyCell(IContainer c) => c.Background(bg).Padding(3);
                            IContainer BodyCellRight(IContainer c) => c.Background(bg).Padding(3).AlignRight();

                            decimal subtotal = Math.Round(linea.Cantidad * linea.PrecioUnitario * (1 - linea.Descuento / 100), 2);

                            table.Cell().Element(BodyCell).Text(linea.Producto?.Nombre ?? linea.Descripcion ?? "").FontSize(8);
                            table.Cell().Element(BodyCell).Text(linea.Lote?.CodigoLote ?? "—").FontSize(8);
                            table.Cell().Element(BodyCell).Text(linea.Lote?.FechaFabricacion.ToString("dd/MM/yyyy") ?? "—").FontSize(8);
                            table.Cell().Element(BodyCell).Text(linea.Lote?.FechaCaducidad?.ToString("dd/MM/yyyy") ?? "—").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.Cantidad:N2}").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.PrecioUnitario:N4} €").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.Descuento:N1}%").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.IvaPorcentaje:N0}%").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{subtotal:N2} €").FontSize(8).Bold();
                        }
                    });

                    col.Item().PaddingTop(12).AlignRight().Table(totales =>
                    {
                        totales.ColumnsDefinition(c =>
                        {
                            c.ConstantColumn(130);
                            c.ConstantColumn(80);
                        });

                        IContainer TotalLabel(IContainer c) => c.Background("#F5F5F5").Padding(4).AlignRight();
                        IContainer TotalValue(IContainer c) => c.Background("#FFFFFF").Padding(4).AlignRight().BorderLeft(0.5f, Unit.Point).BorderColor("#DDDDDD");
                        IContainer TotalLabelBold(IContainer c) => c.Background("#2980B9").Padding(4).AlignRight();
                        IContainer TotalValueBold(IContainer c) => c.Background("#2980B9").Padding(4).AlignRight();

                        totales.Cell().Element(TotalLabel).Text("Base Imponible:").FontSize(9);
                        totales.Cell().Element(TotalValue).Text($"{albaran.Subtotal:N2} €").FontSize(9);

                        totales.Cell().Element(TotalLabel).Text("IVA:").FontSize(9);
                        totales.Cell().Element(TotalValue).Text($"{albaran.IvaTotal:N2} €").FontSize(9);

                        if (albaran.RecargoEquivalenciaTotal > 0)
                        {
                            totales.Cell().Element(TotalLabel).Text("Recargo Equivalencia:").FontSize(9);
                            totales.Cell().Element(TotalValue).Text($"{albaran.RecargoEquivalenciaTotal:N2} €").FontSize(9);
                        }

                        if (albaran.RetencionTotal > 0)
                        {
                            totales.Cell().Element(TotalLabel).Text("Retención (-):").FontSize(9);
                            totales.Cell().Element(TotalValue).Text($"-{albaran.RetencionTotal:N2} €").FontSize(9).FontColor("#C0392B");
                        }

                        totales.Cell().Element(TotalLabelBold).Text("TOTAL:").Bold().FontSize(11).FontColor(Colors.White);
                        totales.Cell().Element(TotalValueBold).Text($"{albaran.Total:N2} €").Bold().FontSize(11).FontColor(Colors.White);
                    });

                    if (!string.IsNullOrWhiteSpace(albaran.Notas))
                    {
                        col.Item().PaddingTop(12).Column(c =>
                        {
                            c.Item().Text("Notas:").Bold().FontSize(8).FontColor("#888888");
                            c.Item().Text(albaran.Notas).FontSize(8);
                        });
                    }
                });

                // ─── FOOTER ───────────────────────────────────────────────
                page.Footer().Column(col =>
                {
                    col.Item().LineHorizontal(0.5f).LineColor("#DDDDDD");
                    col.Item().PaddingTop(4).Row(row =>
                    {
                        row.RelativeItem().Text(
                            "Trazabilidad conforme al Reglamento (CE) Nº 178/2002 del Parlamento Europeo. " +
                            "Los lotes indicados permiten la trazabilidad completa del producto.")
                            .FontSize(7).FontColor("#888888").Italic();
                        row.ConstantItem(60).AlignRight().Text(text =>
                        {
                            text.Span("Página ").FontSize(7).FontColor("#888888");
                            text.CurrentPageNumber().FontSize(7).FontColor("#888888");
                            text.Span(" / ").FontSize(7).FontColor("#888888");
                            text.TotalPages().FontSize(7).FontColor("#888888");
                        });
                    });
                });
            });
        });

        var bytes = doc.GeneratePdf();
        return File(bytes, "application/pdf", $"Albaran_{albaran.NumeroAlbaran}.pdf");
    }

    /// <summary>GET /api/albaranes/{id}/excel — Descargar Excel de albarán con líneas y lotes</summary>
    [HttpGet("{id:int}/excel")]
    public async Task<IActionResult> GetExcel(int id, CancellationToken ct)
    {
        ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");

        var albaran = await _uow.Albaranes.GetConLineasAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Albarán no encontrado"));

        using var package = new ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Albaran");

        ws.Cells["A1"].Value = "ALBARÁN";
        ws.Cells["A1"].Style.Font.Size = 16;
        ws.Cells["A1"].Style.Font.Bold = true;

        ws.Cells["A3"].Value = "Número";
        ws.Cells["B3"].Value = albaran.NumeroAlbaran;
        ws.Cells["A4"].Value = "Fecha";
        ws.Cells["B4"].Value = albaran.FechaAlbaran.ToDateTime(TimeOnly.MinValue);
        ws.Cells["B4"].Style.Numberformat.Format = "dd/mm/yyyy";
        ws.Cells["A5"].Value = "Estado";
        ws.Cells["B5"].Value = albaran.Estado.ToString();
        ws.Cells["A6"].Value = "Pedido origen";
        ws.Cells["B6"].Value = albaran.PedidoId?.ToString() ?? "";

        ws.Cells["A7"].Value = "Cliente";
        ws.Cells["B7"].Value = albaran.Cliente?.NombreCompleto;
        ws.Cells["A8"].Value = "NIF Cliente";
        ws.Cells["B8"].Value = albaran.Cliente?.Nif;

        int headerRow = 10;
        string[] headers =
        [
            "Producto", "Lote", "F. Fabricación", "F. Caducidad", "Cantidad",
            "Precio Unitario", "Descuento %", "IVA %", "RE %", "Subtotal", "IVA Importe", "RE Importe", "Total Línea"
        ];

        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cells[headerRow, i + 1].Value = headers[i];
            ws.Cells[headerRow, i + 1].Style.Font.Bold = true;
            ws.Cells[headerRow, i + 1].Style.Fill.PatternType = ExcelFillStyle.Solid;
            ws.Cells[headerRow, i + 1].Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(41, 128, 185));
            ws.Cells[headerRow, i + 1].Style.Font.Color.SetColor(System.Drawing.Color.White);
        }

        int row = headerRow + 1;
        foreach (var l in albaran.Lineas.OrderBy(x => x.Orden))
        {
            decimal subtotal = Math.Round(l.Cantidad * l.PrecioUnitario * (1 - l.Descuento / 100), 4);
            decimal iva = Math.Round(subtotal * l.IvaPorcentaje / 100, 4);
            decimal re = Math.Round(subtotal * l.RecargoEquivalenciaPorcentaje / 100, 4);

            ws.Cells[row, 1].Value = l.Producto?.Nombre ?? l.Descripcion;
            ws.Cells[row, 2].Value = l.Lote?.CodigoLote ?? "";
            ws.Cells[row, 3].Value = l.Lote != null ? l.Lote.FechaFabricacion.ToDateTime(TimeOnly.MinValue) : (object)"";
            ws.Cells[row, 4].Value = l.Lote?.FechaCaducidad.HasValue == true
                ? l.Lote.FechaCaducidad.Value.ToDateTime(TimeOnly.MinValue)
                : (object)"";
            ws.Cells[row, 5].Value = l.Cantidad;
            ws.Cells[row, 6].Value = l.PrecioUnitario;
            ws.Cells[row, 7].Value = l.Descuento;
            ws.Cells[row, 8].Value = l.IvaPorcentaje / 100;
            ws.Cells[row, 9].Value = l.RecargoEquivalenciaPorcentaje / 100;
            ws.Cells[row, 10].Value = subtotal;
            ws.Cells[row, 11].Value = iva;
            ws.Cells[row, 12].Value = re;
            ws.Cells[row, 13].Value = subtotal + iva + re;

            ws.Cells[row, 3].Style.Numberformat.Format = "dd/mm/yyyy";
            ws.Cells[row, 4].Style.Numberformat.Format = "dd/mm/yyyy";
            ws.Cells[row, 5].Style.Numberformat.Format = "#,##0.000";
            ws.Cells[row, 6].Style.Numberformat.Format = "#,##0.0000 €";
            ws.Cells[row, 7].Style.Numberformat.Format = "0.00";
            ws.Cells[row, 8].Style.Numberformat.Format = "0.00%";
            ws.Cells[row, 9].Style.Numberformat.Format = "0.00%";
            ws.Cells[row, 10].Style.Numberformat.Format = "#,##0.0000 €";
            ws.Cells[row, 11].Style.Numberformat.Format = "#,##0.0000 €";
            ws.Cells[row, 12].Style.Numberformat.Format = "#,##0.0000 €";
            ws.Cells[row, 13].Style.Numberformat.Format = "#,##0.0000 €";
            row++;
        }

        ws.Cells[row + 1, 11].Value = "BASE";
        ws.Cells[row + 1, 12].Value = albaran.Subtotal;
        ws.Cells[row + 2, 11].Value = "IVA";
        ws.Cells[row + 2, 12].Value = albaran.IvaTotal;
        ws.Cells[row + 3, 11].Value = "RE";
        ws.Cells[row + 3, 12].Value = albaran.RecargoEquivalenciaTotal;
        ws.Cells[row + 4, 11].Value = "RETENCION (-)";
        ws.Cells[row + 4, 12].Value = albaran.RetencionTotal;
        ws.Cells[row + 5, 11].Value = "TOTAL";
        ws.Cells[row + 5, 12].Value = albaran.Total;

        ws.Cells[row + 1, 12, row + 5, 12].Style.Numberformat.Format = "#,##0.00 €";
        ws.Cells.AutoFitColumns();

        var bytes = package.GetAsByteArray();
        return File(bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"albaran-{albaran.NumeroAlbaran ?? albaran.Id.ToString()}.xlsx");
    }

    /// <summary>GET /api/albaranes/exportar-excel — Exporta listado de albaranes</summary>
    [HttpGet("exportar-excel")]
    public async Task<IActionResult> ExportarListaExcel(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, CancellationToken ct)
    {
        ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");

        var albaranes = (await _uow.Albaranes.GetByEmpresaAsync(EmpresaId, desde, hasta, ct)).ToList();

        using var package = new ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Albaranes");

        string[] headers = { "Nº Albarán", "Fecha", "Cliente", "NIF", "Estado", "Base", "IVA", "RE", "Retención", "Total" };
        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cells[1, i + 1].Value = headers[i];
            ws.Cells[1, i + 1].Style.Font.Bold = true;
            ws.Cells[1, i + 1].Style.Fill.PatternType = ExcelFillStyle.Solid;
            ws.Cells[1, i + 1].Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(41, 128, 185));
            ws.Cells[1, i + 1].Style.Font.Color.SetColor(System.Drawing.Color.White);
        }

        int row = 2;
        foreach (var a in albaranes)
        {
            ws.Cells[row, 1].Value = a.NumeroAlbaran;
            ws.Cells[row, 2].Value = a.FechaAlbaran.ToDateTime(TimeOnly.MinValue);
            ws.Cells[row, 3].Value = a.Cliente?.NombreCompleto;
            ws.Cells[row, 4].Value = a.Cliente?.Nif;
            ws.Cells[row, 5].Value = a.Estado.ToString();
            ws.Cells[row, 6].Value = a.Subtotal;
            ws.Cells[row, 7].Value = a.IvaTotal;
            ws.Cells[row, 8].Value = a.RecargoEquivalenciaTotal;
            ws.Cells[row, 9].Value = a.RetencionTotal;
            ws.Cells[row, 10].Value = a.Total;
            row++;
        }

        ws.Cells[2, 2, Math.Max(2, row - 1), 2].Style.Numberformat.Format = "dd/mm/yyyy";
        ws.Cells[2, 6, Math.Max(2, row - 1), 10].Style.Numberformat.Format = "#,##0.00 €";
        ws.Cells.AutoFitColumns();

        var bytes = package.GetAsByteArray();
        var dStr = (desde ?? DateOnly.FromDateTime(DateTime.Today.AddMonths(-1))).ToString("yyyyMMdd");
        var hStr = (hasta ?? DateOnly.FromDateTime(DateTime.Today)).ToString("yyyyMMdd");
        return File(bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"albaranes-{dStr}-{hStr}.xlsx");
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────────

    private static decimal GetIvaPorcentaje(Cliente cliente, Producto producto)
        => cliente.TipoImpuesto switch
        {
            TipoImpuesto.Exento => 0m,
            TipoImpuesto.IGIC => 7m,
            _ => cliente.AplicarImpuesto ? producto.IvaPorcentaje : 0m
        };

    /// <summary>
    /// Obtiene el porcentaje de RE desde la tabla tipos_iva_re de la empresa.
    /// Si la empresa tiene configuración explícita, no aplica fallback hardcodeado.
    /// Solo usa tasas legales por defecto cuando no existe ninguna tabla configurada.
    /// </summary>
    private static decimal GetRecargoEquivalenciaPorcentaje(
        decimal ivaPorcentaje, Dictionary<decimal, decimal> tablaRE)
    {
        if (tablaRE.TryGetValue(ivaPorcentaje, out var reDesdeDB))
            return reDesdeDB;

        if (tablaRE.Count > 0)
            return 0m;

        return ivaPorcentaje switch { 21m => 5.2m, 10m => 1.4m, 4m => 0.5m, _ => 0m };
    }

    private static ClienteCondicionEspecial? ResolveCondicionEspecial(Cliente cliente, Producto producto)
    {
        if (cliente.CondicionesEspeciales == null || cliente.CondicionesEspeciales.Count == 0)
            return null;

        string[] clavesProducto =
        [
            producto.Codigo?.Trim().ToUpperInvariant() ?? string.Empty,
            producto.Referencia?.Trim().ToUpperInvariant() ?? string.Empty,
            producto.Id.ToString()
        ];

        string categoriaId = producto.CategoriaId?.ToString() ?? string.Empty;

        bool EsGlobal(string? codigo)
            => string.IsNullOrWhiteSpace(codigo)
            || codigo.Trim() == "*"
            || codigo.Trim().Equals("TODOS", StringComparison.OrdinalIgnoreCase)
            || codigo.Trim().Equals("ALL", StringComparison.OrdinalIgnoreCase);

        bool MatchCodigoProducto(string? codigo)
        {
            if (EsGlobal(codigo)) return true;
            var key = codigo!.Trim().ToUpperInvariant();
            return clavesProducto.Any(c => !string.IsNullOrEmpty(c) && c == key);
        }

        bool MatchFamilia(string? codigo)
        {
            if (EsGlobal(codigo)) return true;
            var key = codigo!.Trim();
            return !string.IsNullOrEmpty(categoriaId)
                && string.Equals(categoriaId, key, StringComparison.OrdinalIgnoreCase);
        }

        var exactaArticulo = cliente.CondicionesEspeciales
            .Where(c => c.ArticuloFamilia == TipoArticuloFamilia.Articulo)
            .FirstOrDefault(c => !EsGlobal(c.Codigo) && MatchCodigoProducto(c.Codigo));
        if (exactaArticulo != null) return exactaArticulo;

        var exactaFamilia = cliente.CondicionesEspeciales
            .Where(c => c.ArticuloFamilia == TipoArticuloFamilia.Familia)
            .FirstOrDefault(c => !EsGlobal(c.Codigo) && MatchFamilia(c.Codigo));
        if (exactaFamilia != null) return exactaFamilia;

        return cliente.CondicionesEspeciales.FirstOrDefault(c => EsGlobal(c.Codigo));
    }

    private static AlbaranDetalle MapToDetalle(Albaran a) => new(
        a.Id,
        a.NumeroAlbaran ?? $"ALB-{a.Id}",
        a.FechaAlbaran.ToString("yyyy-MM-dd"),
        a.Estado.ToString(),
        new ClienteResumen(a.Cliente?.Id ?? 0, a.Cliente?.NombreCompleto ?? "", a.Cliente?.Nif),
        a.Subtotal, a.IvaTotal, a.Total, a.PedidoId, a.Notas,
        a.Lineas.OrderBy(l => l.Orden).Select(l => new AlbaranLineaDto(
            l.ProductoId,
            l.Producto?.Nombre ?? l.Descripcion ?? "",
            l.Lote?.CodigoLote,
            l.Lote?.FechaFabricacion,
            l.Lote?.FechaCaducidad,
            l.Cantidad, l.PrecioUnitario, l.Descuento, l.IvaPorcentaje,
            Math.Round(l.Cantidad * l.PrecioUnitario * (1 - l.Descuento / 100), 4),
            Math.Round(l.Cantidad * l.PrecioUnitario * (1 - l.Descuento / 100) * l.IvaPorcentaje / 100, 4)
        )).ToList(),
        a.Cliente?.NoRealizarFacturas ?? false
    );
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

public record AlbaranResumen(
    int Id, string NumeroAlbaran, string Fecha, string Estado,
    string ClienteNombre, string? ClienteNif, decimal Total, int? PedidoId,
    bool NoRealizarFacturas = false);

public record AlbaranCreado(int Id, string NumeroAlbaran, decimal Total);

public record AlbaranDetalle(
    int Id, string NumeroAlbaran, string Fecha, string Estado,
    ClienteResumen Cliente, decimal Subtotal, decimal IvaTotal, decimal Total,
    int? PedidoId, string? Notas, List<AlbaranLineaDto> Lineas,
    bool ClienteNoRealizarFacturas = false);

public record AlbaranLineaDto(
    int ProductoId, string ProductoNombre, string? CodigoLote,
    DateOnly? FechaFabricacion, DateOnly? FechaCaducidad,
    decimal Cantidad, decimal PrecioUnitario, decimal Descuento,
    decimal IvaPorcentaje, decimal Subtotal, decimal IvaImporte);

public class CrearAlbaranRequest
{
    public int EmpresaId { get; set; }
    public int ClienteId { get; set; }
    public int? PedidoId { get; set; }
    public int? SerieId { get; set; }
    public int UsuarioId { get; set; }
    public DateOnly FechaAlbaran { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public string? Notas { get; set; }
    public List<LineaAlbaranRequest> Items { get; set; } = new();
}

public class LineaAlbaranRequest
{
    public int ProductoId { get; set; }
    public decimal Cantidad { get; set; }
    public decimal? PrecioUnitario { get; set; }
    public decimal Descuento { get; set; } = 0;
}

public class ConvertirAlbaranRequest
{
    public int SerieId { get; set; }
    public DateOnly? FechaFactura { get; set; }
    public bool EsSimplificada { get; set; } = false;
}
