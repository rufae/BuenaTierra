using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class StockController : ControllerBase
{
    private readonly IStockService _stockService;
    private readonly ILoteAsignacionService _loteService;
    private readonly IUnitOfWork _uow;

    public StockController(IStockService stockService, ILoteAsignacionService loteService, IUnitOfWork uow)
    {
        _stockService = stockService;
        _loteService = loteService;
        _uow = uow;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>GET /api/stock/producto/{productoId} — Resumen de stock por producto</summary>
    [HttpGet("producto/{productoId:int}")]
    public async Task<ActionResult<ApiResponse<StockResumen>>> GetResumen(int productoId, CancellationToken ct)
    {
        var resumen = await _stockService.GetResumenAsync(EmpresaId, productoId, ct);
        return Ok(ApiResponse<StockResumen>.Ok(resumen));
    }

    /// <summary>GET /api/stock/producto/{productoId}/disponible — Cantidad disponible real (FIFO ready)</summary>
    [HttpGet("producto/{productoId:int}/disponible")]
    public async Task<ActionResult<ApiResponse<decimal>>> GetDisponible(int productoId, CancellationToken ct)
    {
        var disponible = await _loteService.GetDisponibleAsync(EmpresaId, productoId, ct);
        return Ok(ApiResponse<decimal>.Ok(disponible));
    }

    /// <summary>GET /api/stock/alertas — Productos con stock bajo mínimo</summary>
    [HttpGet("alertas")]
    public async Task<ActionResult<ApiResponse<IEnumerable<StockAlerta>>>> GetAlertas(CancellationToken ct)
    {
        var alertas = await _stockService.GetAlertasAsync(EmpresaId, ct);
        return Ok(ApiResponse<IEnumerable<StockAlerta>>.Ok(alertas));
    }

    /// <summary>GET /api/stock/todos — Todo el stock de la empresa con detalle de lote (para dashboard)</summary>
    [HttpGet("todos")]
    public async Task<ActionResult<ApiResponse<IEnumerable<StockDetalle>>>> GetTodos(CancellationToken ct)
    {
        var stock = await _uow.Stock.GetAllConDetalleAsync(EmpresaId, ct);
        return Ok(ApiResponse<IEnumerable<StockDetalle>>.Ok(stock));
    }

    /// <summary>POST /api/stock/ajuste — Ajuste manual de stock</summary>
    [HttpPost("ajuste")]
    [Authorize(Policy = "AnyRole")]
    public async Task<ActionResult<ApiResponse<string>>> Ajuste(
        [FromBody] AjusteStockRequest request, CancellationToken ct)
    {
        await _stockService.AjustarAsync(EmpresaId, request.ProductoId, request.LoteId,
            request.Cantidad, request.Motivo, UsuarioId, ct);
        return Ok(ApiResponse<string>.Ok("Ajuste realizado correctamente"));
    }

    /// <summary>
    /// POST /api/stock/simular-fifo — Simula asignación FIFO sin consumir stock.
    /// Útil para preview en el formulario de factura antes de confirmar.
    /// </summary>
    [HttpPost("simular-fifo")]
    public async Task<ActionResult<ApiResponse<List<LoteAsignado>>>> SimularFifo(
        [FromBody] SimularFifoRequest request, CancellationToken ct)
    {
        // AsignarLotesAsync solo lee — no modifica stock.
        // El consumo real ocurre en FacturaService.CrearFacturaAsync.
        var origen = request.Origen ?? OrigenStock.Fabrica;
        var asignaciones = await _loteService.AsignarLotesAsync(
            EmpresaId, request.ProductoId, request.Cantidad, origen, ct);

        return Ok(ApiResponse<List<LoteAsignado>>.Ok(asignaciones,
            $"FIFO simulado ({origen}): {asignaciones.Count} lote(s) para {request.Cantidad} unidades"));
    }

    /// <summary>
    /// GET /api/stock/producto/{productoId}/lotes — Lotes con stock disponible ordenados FIFO.
    /// Incluye detalle de cada lote para vista previa del split.
    /// </summary>
    [HttpGet("producto/{productoId:int}/lotes")]
    public async Task<ActionResult<ApiResponse<List<LoteDisponibleDto>>>> GetLotesFifo(
        int productoId, [FromQuery] OrigenStock origen = OrigenStock.Fabrica, CancellationToken ct = default)
    {
        var lotes = await _uow.Lotes.GetDisponiblesFIFOAsync(EmpresaId, productoId, origen, ct);
        var resultado = lotes.Select(l => new LoteDisponibleDto(
            LoteId: l.Id,
            CodigoLote: l.CodigoLote,
            FechaFabricacion: l.FechaFabricacion,
            FechaCaducidad: l.FechaCaducidad,
            Disponible: l.Stock != null
                ? (origen == OrigenStock.Furgoneta
                    ? l.Stock.CantidadFurgoneta
                    : l.Stock.CantidadDisponible - l.Stock.CantidadReservada - l.Stock.CantidadFurgoneta)
                : 0
        )).Where(l => l.Disponible > 0).ToList();

        return Ok(ApiResponse<List<LoteDisponibleDto>>.Ok(resultado));
    }

    /// <summary>
    /// POST /api/stock/carga-furgoneta — Carga/descarga de mercancía entre fábrica y furgoneta.
    /// Carga: fábrica → furgoneta (baja la porción en fábrica, sube la de furgoneta).
    /// Descarga: furgoneta → fábrica (inverse). El total disponible NO cambia.
    /// </summary>
    [HttpPost("carga-furgoneta")]
    [Authorize(Policy = "AnyRole")]
    public async Task<ActionResult<ApiResponse<string>>> CargaFurgoneta(
        [FromBody] CargaFurgonetaRequest request, CancellationToken ct)
    {
        if (request.Cantidad <= 0)
            return BadRequest(ApiResponse<string>.Fail("La cantidad debe ser mayor que 0"));

        var esCarga = string.Equals(request.Sentido, "Carga", StringComparison.OrdinalIgnoreCase);
        var esDescarga = string.Equals(request.Sentido, "Descarga", StringComparison.OrdinalIgnoreCase);
        if (!esCarga && !esDescarga)
            return BadRequest(ApiResponse<string>.Fail("El sentido debe ser 'Carga' o 'Descarga'"));

        var stock = await _uow.Stock.GetByProductoLoteAsync(EmpresaId, request.ProductoId, request.LoteId, ct);
        if (stock == null)
            return NotFound(ApiResponse<string>.Fail("Stock no encontrado para ese producto y lote"));

        var furgonetaAntes = stock.CantidadFurgoneta;
        var fabricaAntes = stock.FabricaDisponible;

        if (esCarga)
        {
            if (request.Cantidad > fabricaAntes)
                return BadRequest(ApiResponse<string>.Fail(
                    $"No hay suficiente stock en fábrica: disponible {fabricaAntes:0.##}, intentas cargar {request.Cantidad:0.##}"));
            stock.CantidadFurgoneta += request.Cantidad;
        }
        else
        {
            if (request.Cantidad > furgonetaAntes)
                return BadRequest(ApiResponse<string>.Fail(
                    $"No hay suficiente stock en furgoneta: disponible {furgonetaAntes:0.##}, intentas descargar {request.Cantidad:0.##}"));
            stock.CantidadFurgoneta -= request.Cantidad;
        }

        stock.AjustarInvarianteFurgoneta();
        stock.UpdatedAt = DateTime.UtcNow;
        await _uow.Stock.UpdateAsync(stock, ct);

        await _uow.MovimientosStock.AddAsync(new MovimientoStock
        {
            EmpresaId = EmpresaId,
            ProductoId = request.ProductoId,
            LoteId = request.LoteId,
            Tipo = esCarga ? TipoMovimientoStock.CargaFurgoneta : TipoMovimientoStock.DescargaFurgoneta,
            Cantidad = request.Cantidad,
            CantidadAntes = furgonetaAntes,
            CantidadDespues = stock.CantidadFurgoneta,
            ReferenciaTipo = "carga_furgoneta",
            ReferenciaId = request.LoteId,
            UsuarioId = UsuarioId,
            Notas = esCarga
                ? $"Carga a furgoneta: {request.Cantidad:0.##} uds (furgoneta: {furgonetaAntes:0.##} → {stock.CantidadFurgoneta:0.##})"
                : $"Descarga de furgoneta: {request.Cantidad:0.##} uds (furgoneta: {furgonetaAntes:0.##} → {stock.CantidadFurgoneta:0.##})"
        }, ct);

        await _uow.SaveChangesAsync(ct);

        var mensaje = esCarga
            ? $"Cargadas {request.Cantidad:0.##} uds a furgoneta (fábrica: {stock.FabricaDisponible:0.##}, furgoneta: {stock.CantidadFurgoneta:0.##})"
            : $"Descargadas {request.Cantidad:0.##} uds de furgoneta (fábrica: {stock.FabricaDisponible:0.##}, furgoneta: {stock.CantidadFurgoneta:0.##})";

        return Ok(ApiResponse<string>.Ok("OK", mensaje));
    }

    /// <summary>
    /// GET /api/stock/cargas — Historial de cargas/descargas de furgoneta (recientes primero).
    /// </summary>
    [HttpGet("cargas")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetCargas(CancellationToken ct)
    {
        var movimientos = await _uow.MovimientosStock.GetQueryable()
            .Where(m => m.EmpresaId == EmpresaId && m.ReferenciaTipo == "carga_furgoneta")
            .OrderByDescending(m => m.Id)
            .Take(50)
            .Select(m => new
            {
                m.Id,
                ProductoId = m.ProductoId,
                LoteId = m.LoteId,
                Tipo = m.Tipo.ToString(),
                m.Cantidad,
                m.CantidadAntes,
                m.CantidadDespues,
                m.Notas,
                Fecha = m.CreatedAt
            })
            .ToListAsync(ct);

        // Enriquecer con nombres de producto y código de lote
        var productoIds = movimientos.Select(m => m.ProductoId).Distinct().ToList();
        var loteIds = movimientos.Select(m => m.LoteId).Distinct().ToList();

        var productos = await _uow.Productos.GetQueryable()
            .Where(p => productoIds.Contains(p.Id))
            .Select(p => new { p.Id, p.Nombre })
            .ToDictionaryAsync(p => p.Id, p => p.Nombre, ct);

        var lotes = await _uow.Lotes.GetQueryable()
            .Where(l => loteIds.Contains(l.Id))
            .Select(l => new { l.Id, l.CodigoLote })
            .ToDictionaryAsync(l => l.Id, l => l.CodigoLote, ct);

        var resultado = movimientos.Select(m => new
        {
            m.Id,
            ProductoNombre = productos.GetValueOrDefault(m.ProductoId, $"Producto {m.ProductoId}"),
            CodigoLote = lotes.GetValueOrDefault(m.LoteId, $"Lote {m.LoteId}"),
            m.Tipo,
            m.Cantidad,
            FurgonetaAntes = m.CantidadAntes,
            FurgonetaDespues = m.CantidadDespues,
            m.Notas,
            m.Fecha
        });

        return Ok(ApiResponse<IEnumerable<object>>.Ok(resultado));
    }
}

public record AjusteStockRequest(int ProductoId, int LoteId, decimal Cantidad, string Motivo);
public record SimularFifoRequest(int ProductoId, decimal Cantidad, OrigenStock? Origen = null);
public record LoteDisponibleDto(int LoteId, string CodigoLote, DateOnly FechaFabricacion, DateOnly? FechaCaducidad, decimal Disponible);
public class CargaFurgonetaRequest
{
    public int ProductoId { get; set; }
    public int LoteId { get; set; }
    public decimal Cantidad { get; set; }
    public string Sentido { get; set; } = "Carga";
}
