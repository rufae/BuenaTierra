using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Ajuste(
        [FromBody] AjusteStockRequest request, CancellationToken ct)
    {
        await _stockService.AjustarAsync(EmpresaId, request.ProductoId, request.LoteId,
            request.Cantidad, request.Motivo, UsuarioId, ct);
        return Ok(ApiResponse<string>.Ok("Ajuste realizado correctamente"));
    }
}

public record AjusteStockRequest(int ProductoId, int LoteId, decimal Cantidad, string Motivo);
