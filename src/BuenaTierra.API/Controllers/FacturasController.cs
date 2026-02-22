using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Exceptions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FacturasController : ControllerBase
{
    private readonly IFacturaService _facturaService;

    public FacturasController(IFacturaService facturaService)
    {
        _facturaService = facturaService;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// POST /api/facturas/crear
    /// Crea una factura con asignación FIFO automática de lotes.
    /// El usuario solo especifica producto + cantidad; el sistema asigna lotes y genera líneas.
    /// </summary>
    [HttpPost("crear")]
    public async Task<ActionResult<ApiResponse<FacturaCreada>>> Crear(
        [FromBody] CrearFacturaRequest request, CancellationToken ct)
    {
        request.EmpresaId = EmpresaId;
        request.UsuarioId = UsuarioId;

        var result = await _facturaService.CrearFacturaAsync(request, ct);
        return Ok(ApiResponse<FacturaCreada>.Ok(result, $"Factura {result.NumeroFactura} creada correctamente"));
    }

    /// <summary>GET /api/facturas/{id} — Obtener factura con todas sus líneas y lotes</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<FacturaDto>>> Get(int id, CancellationToken ct)
    {
        var factura = await _facturaService.GetFacturaAsync(id, EmpresaId, ct);
        return Ok(ApiResponse<FacturaDto>.Ok(factura));
    }

    /// <summary>GET /api/facturas — Listar facturas con filtros opcionales</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<FacturaDto>>>> GetAll(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, CancellationToken ct)
    {
        var facturas = await _facturaService.GetListAsync(EmpresaId, desde, hasta, ct);
        return Ok(ApiResponse<IEnumerable<FacturaDto>>.Ok(facturas));
    }

    /// <summary>GET /api/facturas/{id}/pdf — Descargar PDF de factura (QuestPDF)</summary>
    [HttpGet("{id:int}/pdf")]
    public async Task<IActionResult> GetPdf(int id, CancellationToken ct)
    {
        var bytes = await _facturaService.GetPdfBytesAsync(id, EmpresaId, ct);
        if (bytes.Length == 0)
            return NotFound(ApiResponse<string>.Fail("PDF no disponible"));
        return File(bytes, "application/pdf", $"factura-{id}.pdf");
    }

    /// <summary>GET /api/facturas/{id}/excel — Descargar Excel de factura con trazabilidad por lotes</summary>
    [HttpGet("{id:int}/excel")]
    public async Task<IActionResult> GetExcel(int id, CancellationToken ct)
    {
        var bytes = await _facturaService.GetExcelBytesAsync(id, EmpresaId, ct);
        return File(bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"factura-{id}-trazabilidad.xlsx");
    }

    /// <summary>
    /// GET /api/facturas/trazabilidad/excel?desde=2026-01-01&amp;hasta=2026-12-31
    /// Informe de trazabilidad completo (Reglamento CE 178/2002) en Excel — para Ministerio de Sanidad.
    /// </summary>
    [HttpGet("trazabilidad/excel")]
    public async Task<IActionResult> GetTrazabilidadExcel(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, CancellationToken ct)
    {
        var desdeVal = desde ?? DateOnly.FromDateTime(DateTime.Today.AddMonths(-1));
        var hastaVal = hasta ?? DateOnly.FromDateTime(DateTime.Today);

        var bytes = await _facturaService.GetExcelTrazabilidadAsync(EmpresaId, desdeVal, hastaVal, ct);
        return File(bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"trazabilidad-{desdeVal:yyyyMMdd}-{hastaVal:yyyyMMdd}.xlsx");
    }
}
