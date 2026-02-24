using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "ObradorOrAdmin")]
public class ProduccionController : ControllerBase
{
    private readonly IProduccionService _produccionService;
    private readonly Domain.Interfaces.IUnitOfWork _uow;

    public ProduccionController(IProduccionService produccionService, Domain.Interfaces.IUnitOfWork uow)
    {
        _produccionService = produccionService;
        _uow = uow;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>GET /api/produccion — Todas las producciones con filtros opcionales</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<object>>> GetFiltrado(
        [FromQuery] string? busqueda,
        [FromQuery] string? estado,
        [FromQuery] string? fechaDesde,
        [FromQuery] string? fechaHasta,
        CancellationToken ct)
    {
        DateOnly? desde = DateOnly.TryParse(fechaDesde, out var d) ? d : null;
        DateOnly? hasta = DateOnly.TryParse(fechaHasta, out var h) ? h : null;

        var producciones = await _uow.Producciones.GetFiltradoAsync(
            EmpresaId, desde, hasta, estado, busqueda, ct);

        var dto = BuildDto(producciones);
        return Ok(ApiResponse<object>.Ok(dto));
    }

    /// <summary>GET /api/produccion/hoy — Producciones del día</summary>
    [HttpGet("hoy")]
    public async Task<ActionResult<ApiResponse<object>>> GetHoy(CancellationToken ct)
    {
        var fecha = DateOnly.FromDateTime(DateTime.Today);
        var producciones = await _uow.Producciones.GetByFechaAsync(EmpresaId, fecha, ct);
        return Ok(ApiResponse<object>.Ok(BuildDto(producciones)));
    }

    private static IEnumerable<object> BuildDto(IEnumerable<Domain.Entities.Produccion> producciones)
        => producciones.Select(p =>
        {
            // Lote propio (ProduccionId == p.Id)
            var propioLote = p.Lotes.FirstOrDefault();
            // Fallback para producciones finalizadas en modo MERGE: buscar el lote por código entre los lotes del producto
            var mergedLote = propioLote == null
                && p.Estado == Domain.Enums.EstadoProduccion.Finalizada
                && !string.IsNullOrEmpty(p.CodigoLoteSugerido)
                ? p.Producto?.Lotes?.FirstOrDefault(l => l.CodigoLote == p.CodigoLoteSugerido)
                : null;
            var loteEfectivo = propioLote ?? mergedLote;
            return new
            {
                p.Id,
                p.EmpresaId,
                p.ProductoId,
                productoNombre = p.Producto?.Nombre ?? "—",
                unidadMedida = p.Producto?.UnidadMedida ?? "ud",
                p.FechaProduccion,
                p.CantidadProducida,
                p.CantidadMerma,
                estado = p.Estado.ToString(),
                p.Notas,
                codigoLoteSugerido = p.CodigoLoteSugerido,
                codigoLote = loteEfectivo?.CodigoLote,
                loteId = loteEfectivo?.Id,
                fechaCaducidad = loteEfectivo?.FechaCaducidad,
                fechaCaducidadSugerida = p.FechaCaducidadSugerida,
            };
        });

    /// <summary>POST /api/produccion — Registrar planificación de producción</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<ProduccionCreada>>> Create(
        [FromBody] CrearProduccionRequest request, CancellationToken ct)
    {
        request.EmpresaId = EmpresaId;
        request.UsuarioId = UsuarioId;
        var result = await _produccionService.CrearProduccionAsync(request, ct);
        return Ok(ApiResponse<ProduccionCreada>.Ok(result, "Producción registrada"));
    }

    /// <summary>POST /api/produccion/{id}/finalizar — Finalizar producción → genera lote + stock automáticamente</summary>
    [HttpPost("{id:int}/finalizar")]
    public async Task<ActionResult<ApiResponse<string>>> Finalizar(int id, CancellationToken ct)
    {
        await _produccionService.FinalizarProduccionAsync(id, EmpresaId, UsuarioId, ct);
        return Ok(ApiResponse<string>.Ok("OK", "Producción finalizada. Lote y stock generados automáticamente."));
    }

    /// <summary>POST /api/produccion/{id}/cancelar — Cancelar producción</summary>
    [HttpPost("{id:int}/cancelar")]
    public async Task<ActionResult<ApiResponse<string>>> Cancelar(
        int id, [FromBody] CancelarRequest request, CancellationToken ct)
    {
        await _produccionService.CancelarProduccionAsync(id, EmpresaId, request.Motivo, ct);
        return Ok(ApiResponse<string>.Ok("OK"));
    }
}

public record CancelarRequest(string Motivo);
