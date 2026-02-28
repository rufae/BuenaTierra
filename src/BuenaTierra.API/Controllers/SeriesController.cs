using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SeriesController : ControllerBase
{
    private readonly IUnitOfWork _uow;

    public SeriesController(IUnitOfWork uow) => _uow = uow;

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    /// <summary>GET /api/series — Series de facturación activas</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<SerieFacturacion>>>> GetAll(CancellationToken ct)
    {
        var series = await _uow.SeriesFacturacion.FindAsync(s => s.EmpresaId == EmpresaId && s.Activa, ct);
        return Ok(ApiResponse<IEnumerable<SerieFacturacion>>.Ok(series));
    }

    /// <summary>GET /api/series/todas — Todas las series incluyendo inactivas (admin)</summary>
    [HttpGet("todas")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<ApiResponse<IEnumerable<SerieFacturacion>>>> GetTodas(CancellationToken ct)
    {
        var series = await _uow.SeriesFacturacion.FindAsync(s => s.EmpresaId == EmpresaId, ct);
        return Ok(ApiResponse<IEnumerable<SerieFacturacion>>.Ok(series));
    }

    /// <summary>POST /api/series — Crear nueva serie</summary>
    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<ApiResponse<SerieFacturacion>>> Create(
        [FromBody] SerieFacturacion serie, CancellationToken ct)
    {
        serie.EmpresaId = EmpresaId;
        await _uow.SeriesFacturacion.AddAsync(serie, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<SerieFacturacion>.Ok(serie));
    }

    /// <summary>PUT /api/series/{id} — Actualizar serie existente</summary>
    [HttpPut("{id:int}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<ApiResponse<SerieFacturacion>>> Update(
        int id, [FromBody] SerieFacturacion update, CancellationToken ct)
    {
        var serie = await _uow.SeriesFacturacion.GetByIdAsync(id, ct);
        if (serie is null || serie.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<SerieFacturacion>.Fail("Serie no encontrada"));

        serie.Codigo      = update.Codigo;
        serie.Descripcion = update.Descripcion;
        serie.Prefijo     = update.Prefijo;
        serie.Formato     = update.Formato;
        serie.Activa      = update.Activa;

        await _uow.SeriesFacturacion.UpdateAsync(serie, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<SerieFacturacion>.Ok(serie));
    }

    /// <summary>DELETE /api/series/{id} — Desactivar serie (soft delete)</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<ApiResponse<bool>>> Delete(int id, CancellationToken ct)
    {
        var serie = await _uow.SeriesFacturacion.GetByIdAsync(id, ct);
        if (serie is null || serie.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<bool>.Fail("Serie no encontrada"));

        serie.Activa = false;
        await _uow.SeriesFacturacion.UpdateAsync(serie, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<bool>.Ok(true));
    }
}
