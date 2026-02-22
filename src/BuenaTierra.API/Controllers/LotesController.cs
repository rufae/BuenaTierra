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
public class LotesController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly ILoteAsignacionService _loteService;

    public LotesController(IUnitOfWork uow, ILoteAsignacionService loteService)
    {
        _uow = uow;
        _loteService = loteService;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    /// <summary>GET /api/lotes/producto/{productoId} — Todos los lotes de un producto</summary>
    [HttpGet("producto/{productoId:int}")]
    public async Task<ActionResult<ApiResponse<object>>> GetByProducto(int productoId, CancellationToken ct)
    {
        var lotes = await _uow.Lotes.GetByProductoAsync(EmpresaId, productoId, ct);
        return Ok(ApiResponse<object>.Ok(lotes));
    }

    /// <summary>
    /// GET /api/lotes/producto/{productoId}/fifo?cantidad=10
    /// Previsualiza la asignación FIFO sin ejecutarla.
    /// Permite que el repartidor vea qué lotes se asignarán antes de confirmar.
    /// </summary>
    [HttpGet("producto/{productoId:int}/fifo")]
    public async Task<ActionResult<ApiResponse<List<LoteAsignado>>>> PreviewFifo(
        int productoId, [FromQuery] decimal cantidad, CancellationToken ct)
    {
        if (cantidad <= 0)
            return BadRequest(ApiResponse<List<LoteAsignado>>.Fail("La cantidad debe ser mayor que 0"));

        var asignaciones = await _loteService.AsignarLotesAsync(EmpresaId, productoId, cantidad, ct);
        return Ok(ApiResponse<List<LoteAsignado>>.Ok(asignaciones, $"{asignaciones.Count} lote(s) serían asignados"));
    }

    /// <summary>POST /api/lotes/{id}/bloquear — Bloquear un lote</summary>
    [HttpPost("{id:int}/bloquear")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Bloquear(
        int id, [FromBody] BloquearLoteRequest request, CancellationToken ct)
    {
        var lote = await _uow.Lotes.GetByIdAsync(id, ct);
        if (lote == null || lote.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Lote no encontrado"));

        lote.Bloqueado = true;
        lote.MotivoBloqueado = request.Motivo;
        await _uow.Lotes.UpdateAsync(lote, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("OK", "Lote bloqueado"));
    }
}

public record BloquearLoteRequest(string Motivo);
