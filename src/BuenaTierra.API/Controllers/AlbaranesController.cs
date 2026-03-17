using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

    /// <summary>GET /api/albaranes — Listar albaranes con filtros opcionales de fecha</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<AlbaranResumen>>>> GetAll(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, CancellationToken ct)
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
        ));
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

        // Validar cliente
        var cliente = await _uow.Clientes.GetByIdAsync(request.ClienteId, ct)
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
                decimal precio = item.PrecioUnitario ?? producto.PrecioVenta;
                decimal rePorc = aplicaRE ? GetRecargoEquivalenciaPorcentaje(producto.IvaPorcentaje, tablaRE) : 0m;
                // Aplicar descuento de línea; fallback al descuento general del cliente
                decimal descuentoEfectivo = item.Descuento > 0 ? item.Descuento : cliente.DescuentoGeneral;

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
                        IvaPorcentaje = producto.IvaPorcentaje,
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
            // Devolver stock de cada línea con lote asignado
            foreach (var linea in albaran.Lineas.Where(l => l.LoteId.HasValue))
            {
                var stock = await _uow.Stock.GetByProductoLoteAsync(
                    EmpresaId, linea.ProductoId, linea.LoteId!.Value, ct);

                if (stock != null)
                {
                    decimal cantidadAntes = stock.CantidadDisponible;
                    stock.CantidadDisponible += linea.Cantidad;
                    stock.UpdatedAt = DateTime.UtcNow;
                    await _uow.Stock.UpdateAsync(stock, ct);

                    // Movimiento de stock (devolución)
                    await _uow.MovimientosStock.AddAsync(new MovimientoStock
                    {
                        EmpresaId = EmpresaId,
                        ProductoId = linea.ProductoId,
                        LoteId = linea.LoteId!.Value,
                        Tipo = TipoMovimientoStock.Devolucion,
                        Cantidad = linea.Cantidad,
                        CantidadAntes = cantidadAntes,
                        CantidadDespues = stock.CantidadDisponible,
                        ReferenciaTipo = "cancelacion_albaran",
                        ReferenciaId = albaran.Id,
                        UsuarioId = UsuarioId,
                        Notas = $"Devolución por cancelación de albarán {albaran.NumeroAlbaran}"
                    }, ct);
                }
            }

            albaran.Estado = EstadoAlbaran.Cancelado;
            await _uow.Albaranes.UpdateAsync(albaran, ct);
            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            return Ok(ApiResponse<string>.Ok("OK", "Albarán cancelado y stock devuelto"));
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

    // ─── HELPERS ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Obtiene el porcentaje de RE desde la tabla tipos_iva_re de la empresa.
    /// Fallback a tasas legales por defecto (España) si no hay match.
    /// </summary>
    private static decimal GetRecargoEquivalenciaPorcentaje(
        decimal ivaPorcentaje, Dictionary<decimal, decimal> tablaRE)
    {
        if (tablaRE.TryGetValue(ivaPorcentaje, out var reDesdeDB))
            return reDesdeDB;
        return ivaPorcentaje switch { 21m => 5.2m, 10m => 1.4m, 4m => 0.5m, _ => 0m };
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
