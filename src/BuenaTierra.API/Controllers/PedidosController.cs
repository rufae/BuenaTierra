using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Domain.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.Security.Claims;
using System.Text.Json;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PedidosController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly ILoteAsignacionService _loteService;
    private readonly ISerieFacturacionService _serieService;
    private readonly IFacturaService _facturaService;

    public PedidosController(
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

    /// <summary>GET /api/pedidos — Listar pedidos de la empresa (con paginación opcional)</summary>
    [HttpGet]
    public async Task<ActionResult> GetAll(
        [FromQuery] int? page = null, [FromQuery] int? pageSize = null,
        CancellationToken ct = default)
    {
        var pedidos = await _uow.Pedidos.GetByEmpresaAsync(EmpresaId, ct);
        var resultado = pedidos.Select(p => new PedidoResumen(
            p.Id, p.NumeroPedido ?? $"PED-{p.Id}",
            p.FechaPedido.ToString("yyyy-MM-dd"),
            p.FechaEntrega?.ToString("yyyy-MM-dd"),
            p.Estado.ToString(),
            p.Cliente?.NombreCompleto ?? "",
            p.Total,
            p.Cliente?.NoRealizarFacturas ?? false
        )).ToList();

        var pg = new PaginationParams(page, pageSize);
        if (pg.HasPagination)
        {
            var paged = resultado.Skip((pg.SafePage - 1) * pg.SafePageSize).Take(pg.SafePageSize);
            return Ok(PagedResponse<PedidoResumen>.Ok(paged, resultado.Count, pg.SafePage, pg.SafePageSize));
        }
        return Ok(ApiResponse<IEnumerable<PedidoResumen>>.Ok(resultado));
    }

    /// <summary>
    /// GET /api/pedidos/exportar-excel — Exporta la lista de pedidos a Excel
    /// con formato sanitario: 1 fila por producto-lote.
    /// </summary>
    [HttpGet("exportar-excel")]
    public async Task<IActionResult> ExportarListaExcel(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, CancellationToken ct)
    {
        IQueryable<Pedido> q = _uow.Pedidos.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId)
            .Include(p => p.Cliente)
            .Include(p => p.Lineas).ThenInclude(l => l.Producto);

        if (desde.HasValue) q = q.Where(p => p.FechaPedido >= desde.Value);
        if (hasta.HasValue) q = q.Where(p => p.FechaPedido <= hasta.Value);

        var list = await q.OrderByDescending(p => p.FechaPedido).ToListAsync(ct);

        // Fallback para pedidos antiguos: reconstruir lotes desde albaranes vinculados
        // cuando la línea no tenga reserva_lotes_json.
        var pedidoIds = list.Select(p => p.Id).ToList();
        var albaranesPorPedidoProducto = await _uow.Albaranes.GetQueryable()
            .Where(a => a.EmpresaId == EmpresaId && a.PedidoId.HasValue && pedidoIds.Contains(a.PedidoId.Value))
            .Include(a => a.Lineas).ThenInclude(l => l.Lote)
            .SelectMany(a => a.Lineas.Select(l => new
            {
                PedidoId = a.PedidoId!.Value,
                l.ProductoId,
                CodigoLote = l.Lote != null ? l.Lote.CodigoLote : "Sin lote",
                l.Cantidad
            }))
            .ToListAsync(ct);

        var lotesFallback = albaranesPorPedidoProducto
            .GroupBy(x => (x.PedidoId, x.ProductoId))
            .ToDictionary(
                g => g.Key,
                g => g.Select(x => new ReservaLoteItem(0, x.CodigoLote, x.Cantidad)).ToList());

        OfficeOpenXml.ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");
        using var package = new OfficeOpenXml.ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Pedidos");

        ws.Cells[1, 1].Value = "Nº Pedido";
        ws.Cells[1, 2].Value = "Fecha";
        ws.Cells[1, 3].Value = "Cliente";
        ws.Cells[1, 4].Value = "NIF Cliente";
        ws.Cells[1, 5].Value = "Dirección";
        ws.Cells[1, 6].Value = "Estado";
        ws.Cells[1, 7].Value = "Producto";
        ws.Cells[1, 8].Value = "Lote";
        ws.Cells[1, 9].Value = "Cantidad";

        using (var headerRange = ws.Cells[1, 1, 1, 9])
        {
            headerRange.Style.Font.Bold = true;
            headerRange.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            headerRange.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(68, 114, 196));
            headerRange.Style.Font.Color.SetColor(System.Drawing.Color.White);
        }

        int row = 2;
        foreach (var p in list)
        {
            var cli = p.Cliente;
            var direccion = cli != null
                ? string.Join(", ", new[] { cli.Direccion, cli.CodigoPostal, cli.Ciudad, cli.Provincia }
                    .Where(s => !string.IsNullOrWhiteSpace(s)))
                : "—";

            var lineas = p.Lineas.Any() ? p.Lineas : new List<PedidoLinea>();
            if (!lineas.Any())
            {
                ws.Cells[row, 1].Value = p.NumeroPedido;
                ws.Cells[row, 2].Value = p.FechaPedido.ToString("dd/MM/yyyy");
                ws.Cells[row, 3].Value = cli?.NombreCompleto ?? cli?.Nombre ?? "—";
                ws.Cells[row, 4].Value = cli?.Nif ?? "—";
                ws.Cells[row, 5].Value = direccion;
                ws.Cells[row, 6].Value = p.Estado.ToString();
                ws.Cells[row, 7].Value = "—";
                ws.Cells[row, 8].Value = "—";
                ws.Cells[row, 9].Value = 0;
                row++;
                continue;
            }

            foreach (var l in lineas.OrderBy(x => x.Orden))
            {
                List<ReservaLoteItem>? reservas = null;
                if (!string.IsNullOrWhiteSpace(l.ReservaLotesJson))
                {
                    try
                    {
                        reservas = JsonSerializer.Deserialize<List<ReservaLoteItem>>(l.ReservaLotesJson!);
                    }
                    catch (JsonException)
                    {
                        // Si hay datos históricos corruptos, no rompemos exportación.
                        reservas = null;
                    }
                }

                if ((reservas == null || reservas.Count == 0)
                    && lotesFallback.TryGetValue((p.Id, l.ProductoId), out var reservasDesdeAlbaran)
                    && reservasDesdeAlbaran.Count > 0)
                {
                    reservas = reservasDesdeAlbaran;
                }

                if (reservas != null && reservas.Count > 0)
                {
                    foreach (var r in reservas)
                    {
                        ws.Cells[row, 1].Value = p.NumeroPedido;
                        ws.Cells[row, 2].Value = p.FechaPedido.ToString("dd/MM/yyyy");
                        ws.Cells[row, 3].Value = cli?.NombreCompleto ?? cli?.Nombre ?? "—";
                        ws.Cells[row, 4].Value = cli?.Nif ?? "—";
                        ws.Cells[row, 5].Value = direccion;
                        ws.Cells[row, 6].Value = p.Estado.ToString();
                        ws.Cells[row, 7].Value = l.Producto?.Nombre ?? l.Descripcion ?? "Producto";
                        ws.Cells[row, 8].Value = string.IsNullOrWhiteSpace(r.CodigoLote) ? "Sin lote" : r.CodigoLote;
                        ws.Cells[row, 9].Value = (int)Math.Round(r.Cantidad, 0, MidpointRounding.AwayFromZero);
                        row++;
                    }
                    continue;
                }

                ws.Cells[row, 1].Value = p.NumeroPedido;
                ws.Cells[row, 2].Value = p.FechaPedido.ToString("dd/MM/yyyy");
                ws.Cells[row, 3].Value = cli?.NombreCompleto ?? cli?.Nombre ?? "—";
                ws.Cells[row, 4].Value = cli?.Nif ?? "—";
                ws.Cells[row, 5].Value = direccion;
                ws.Cells[row, 6].Value = p.Estado.ToString();
                ws.Cells[row, 7].Value = l.Producto?.Nombre ?? l.Descripcion ?? "Producto";
                ws.Cells[row, 8].Value = "Sin lote";
                ws.Cells[row, 9].Value = (int)Math.Round(l.Cantidad, 0, MidpointRounding.AwayFromZero);
                row++;
            }
        }

        ws.Cells.AutoFitColumns();
        if (ws.Cells[1, 5].Value != null) ws.Column(5).Width = Math.Min(ws.Column(5).Width, 55);
        if (ws.Cells[1, 7].Value != null) ws.Column(7).Width = Math.Min(ws.Column(7).Width, 40);
        if (ws.Cells[1, 8].Value != null) ws.Column(8).Width = Math.Min(ws.Column(8).Width, 35);

        var bytes = package.GetAsByteArray();
        var dStr = (desde ?? DateOnly.FromDateTime(DateTime.Today.AddMonths(-1))).ToString("yyyyMMdd");
        var hStr = (hasta ?? DateOnly.FromDateTime(DateTime.Today)).ToString("yyyyMMdd");
        var fileName = $"pedidos-{dStr}-{hStr}.xlsx";
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
    }

    /// <summary>GET /api/pedidos/{id} — Detalle de pedido con líneas</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<PedidoDetalle>>> Get(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<PedidoDetalle>.Fail("Pedido no encontrado"));

        var lotesPorLinea = await BuildLotesFallbackPorLineaAsync(pedido, ct);
        return Ok(ApiResponse<PedidoDetalle>.Ok(MapToDetalle(pedido, lotesPorLinea)));
    }

    /// <summary>POST /api/pedidos/crear — Crear nuevo pedido con lógica fiscal completa</summary>
    [HttpPost("crear")]
    public async Task<ActionResult<ApiResponse<PedidoCreado>>> Crear(
        [FromBody] CrearPedidoRequest request, CancellationToken ct)
    {
        // Cargar cliente con condiciones especiales
        var cliente = await _uow.Clientes.GetQueryable()
            .Include(c => c.CondicionesEspeciales)
            .FirstOrDefaultAsync(c => c.Id == request.ClienteId && c.EmpresaId == EmpresaId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), request.ClienteId);

        var pedido = new Pedido
        {
            EmpresaId = EmpresaId,
            ClienteId = request.ClienteId,
            UsuarioId = UsuarioId,
            NumeroPedido = $"PED-{DateTime.UtcNow:yyyyMMddHHmmss}",
            FechaPedido = request.FechaPedido,
            FechaEntrega = request.FechaEntrega,
            Estado = EstadoPedido.Pendiente,
            Notas = request.Notas
        };

        short orden = 0;
        decimal subtotal = 0m;
        decimal ivaTotal = 0m;
        decimal recargoTotal = 0m;

        bool aplicaRE = cliente.TipoImpuesto == TipoImpuesto.RecargoEquivalencia
                     || cliente.RecargoEquivalencia;

        var tablaRE = aplicaRE
            ? (await _uow.TiposIvaRe.FindAsync(t => t.EmpresaId == EmpresaId && t.Activo, ct))
                .ToDictionary(t => t.IvaPorcentaje, t => t.RecargoEquivalenciaPorcentaje)
            : new Dictionary<decimal, decimal>();

        foreach (var item in request.Items)
        {
            var producto = await _uow.Productos.GetByIdAsync(item.ProductoId, ct)
                ?? throw new EntidadNotFoundException(nameof(Producto), item.ProductoId);

            // ── Validación de stock ───────────────────────────────────────────
            var stockDisponible = await _uow.Stock.GetTotalDisponibleAsync(EmpresaId, item.ProductoId, ct);
            if (stockDisponible < item.Cantidad)
                return BadRequest(ApiResponse<PedidoCreado>.Fail(
                    $"Stock insuficiente para '{producto.Nombre}': disponible {stockDisponible:0.##}, solicitado {item.Cantidad:0.##}"));

            var pricing = ComercialPricingPolicy.Resolve(cliente, producto, item.PrecioUnitario, item.Descuento);
            decimal precio = pricing.PrecioUnitario;
            decimal descuento = pricing.Descuento;

            decimal ivaPorc = GetIvaPorcentaje(cliente, producto);
            decimal rePorc = aplicaRE ? GetRecargoEquivalenciaPorcentaje(ivaPorc, tablaRE) : 0m;

            decimal linSubtotal = Math.Round(item.Cantidad * precio * (1 - descuento / 100), 2, MidpointRounding.AwayFromZero);
            decimal linIva = Math.Round(linSubtotal * ivaPorc / 100, 2, MidpointRounding.AwayFromZero);
            decimal linRe = Math.Round(linSubtotal * rePorc / 100, 2, MidpointRounding.AwayFromZero);

            pedido.Lineas.Add(new PedidoLinea
            {
                ProductoId = item.ProductoId,
                Descripcion = producto.Nombre,
                Cantidad = item.Cantidad,
                PrecioUnitario = precio,
                Descuento = descuento,
                IvaPorcentaje = ivaPorc,
                RecargoEquivalenciaPorcentaje = rePorc,
                Orden = orden++
            });

            subtotal += linSubtotal;
            ivaTotal += linIva;
            recargoTotal += linRe;
        }

        // ── Retención (sobre la base, si aplica) ─────────────────────────────
        decimal retencionPorc = !cliente.NoAplicarRetenciones && cliente.PorcentajeRetencion > 0
            ? cliente.PorcentajeRetencion : 0m;
        decimal retencionTotal = Math.Round(subtotal * retencionPorc / 100, 2, MidpointRounding.AwayFromZero);

        pedido.Subtotal                  = subtotal;
        pedido.IvaTotal                  = ivaTotal;
        pedido.RecargoEquivalenciaTotal  = recargoTotal;
        pedido.RetencionTotal            = retencionTotal;
        pedido.Total                     = subtotal + ivaTotal + recargoTotal - retencionTotal;

        await _uow.Pedidos.AddAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<PedidoCreado>.Ok(
            new PedidoCreado(pedido.Id, pedido.NumeroPedido!, pedido.Total),
            $"Pedido {pedido.NumeroPedido} creado correctamente"));
    }

    private static decimal GetIvaPorcentaje(Cliente cliente, Producto producto)
        => cliente.TipoImpuesto switch
        {
            TipoImpuesto.Exento => 0m,
            TipoImpuesto.IGIC => 7m,
            _ => cliente.AplicarImpuesto ? producto.IvaPorcentaje : 0m
        };

    private static decimal GetRecargoEquivalenciaPorcentaje(
        decimal ivaPorcentaje, Dictionary<decimal, decimal> tablaRE)
    {
        if (tablaRE.TryGetValue(ivaPorcentaje, out var reDesdeDB))
            return reDesdeDB;

        if (tablaRE.Count > 0)
            return 0m;

        return ivaPorcentaje switch { 21m => 5.2m, 10m => 1.4m, 4m => 0.5m, _ => 0m };
    }

    /// <summary>
    /// POST /api/pedidos/{id}/confirmar — Confirmar pedido (estado → Confirmado).
    /// Asigna lotes FIFO y consume stock en este punto para evitar descuentos duplicados posteriores.
    /// </summary>
    [HttpPost("{id:int}/confirmar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Confirmar(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado != EstadoPedido.Pendiente)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden confirmar pedidos en estado Pendiente"));

        await _uow.BeginTransactionAsync(ct);
        try
        {
            // Asignar lotes FIFO y consumir stock para cada línea.
            // Nota: si ya existen movimientos de tipo "pedido_confirmado" para este pedido,
            // evitamos volver a descontar para no duplicar salidas (caso de inserciones manuales).
            var movimientosExistentes = await _uow.MovimientosStock.GetQueryable()
                .Where(m => m.EmpresaId == EmpresaId && m.ReferenciaTipo == "pedido_confirmado" && m.ReferenciaId == pedido.Id)
                .ToListAsync(ct);
            bool pedidoYaConsumido = movimientosExistentes.Any();
            foreach (var linea in pedido.Lineas)
            {
                var producto = linea.Producto
                    ?? await _uow.Productos.GetByIdAsync(linea.ProductoId, ct);

                if (producto?.RequiereLote != true) continue;

                var lotes = await _loteService.AsignarLotesAsync(EmpresaId, linea.ProductoId, linea.Cantidad, ct);

                // Guardar asignación FIFO en la línea
                var reservaItems = lotes.Select(l => new ReservaLoteItem(l.LoteId, l.CodigoLote, l.Cantidad)).ToList();
                linea.ReservaLotesJson = JsonSerializer.Serialize(reservaItems);

                // Consumir stock al confirmar el pedido para que factura/albarán no vuelvan a restarlo.
                foreach (var lote in lotes)
                {
                    var stock = await _uow.Stock.GetByProductoLoteAsync(EmpresaId, linea.ProductoId, lote.LoteId, ct);
                    if (stock == null) continue;

                    if (pedidoYaConsumido)
                    {
                        // Ya existe consumo registrado para este pedido — no restamos de nuevo.
                        continue;
                    }

                    var cantidadAntes = stock.CantidadDisponible;
                    stock.CantidadDisponible -= lote.Cantidad;
                    stock.UpdatedAt = DateTime.UtcNow;
                    await _uow.Stock.UpdateAsync(stock, ct);

                    await _uow.MovimientosStock.AddAsync(new MovimientoStock
                    {
                        EmpresaId = EmpresaId,
                        ProductoId = linea.ProductoId,
                        LoteId = lote.LoteId,
                        Tipo = TipoMovimientoStock.Venta,
                        Cantidad = lote.Cantidad,
                        CantidadAntes = cantidadAntes,
                        CantidadDespues = stock.CantidadDisponible,
                        ReferenciaTipo = "pedido_confirmado",
                        ReferenciaId = pedido.Id,
                        UsuarioId = UsuarioId,
                        Notas = $"Salida al confirmar pedido {pedido.NumeroPedido ?? pedido.Id.ToString()}"
                    }, ct);

                    await _uow.Trazabilidades.AddAsync(new Trazabilidad
                    {
                        EmpresaId = EmpresaId,
                        LoteId = lote.LoteId,
                        ProductoId = linea.ProductoId,
                        ClienteId = pedido.ClienteId,
                        Cantidad = lote.Cantidad,
                        TipoOperacion = "venta_pedido",
                        FechaOperacion = DateTime.UtcNow,
                        UsuarioId = UsuarioId,
                        DatosAdicionales = JsonSerializer.Serialize(new
                        {
                            pedidoId = pedido.Id,
                            pedidoNumero = pedido.NumeroPedido,
                            codigoLote = lote.CodigoLote
                        })
                    }, ct);
                }
            }

            pedido.Estado = EstadoPedido.Confirmado;
            await _uow.Pedidos.UpdateAsync(pedido, ct);
            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            return Ok(ApiResponse<string>.Ok("OK", "Pedido confirmado y stock descontado"));
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>
    /// POST /api/pedidos/{id}/cancelar — Cancelar pedido y devolver stock si ya se descontó al confirmar
    /// </summary>
    [HttpPost("{id:int}/cancelar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Cancelar(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado == EstadoPedido.Cancelado)
            return BadRequest(ApiResponse<string>.Fail("El pedido ya está cancelado"));

        await _uow.BeginTransactionAsync(ct);
        try
        {
            var ventasPedido = await _uow.MovimientosStock.GetQueryable()
                .Where(m => m.EmpresaId == EmpresaId
                    && m.ReferenciaTipo == "pedido_confirmado"
                    && m.ReferenciaId == pedido.Id
                    && m.Tipo == TipoMovimientoStock.Venta)
                .ToListAsync(ct);

            // Revertir el consumo del pedido confirmado o liberar reservas legacy.
            foreach (var linea in pedido.Lineas.Where(l => l.ReservaLotesJson != null))
            {
                var reserva = JsonSerializer.Deserialize<List<ReservaLoteItem>>(linea.ReservaLotesJson!);
                if (reserva == null) continue;

                foreach (var item in reserva)
                {
                    var stock = await _uow.Stock.GetByProductoLoteAsync(EmpresaId, linea.ProductoId, item.LoteId, ct);
                    if (stock != null)
                    {
                        var huboVentaEnConfirmacion = ventasPedido.Any(m => m.ProductoId == linea.ProductoId && m.LoteId == item.LoteId);
                        if (huboVentaEnConfirmacion)
                        {
                            var cantidadAntes = stock.CantidadDisponible;
                            stock.CantidadDisponible += item.Cantidad;
                            stock.UpdatedAt = DateTime.UtcNow;
                            await _uow.Stock.UpdateAsync(stock, ct);

                            await _uow.MovimientosStock.AddAsync(new MovimientoStock
                            {
                                EmpresaId = EmpresaId,
                                ProductoId = linea.ProductoId,
                                LoteId = item.LoteId,
                                Tipo = TipoMovimientoStock.Devolucion,
                                Cantidad = item.Cantidad,
                                CantidadAntes = cantidadAntes,
                                CantidadDespues = stock.CantidadDisponible,
                                ReferenciaTipo = "cancelacion_pedido",
                                ReferenciaId = pedido.Id,
                                UsuarioId = UsuarioId,
                                Notas = $"Reposición por cancelación del pedido {pedido.NumeroPedido ?? pedido.Id.ToString()}"
                            }, ct);
                        }

                        stock.UpdatedAt = DateTime.UtcNow;
                        stock.CantidadReservada = Math.Max(0, stock.CantidadReservada - item.Cantidad);
                        await _uow.Stock.UpdateAsync(stock, ct);
                    }
                }
                linea.ReservaLotesJson = null;
            }

            pedido.Estado = EstadoPedido.Cancelado;
            await _uow.Pedidos.UpdateAsync(pedido, ct);
            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            return Ok(ApiResponse<string>.Ok("OK", "Pedido cancelado y stock revertido"));
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>
    /// POST /api/pedidos/{id}/preparado — Marcar pedido como Preparado
    /// </summary>
    [HttpPost("{id:int}/preparado")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> MarcarPreparado(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetByIdAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado != EstadoPedido.EnPreparacion)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden marcar como preparados pedidos en estado EnPreparacion"));

        pedido.Estado = EstadoPedido.Preparado;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido preparado"));
    }

    /// <summary>
    /// POST /api/pedidos/{id}/en-reparto — Marcar pedido como EnReparto
    /// </summary>
    [HttpPost("{id:int}/en-reparto")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> MarcarEnReparto(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetByIdAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado != EstadoPedido.Preparado)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden enviar a reparto pedidos en estado Preparado"));

        pedido.Estado = EstadoPedido.EnReparto;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido en reparto"));
    }

    /// <summary>
    /// POST /api/pedidos/{id}/entregado — Marcar pedido como Entregado
    /// </summary>
    [HttpPost("{id:int}/entregado")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> MarcarEntregado(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetByIdAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado != EstadoPedido.EnReparto)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden marcar como entregados pedidos en estado EnReparto"));

        pedido.Estado = EstadoPedido.Entregado;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido entregado"));
    }

    /// <summary>
    /// POST /api/pedidos/{id}/crear-albaran
    /// Crea un albarán con FIFO automático a partir de un pedido confirmado.
    /// </summary>
    [HttpPost("{id:int}/crear-albaran")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<AlbaranCreado>>> CrearAlbaran(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<AlbaranCreado>.Fail("Pedido no encontrado"));

        if (pedido.Estado != EstadoPedido.Confirmado)
            return BadRequest(ApiResponse<AlbaranCreado>.Fail("Solo se puede crear albarán de pedidos confirmados"));

        // Usar lotes pre-asignados al confirmar (si existen) o asignar FIFO ahora
        var lineasConLotes = new List<(PedidoLinea Linea, Producto Producto, List<LoteAsignado> Lotes)>();

        foreach (var linea in pedido.Lineas)
        {
            var producto = linea.Producto
                ?? await _uow.Productos.GetByIdAsync(linea.ProductoId, ct)
                ?? throw new EntidadNotFoundException(nameof(Producto), linea.ProductoId);

            List<LoteAsignado> lotes;
            if (linea.ReservaLotesJson != null)
            {
                // Lotes ya asignados y reservados al confirmar el pedido — usarlos directamente
                var reserva = JsonSerializer.Deserialize<List<ReservaLoteItem>>(linea.ReservaLotesJson) ?? [];
                lotes = reserva.Select(r => new LoteAsignado(r.LoteId, r.CodigoLote, linea.ProductoId, r.Cantidad, DateOnly.MinValue, null)).ToList();
            }
            else if (producto.RequiereLote)
            {
                lotes = await _loteService.AsignarLotesAsync(EmpresaId, linea.ProductoId, linea.Cantidad, ct);
            }
            else
            {
                lotes = [new LoteAsignado(0, "", linea.ProductoId, linea.Cantidad, DateOnly.MinValue, null)];
            }

            lineasConLotes.Add((linea, producto, lotes));
        }

        await _uow.BeginTransactionAsync(ct);
        try
        {
            string numeroAlbaran = $"ALB-{DateTime.UtcNow:yyyyMMddHHmmss}";

            var albaran = new Albaran
            {
                EmpresaId = EmpresaId,
                ClienteId = pedido.ClienteId,
                UsuarioId = UsuarioId,
                PedidoId = pedido.Id,
                NumeroAlbaran = numeroAlbaran,
                FechaAlbaran = DateOnly.FromDateTime(DateTime.Today),
                Estado = EstadoAlbaran.Pendiente,
                Notas = pedido.Notas
            };

            short orden = 0;
            foreach (var (linea, producto, lotes) in lineasConLotes)
            {
                foreach (var lote in lotes)
                {
                    albaran.Lineas.Add(new AlbaranLinea
                    {
                        ProductoId = linea.ProductoId,
                        LoteId = lote.LoteId > 0 ? lote.LoteId : null,
                        Descripcion = producto.Nombre + (lote.LoteId > 0 ? $" (Lote: {lote.CodigoLote})" : ""),
                        Cantidad = lote.Cantidad,
                        PrecioUnitario = linea.PrecioUnitario,
                        Descuento = linea.Descuento,
                        IvaPorcentaje = linea.IvaPorcentaje,
                        RecargoEquivalenciaPorcentaje = linea.RecargoEquivalenciaPorcentaje,
                        Orden = orden++
                    });
                }
            }

            albaran.Subtotal = albaran.Lineas.Sum(l => l.Subtotal);
            albaran.IvaTotal = albaran.Lineas.Sum(l => l.IvaImporte);
            albaran.RecargoEquivalenciaTotal = Math.Round(albaran.Lineas.Sum(l => l.RecargoEquivalenciaImporte), 2);
            albaran.RetencionTotal = pedido.RetencionTotal;
            albaran.Total = albaran.Subtotal + albaran.IvaTotal + albaran.RecargoEquivalenciaTotal - albaran.RetencionTotal;

            await _uow.Albaranes.AddAsync(albaran, ct);

            pedido.Estado = EstadoPedido.EnPreparacion;
            await _uow.Pedidos.UpdateAsync(pedido, ct);

            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            return Ok(ApiResponse<AlbaranCreado>.Ok(
                new AlbaranCreado(albaran.Id, albaran.NumeroAlbaran!, albaran.Total),
                $"Albarán {albaran.NumeroAlbaran} creado desde pedido {pedido.NumeroPedido}"));
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>
    /// POST /api/pedidos/{id}/crear-factura
    /// Genera una factura directamente desde un pedido confirmado (sin albarán previo).
    /// Solo si el cliente permite facturación (noRealizarFacturas = false).
    /// </summary>
    [HttpPost("{id:int}/crear-factura")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<FacturaCreada>>> CrearFactura(
        int id, [FromBody] CrearFacturaDesdePedidoRequest request, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<FacturaCreada>.Fail("Pedido no encontrado"));

        if (pedido.Estado != EstadoPedido.Confirmado)
            return BadRequest(ApiResponse<FacturaCreada>.Fail("Solo se puede facturar pedidos confirmados"));

        var cliente = await _uow.Clientes.GetByIdAsync(pedido.ClienteId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), pedido.ClienteId);

        if (cliente.NoRealizarFacturas)
            return BadRequest(ApiResponse<FacturaCreada>.Fail("Este cliente no permite la generación de facturas"));

        var facturaRequest = new CrearFacturaRequest
        {
            EmpresaId = EmpresaId,
            ClienteId = pedido.ClienteId,
            PedidoId = pedido.Id,
            SerieId = request.SerieId,
            FechaFactura = request.FechaFactura ?? DateOnly.FromDateTime(DateTime.Today),
            EsSimplificada = request.EsSimplificada,
            ConsumirStock = false,
            UsuarioId = UsuarioId,
            Notas = pedido.Notas,
            Items = pedido.Lineas.Select(l => new LineaFacturaRequest
            {
                ProductoId = l.ProductoId,
                Cantidad = l.Cantidad,
                PrecioUnitario = l.PrecioUnitario,
                Descuento = l.Descuento
            }).ToList()
        };

        var factura = await _facturaService.CrearFacturaAsync(facturaRequest, ct);

        pedido.Estado = EstadoPedido.EnPreparacion;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<FacturaCreada>.Ok(factura, $"Factura {factura.NumeroFactura} generada desde pedido {pedido.NumeroPedido}"));
    }

    /// <summary>
    /// GET /api/pedidos/{id}/pdf — Descargar PDF del pedido/encargo
    /// </summary>
    [HttpGet("{id:int}/pdf")]
    public async Task<IActionResult> GetPdf(int id, CancellationToken ct)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));

        var empresa = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(1.5f, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Arial"));

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
                            c.Item().AlignRight().Text("PEDIDO/ENCARGO")
                                .Bold().FontSize(18).FontColor("#27AE60");
                            c.Item().AlignRight().Text($"Nº: {pedido.NumeroPedido}").Bold().FontSize(11);
                            c.Item().AlignRight().Text($"Fecha: {pedido.FechaPedido:dd/MM/yyyy}");
                            if (pedido.FechaEntrega.HasValue)
                                c.Item().AlignRight().Text($"Entrega: {pedido.FechaEntrega:dd/MM/yyyy}");
                            c.Item().AlignRight().Text($"Estado: {pedido.Estado}");
                        });
                    });

                    col.Item().PaddingTop(5).LineHorizontal(1).LineColor("#27AE60");

                    col.Item().PaddingTop(8).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("CLIENTE").Bold().FontSize(8).FontColor("#888888");
                            c.Item().Text(pedido.Cliente?.NombreCompleto ?? "—").Bold();
                            if (pedido.Cliente?.Nif != null)
                                c.Item().Text($"NIF/CIF: {pedido.Cliente.Nif}");
                            if (pedido.Cliente?.Direccion != null)
                                c.Item().Text(pedido.Cliente.Direccion);
                            if (pedido.Cliente?.Ciudad != null)
                                c.Item().Text($"{pedido.Cliente.CodigoPostal} {pedido.Cliente.Ciudad}");
                        });
                    });

                    col.Item().PaddingTop(8).LineHorizontal(0.5f).LineColor("#DDDDDD");
                });

                page.Content().PaddingTop(10).Column(col =>
                {
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(5);
                            cols.ConstantColumn(55);
                            cols.ConstantColumn(65);
                            cols.ConstantColumn(40);
                            cols.ConstantColumn(65);
                        });

                        static IContainer HeaderCell(IContainer c) =>
                            c.Background("#27AE60").Padding(4).AlignCenter();

                        table.Header(header =>
                        {
                            header.Cell().Element(HeaderCell).Text("Producto").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Cant.").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Precio").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Dto%").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Total").Bold().FontColor(Colors.White).FontSize(8);
                        });

                        bool odd = true;
                        foreach (var linea in pedido.Lineas.OrderBy(l => l.Orden))
                        {
                            string bg = odd ? "#FFFFFF" : "#F9F9F9";
                            odd = !odd;

                            IContainer BodyCell(IContainer c) => c.Background(bg).Padding(3);
                            IContainer BodyCellRight(IContainer c) => c.Background(bg).Padding(3).AlignRight();

                            decimal subtotal = Math.Round(linea.Cantidad * linea.PrecioUnitario * (1 - linea.Descuento / 100), 2);

                            table.Cell().Element(BodyCell).Text(linea.Producto?.Nombre ?? linea.Descripcion ?? "").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.Cantidad:N2}").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.PrecioUnitario:N4} €").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.Descuento:N1}%").FontSize(8);
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
                        IContainer TotalLabelBold(IContainer c) => c.Background("#27AE60").Padding(4).AlignRight();
                        IContainer TotalValueBold(IContainer c) => c.Background("#27AE60").Padding(4).AlignRight();

                        totales.Cell().Element(TotalLabel).Text("Base Imponible:").FontSize(9);
                        totales.Cell().Element(TotalValue).Text($"{pedido.Subtotal:N2} €").FontSize(9);

                        totales.Cell().Element(TotalLabel).Text("IVA:").FontSize(9);
                        totales.Cell().Element(TotalValue).Text($"{pedido.IvaTotal:N2} €").FontSize(9);

                        if (pedido.RecargoEquivalenciaTotal > 0)
                        {
                            totales.Cell().Element(TotalLabel).Text("Recargo Equivalencia:").FontSize(9);
                            totales.Cell().Element(TotalValue).Text($"{pedido.RecargoEquivalenciaTotal:N2} €").FontSize(9);
                        }

                        if (pedido.RetencionTotal > 0)
                        {
                            totales.Cell().Element(TotalLabel).Text("Retención (-):").FontSize(9);
                            totales.Cell().Element(TotalValue).Text($"-{pedido.RetencionTotal:N2} €").FontSize(9).FontColor("#C0392B");
                        }

                        totales.Cell().Element(TotalLabelBold).Text("TOTAL:").Bold().FontSize(11).FontColor(Colors.White);
                        totales.Cell().Element(TotalValueBold).Text($"{pedido.Total:N2} €").Bold().FontSize(11).FontColor(Colors.White);
                    });

                    if (!string.IsNullOrWhiteSpace(pedido.Notas))
                    {
                        col.Item().PaddingTop(12).Column(c =>
                        {
                            c.Item().Text("Notas/Observaciones:").Bold().FontSize(8).FontColor("#888888");
                            c.Item().Text(pedido.Notas).FontSize(8);
                        });
                    }
                });

                page.Footer().Column(col =>
                {
                    col.Item().LineHorizontal(0.5f).LineColor("#DDDDDD");
                    col.Item().PaddingTop(4).Row(row =>
                    {
                        row.RelativeItem().Text(
                            "Documento de pedido/encargo. No tiene valor de factura ni albarán.")
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
        return File(bytes, "application/pdf", $"Pedido_{pedido.NumeroPedido}.pdf");
    }

    /// <summary>
    /// DELETE /api/pedidos/{id} — Elimina pedidos en estado Pendiente o Cancelado
    /// (solo si no tienen albaranes o facturas asociadas).
    /// </summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Eliminar(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));

        if (pedido.Estado != EstadoPedido.Pendiente && pedido.Estado != EstadoPedido.Cancelado)
            return UnprocessableEntity(ApiResponse<string>.Fail("Solo se pueden eliminar pedidos en estado Pendiente o Cancelado"));

        var tieneAlbaran = await _uow.Albaranes.GetQueryable().AnyAsync(a => a.PedidoId == id && a.EmpresaId == EmpresaId, ct);
        var tieneFactura = await _uow.Facturas.GetQueryable().AnyAsync(f => f.PedidoId == id && f.EmpresaId == EmpresaId, ct);
        if (tieneAlbaran || tieneFactura)
            return UnprocessableEntity(ApiResponse<string>.Fail("No se puede eliminar porque el pedido ya tiene albarán/factura asociada"));

        await _uow.Pedidos.DeleteAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido eliminado"));
    }

    private async Task<Dictionary<int, string?>> BuildLotesFallbackPorLineaAsync(Pedido pedido, CancellationToken ct)
    {
        var result = new Dictionary<int, string?>();
        var sinLote = new List<PedidoLinea>();

        foreach (var linea in pedido.Lineas)
        {
            var codigoLote = BuildCodigoLoteResumen(linea.ReservaLotesJson) ?? ExtractLoteFromDescripcion(linea.Descripcion);
            if (!string.IsNullOrWhiteSpace(codigoLote))
            {
                result[linea.Id] = codigoLote;
            }
            else
            {
                sinLote.Add(linea);
            }
        }

        if (sinLote.Count == 0)
            return result;

        var albaranLineas = await _uow.Albaranes.GetQueryable()
            .Where(a => a.EmpresaId == EmpresaId && a.PedidoId == pedido.Id)
            .SelectMany(a => a.Lineas.Select(l => new
            {
                l.ProductoId,
                l.Cantidad,
                CodigoLote = l.Lote != null ? l.Lote.CodigoLote : null
            }))
            .ToListAsync(ct);

        var poolPorProducto = albaranLineas
            .Where(x => !string.IsNullOrWhiteSpace(x.CodigoLote))
            .GroupBy(x => x.ProductoId)
            .ToDictionary(g => g.Key, g => g.Select(x => (x.Cantidad, CodigoLote: x.CodigoLote!.Trim())).ToList());

        var movimientosPedido = await _uow.MovimientosStock.GetQueryable()
            .Where(m => m.EmpresaId == EmpresaId
                && m.ReferenciaTipo == "pedido_confirmado"
                && m.ReferenciaId == pedido.Id
                && m.Tipo == TipoMovimientoStock.Venta
                && m.LoteId > 0)
            .Select(m => new
            {
                m.ProductoId,
                m.Cantidad,
                CodigoLote = m.Lote != null ? m.Lote.CodigoLote : null
            })
            .ToListAsync(ct);

        var poolMovimientosPorProducto = movimientosPedido
            .Where(x => !string.IsNullOrWhiteSpace(x.CodigoLote))
            .GroupBy(x => x.ProductoId)
            .ToDictionary(g => g.Key, g => g.Select(x => (x.Cantidad, CodigoLote: x.CodigoLote!.Trim())).ToList());

        foreach (var linea in sinLote.OrderBy(l => l.Orden))
        {
            if (TryTakeLoteFromPool(poolPorProducto, linea, out var loteAlbaran))
            {
                result[linea.Id] = loteAlbaran;
                continue;
            }

            if (TryTakeLoteFromPool(poolMovimientosPorProducto, linea, out var loteMovimiento))
            {
                result[linea.Id] = loteMovimiento;
            }
        }

        return result;
    }

    private static bool TryTakeLoteFromPool(
        Dictionary<int, List<(decimal Cantidad, string CodigoLote)>> poolPorProducto,
        PedidoLinea linea,
        out string codigoLote)
    {
        codigoLote = string.Empty;
        if (!poolPorProducto.TryGetValue(linea.ProductoId, out var pool) || pool.Count == 0)
            return false;

        var idxMatchCantidad = pool.FindIndex(x => x.Cantidad == linea.Cantidad);
        var idx = idxMatchCantidad >= 0 ? idxMatchCantidad : 0;
        var lote = pool[idx].CodigoLote;
        pool.RemoveAt(idx);

        if (string.IsNullOrWhiteSpace(lote))
            return false;

        codigoLote = lote;
        return true;
    }

    private static PedidoDetalle MapToDetalle(Pedido p, IReadOnlyDictionary<int, string?>? lotesPorLinea = null) => new(
        p.Id,
        p.NumeroPedido ?? $"PED-{p.Id}",
        p.FechaPedido.ToString("yyyy-MM-dd"),
        p.FechaEntrega?.ToString("yyyy-MM-dd"),
        p.Estado.ToString(),
        new ClienteResumen(p.Cliente?.Id ?? 0, p.Cliente?.NombreCompleto ?? "", p.Cliente?.Nif),
        p.Subtotal, p.IvaTotal, p.RecargoEquivalenciaTotal, p.RetencionTotal, p.Total, p.Notas,
        p.Lineas.OrderBy(l => l.Orden).Select(l => new PedidoLineaDto(
            l.ProductoId,
            l.Producto?.Nombre ?? l.Descripcion ?? "",
            l.Cantidad, l.PrecioUnitario, l.Descuento,
            l.IvaPorcentaje, l.RecargoEquivalenciaPorcentaje,
            l.Subtotal, l.IvaImporte, l.RecargoEquivalenciaImporte,
            ResolveCodigoLote(l, lotesPorLinea)
        )).ToList(),
        p.Cliente?.NoRealizarFacturas ?? false
    );

    private static string? ResolveCodigoLote(PedidoLinea linea, IReadOnlyDictionary<int, string?>? lotesPorLinea)
    {
        if (lotesPorLinea != null && lotesPorLinea.TryGetValue(linea.Id, out var lote) && !string.IsNullOrWhiteSpace(lote))
            return lote;

        return BuildCodigoLoteResumen(linea.ReservaLotesJson) ?? ExtractLoteFromDescripcion(linea.Descripcion);
    }

    private static string? BuildCodigoLoteResumen(string? reservaLotesJson)
    {
        if (string.IsNullOrWhiteSpace(reservaLotesJson))
            return null;

        try
        {
            var reservas = JsonSerializer.Deserialize<List<ReservaLoteItem>>(reservaLotesJson, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            if (reservas == null || reservas.Count == 0)
                return null;

            var lotes = reservas
                .Where(r => !string.IsNullOrWhiteSpace(r.CodigoLote))
                .Select(r => r.CodigoLote.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            return lotes.Count == 0 ? null : string.Join(", ", lotes);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? ExtractLoteFromDescripcion(string? descripcion)
    {
        if (string.IsNullOrWhiteSpace(descripcion))
            return null;

        var marker = "(Lote:";
        var start = descripcion.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (start < 0)
            return null;

        start += marker.Length;
        var end = descripcion.IndexOf(')', start);
        if (end < 0)
            end = descripcion.Length;

        var lote = descripcion[start..end].Trim();
        return string.IsNullOrWhiteSpace(lote) ? null : lote;
    }
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

public record PedidoResumen(
    int Id, string NumeroPedido, string Fecha, string? FechaEntrega,
    string Estado, string ClienteNombre, decimal Total,
    bool NoRealizarFacturas = false);

public record PedidoCreado(int Id, string NumeroPedido, decimal Total);

public record PedidoDetalle(
    int Id, string NumeroPedido, string Fecha, string? FechaEntrega, string Estado,
    ClienteResumen Cliente,
    decimal Subtotal, decimal IvaTotal, decimal RecargoEquivalenciaTotal,
    decimal RetencionTotal, decimal Total,
    string? Notas, List<PedidoLineaDto> Lineas,
    bool NoRealizarFacturas = false);

public record PedidoLineaDto(
    int ProductoId, string ProductoNombre,
    decimal Cantidad, decimal PrecioUnitario, decimal Descuento,
    decimal IvaPorcentaje, decimal RecargoEquivalenciaPorcentaje,
    decimal Subtotal, decimal IvaImporte, decimal RecargoEquivalenciaImporte,
    string? CodigoLote = null);

public class CrearPedidoRequest
{
    public int ClienteId { get; set; }
    public DateOnly FechaPedido { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public DateOnly? FechaEntrega { get; set; }
    public string? Notas { get; set; }
    public List<LineaPedidoRequest> Items { get; set; } = new();
}

public class LineaPedidoRequest
{
    public int ProductoId { get; set; }
    public decimal Cantidad { get; set; }
    public decimal? PrecioUnitario { get; set; }
    public decimal Descuento { get; set; } = 0;
}

public class CrearFacturaDesdePedidoRequest
{
    public int SerieId { get; set; }
    public DateOnly? FechaFactura { get; set; }
    public bool EsSimplificada { get; set; } = false;
}

/// <summary>Asignación de un lote al confirmar el pedido, serializada en JSON en pedidos_lineas.reserva_lotes_json</summary>
public record ReservaLoteItem(int LoteId, string CodigoLote, decimal Cantidad);
