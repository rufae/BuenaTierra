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

    /// <summary>GET /api/facturas — Listar facturas con filtros opcionales y paginación</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<FacturaDto>>>> GetAll(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta,
        [FromQuery] int? clienteId, [FromQuery] string? estado,
        [FromQuery] int? page, [FromQuery] int? pageSize,
        CancellationToken ct)
    {
        var all = (await _facturaService.GetListAsync(EmpresaId, desde, hasta, ct)).ToList();

        // Optional filters
        if (clienteId.HasValue) all = all.Where(f => f.Cliente.Id == clienteId.Value).ToList();
        if (!string.IsNullOrEmpty(estado)) all = all.Where(f => f.Estado.Equals(estado, StringComparison.OrdinalIgnoreCase)).ToList();

        // Pagination (optional — if not provided, return all)
        if (page.HasValue && pageSize.HasValue && pageSize.Value > 0)
        {
            var total = all.Count;
            var paged = all.Skip((page.Value - 1) * pageSize.Value).Take(pageSize.Value);
            return Ok(PagedResponse<FacturaDto>.Ok(paged, total, page.Value, pageSize.Value));
        }

        return Ok(ApiResponse<IEnumerable<FacturaDto>>.Ok(all));
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

    // ═══════════════════════════════════════════════════════
    // ELIMINAR (con restricción de estado)
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// DELETE /api/facturas/{id} — Solo permite eliminar facturas en estado Borrador.
    /// Las facturas Emitida o Cobrada NO se pueden eliminar (requisito legal/fiscal).
    /// </summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Eliminar(int id, CancellationToken ct)
    {
        var factura = await _uow.Facturas.GetByIdAsync(id, ct);
        if (factura == null || factura.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Factura no encontrada"));

        if (factura.Estado == EstadoFactura.Emitida || factura.Estado == EstadoFactura.Cobrada)
            return UnprocessableEntity(ApiResponse<string>.Fail(
                $"No se puede eliminar una factura en estado '{factura.Estado}'. " +
                "Solo se pueden eliminar facturas en estado Borrador. " +
                "Si necesita anularla, use la opción 'Anular'."));

        if (factura.Estado == EstadoFactura.Enviada)
            return UnprocessableEntity(ApiResponse<string>.Fail(
                "No se puede eliminar una factura ya enviada. Use la opción 'Anular'."));

        await _uow.Facturas.DeleteAsync(factura, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Factura eliminada"));
    }

    // ═══════════════════════════════════════════════════════
    // EXPORTAR LISTA A EXCEL
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// GET /api/facturas/exportar-excel — Exporta la lista de facturas a Excel
    /// </summary>
    [HttpGet("exportar-excel")]
    public async Task<IActionResult> ExportarListaExcel(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, CancellationToken ct)
    {
        var facturas = await _facturaService.GetListAsync(EmpresaId, desde, hasta, ct);
        var list = facturas.ToList();

        using var package = new OfficeOpenXml.ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Facturas");

        // Cabeceras
        ws.Cells[1, 1].Value = "Nº Factura";
        ws.Cells[1, 2].Value = "Fecha";
        ws.Cells[1, 3].Value = "Cliente";
        ws.Cells[1, 4].Value = "Estado";
        ws.Cells[1, 5].Value = "Base imponible";
        ws.Cells[1, 6].Value = "IVA";
        ws.Cells[1, 7].Value = "Total";
        ws.Cells[1, 8].Value = "Simplificada";

        using (var headerRange = ws.Cells[1, 1, 1, 8])
        {
            headerRange.Style.Font.Bold = true;
            headerRange.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            headerRange.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(68, 114, 196));
            headerRange.Style.Font.Color.SetColor(System.Drawing.Color.White);
        }

        int row = 2;
        foreach (var f in list)
        {
            ws.Cells[row, 1].Value = f.NumeroFactura;
            ws.Cells[row, 2].Value = f.FechaFactura.ToString("dd/MM/yyyy");
            ws.Cells[row, 3].Value = f.Cliente?.Nombre ?? "—";
            ws.Cells[row, 4].Value = f.Estado;
            ws.Cells[row, 5].Value = (double)f.BaseImponible;
            ws.Cells[row, 6].Value = (double)f.IvaTotal;
            ws.Cells[row, 7].Value = (double)f.Total;
            ws.Cells[row, 8].Value = f.EsSimplificada ? "Sí" : "No";
            row++;
        }

        ws.Cells[2, 5, row - 1, 7].Style.Numberformat.Format = "#,##0.00 €";
        ws.Cells.AutoFitColumns();

        var bytes = package.GetAsByteArray();
        var dStr = (desde ?? DateOnly.FromDateTime(DateTime.Today.AddMonths(-1))).ToString("yyyyMMdd");
        var hStr = (hasta ?? DateOnly.FromDateTime(DateTime.Today)).ToString("yyyyMMdd");
        var fileName = $"facturas-{dStr}-{hStr}.xlsx";
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
    }
}
