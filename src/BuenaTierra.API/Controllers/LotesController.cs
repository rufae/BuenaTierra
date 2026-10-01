using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

    /// <summary>GET /api/lotes/exportar-excel — Exporta el listado de lotes a Excel (ClosedXML)</summary>
    [HttpGet("exportar-excel")]
    public async Task<IActionResult> ExportarExcel(CancellationToken ct)
    {
        var lotes = await _uow.Lotes.GetQueryable()
            .Where(l => l.EmpresaId == EmpresaId)
            .Include(l => l.Producto)
            .Include(l => l.Stock)
            .OrderBy(l => l.Producto!.Nombre).ThenBy(l => l.FechaFabricacion)
            .ToListAsync(ct);

        using var wb = new ClosedXML.Excel.XLWorkbook();
        var ws = wb.Worksheets.Add("Lotes");

        string[] headers = { "Producto", "Lote", "F. Fabricación", "F. Caducidad", "Disponible", "Reservada", "En fábrica", "En furgoneta", "Bloqueado", "Estado" };
        for (int i = 0; i < headers.Length; i++)
            ws.Cell(1, i + 1).Value = headers[i];

        var hr = ws.Range(1, 1, 1, headers.Length);
        hr.Style.Font.Bold = true;
        hr.Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#4472C4");
        hr.Style.Font.FontColor = ClosedXML.Excel.XLColor.White;

        int row = 2;
        foreach (var l in lotes)
        {
            var disponible = l.Stock?.CantidadDisponible ?? 0m;
            var reservada = l.Stock?.CantidadReservada ?? 0m;
            var enFurgoneta = l.Stock?.CantidadFurgoneta ?? 0m;

            ws.Cell(row, 1).Value = l.Producto?.Nombre;
            ws.Cell(row, 2).Value = l.CodigoLote;
            ws.Cell(row, 3).Value = l.FechaFabricacion.ToDateTime(TimeOnly.MinValue);
            ws.Cell(row, 3).Style.DateFormat.Format = "dd/mm/yyyy";
            if (l.FechaCaducidad.HasValue)
            {
                ws.Cell(row, 4).Value = l.FechaCaducidad.Value.ToDateTime(TimeOnly.MinValue);
                ws.Cell(row, 4).Style.DateFormat.Format = "dd/mm/yyyy";
            }
            ws.Cell(row, 5).Value = (double)disponible;
            ws.Cell(row, 6).Value = (double)reservada;
            ws.Cell(row, 7).Value = (double)(disponible - enFurgoneta);
            ws.Cell(row, 8).Value = (double)enFurgoneta;
            ws.Cell(row, 9).Value = l.Bloqueado ? "Sí" : "No";
            ws.Cell(row, 10).Value = EstadoLote(disponible, l.FechaCaducidad);
            row++;
        }

        ws.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "lotes.xlsx");
    }

    /// <summary>Misma regla de estado que muestra la UI de Lotes (frontend getEstado).</summary>
    private static string EstadoLote(decimal disponible, DateOnly? fechaCaducidad)
    {
        if (disponible <= 0) return "agotado";
        if (fechaCaducidad.HasValue)
        {
            var hoy = DateOnly.FromDateTime(DateTime.Today);
            var diff = fechaCaducidad.Value.DayNumber - hoy.DayNumber;
            if (diff <= 0) return "caducado";
            if (diff <= 3) return "próximo a caducar";
        }
        return "activo";
    }

    /// <summary>GET /api/lotes — Todos los lotes de la empresa (con paginación opcional)</summary>
    [HttpGet]
    public async Task<ActionResult> GetAll(
        [FromQuery] int? page = null, [FromQuery] int? pageSize = null,
        CancellationToken ct = default)
    {
        var query = _uow.Lotes.GetQueryable()
            .Where(l => l.EmpresaId == EmpresaId)
            .OrderByDescending(l => l.FechaFabricacion);

        var p = new PaginationParams(page, pageSize);
        if (p.HasPagination)
        {
            var total = await query.CountAsync(ct);
            var items = await query
                .Skip((p.SafePage - 1) * p.SafePageSize).Take(p.SafePageSize)
                .Select(l => new
                {
                    l.Id, l.ProductoId,
                    ProductoNombre = l.Producto.Nombre,
                    l.CodigoLote, l.FechaFabricacion, l.FechaCaducidad,
                    l.CantidadInicial, l.Bloqueado,
                })
                .ToListAsync(ct);
            return Ok(PagedResponse<object>.Ok(items.Cast<object>(), total, p.SafePage, p.SafePageSize));
        }

        var all = await query
            .Select(l => new
            {
                l.Id, l.ProductoId,
                ProductoNombre = l.Producto.Nombre,
                l.CodigoLote, l.FechaFabricacion, l.FechaCaducidad,
                l.CantidadInicial, l.Bloqueado,
            })
            .ToListAsync(ct);
        return Ok(ApiResponse<IEnumerable<object>>.Ok(all.Cast<object>()));
    }

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
        int productoId, [FromQuery] decimal cantidad, [FromQuery] OrigenStock origen = OrigenStock.Fabrica, CancellationToken ct = default)
    {
        if (cantidad <= 0)
            return BadRequest(ApiResponse<List<LoteAsignado>>.Fail("La cantidad debe ser mayor que 0"));

        try
        {
            var asignaciones = await _loteService.AsignarLotesAsync(EmpresaId, productoId, cantidad, origen, ct);
            return Ok(ApiResponse<List<LoteAsignado>>.Ok(asignaciones, $"{asignaciones.Count} lote(s) serían asignados"));
        }
        catch (NoHayLotesDisponiblesException ex)
        {
            return Ok(new ApiResponse<List<LoteAsignado>> { Success = false, Data = new List<LoteAsignado>(), Message = ex.Message });
        }
        catch (StockInsuficienteException ex)
        {
            return Ok(new ApiResponse<List<LoteAsignado>> { Success = false, Data = new List<LoteAsignado>(), Message = ex.Message });
        }
        catch (DomainException ex)
        {
            return Ok(new ApiResponse<List<LoteAsignado>> { Success = false, Data = new List<LoteAsignado>(), Message = ex.Message });
        }
    }

    /// <summary>PATCH /api/lotes/{id}/caducidad — Corrige la caducidad de un lote (Admin)</summary>
    [HttpPatch("{id:int}/caducidad")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<ActionResult<ApiResponse<string>>> ActualizarCaducidad(
        int id, [FromBody] ActualizarCaducidadRequest request, CancellationToken ct)
    {
        var lote = await _uow.Lotes.GetByIdAsync(id, ct);
        if (lote is null || lote.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Lote no encontrado"));

        if (request.FechaCaducidad is DateOnly fecha && fecha < lote.FechaFabricacion)
            return BadRequest(ApiResponse<string>.Fail(
                $"La caducidad ({fecha:yyyy-MM-dd}) no puede ser anterior a la fabricacion ({lote.FechaFabricacion:yyyy-MM-dd})."));

        lote.FechaCaducidad = request.FechaCaducidad;
        await _uow.Lotes.UpdateAsync(lote, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("Caducidad actualizada", "Caducidad actualizada"));
    }

    /// <summary>POST /api/lotes/{id}/bloquear — Bloquear un lote</summary>
    [HttpPost("{id:int}/bloquear")]
    [Authorize(Policy = "AnyRole")]
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

/// <summary>Correccion de la fecha de caducidad de un lote (null = sin caducidad).</summary>
public record ActualizarCaducidadRequest(DateOnly? FechaCaducidad);
