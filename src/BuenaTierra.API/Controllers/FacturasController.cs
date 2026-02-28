using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
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
    private readonly IUnitOfWork _uow;

    public FacturasController(IFacturaService facturaService, IUnitOfWork uow)
    {
        _facturaService = facturaService;
        _uow = uow;
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

    // ═══════════════════════════════════════════════════════
    // TRANSICIONES DE ESTADO
    // ═══════════════════════════════════════════════════════

    /// <summary>POST /api/facturas/{id}/emitir — Borrador → Emitida</summary>
    [HttpPost("{id:int}/emitir")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Emitir(int id, CancellationToken ct)
    {
        var factura = await _uow.Facturas.GetByIdAsync(id, ct);
        if (factura == null || factura.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Factura no encontrada"));
        if (factura.Estado != EstadoFactura.Borrador)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden emitir facturas en estado Borrador"));

        factura.Estado = EstadoFactura.Emitida;
        await _uow.Facturas.UpdateAsync(factura, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Factura emitida"));
    }

    /// <summary>POST /api/facturas/{id}/enviar — Emitida → Enviada</summary>
    [HttpPost("{id:int}/enviar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Enviar(int id, CancellationToken ct)
    {
        var factura = await _uow.Facturas.GetByIdAsync(id, ct);
        if (factura == null || factura.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Factura no encontrada"));
        if (factura.Estado != EstadoFactura.Emitida)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden enviar facturas en estado Emitida"));

        factura.Estado = EstadoFactura.Enviada;
        await _uow.Facturas.UpdateAsync(factura, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Factura marcada como enviada"));
    }

    /// <summary>POST /api/facturas/{id}/cobrar — Emitida|Enviada → Cobrada</summary>
    [HttpPost("{id:int}/cobrar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Cobrar(int id, CancellationToken ct)
    {
        var factura = await _uow.Facturas.GetByIdAsync(id, ct);
        if (factura == null || factura.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Factura no encontrada"));
        if (factura.Estado != EstadoFactura.Emitida && factura.Estado != EstadoFactura.Enviada)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden cobrar facturas en estado Emitida o Enviada"));

        factura.Estado = EstadoFactura.Cobrada;
        await _uow.Facturas.UpdateAsync(factura, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Factura cobrada"));
    }

    /// <summary>POST /api/facturas/{id}/anular — Cualquier estado (excepto Anulada) → Anulada</summary>
    [HttpPost("{id:int}/anular")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Anular(int id, CancellationToken ct)
    {
        var factura = await _uow.Facturas.GetByIdAsync(id, ct);
        if (factura == null || factura.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Factura no encontrada"));
        if (factura.Estado == EstadoFactura.Anulada)
            return BadRequest(ApiResponse<string>.Fail("La factura ya está anulada"));

        factura.Estado = EstadoFactura.Anulada;
        await _uow.Facturas.UpdateAsync(factura, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Factura anulada"));
    }
}
