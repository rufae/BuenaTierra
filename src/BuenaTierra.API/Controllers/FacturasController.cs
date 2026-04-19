using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
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
    public async Task<ActionResult> GetAll(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta,
        [FromQuery] int? clienteId, [FromQuery] string? estado,
        [FromQuery] int? page, [FromQuery] int? pageSize,
        CancellationToken ct)
    {
        var all = (await _facturaService.GetListAsync(EmpresaId, desde, hasta, ct)).ToList();

        // Optional filters
        if (clienteId.HasValue) all = all.Where(f => f.Cliente.Id == clienteId.Value).ToList();
        if (!string.IsNullOrEmpty(estado)) all = all.Where(f => f.Estado.Equals(estado, StringComparison.OrdinalIgnoreCase)).ToList();

        // Pagination (optional — if not provided, return all for backwards compatibility)
        var p = new PaginationParams(page, pageSize);
        if (p.HasPagination)
        {
            var paged = all.Skip((p.SafePage - 1) * p.SafePageSize).Take(p.SafePageSize);
            return Ok(PagedResponse<FacturaDto>.Ok(paged, all.Count, p.SafePage, p.SafePageSize));
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
                "Solo se pueden eliminar facturas en estado Borrador."));

        if (factura.Estado == EstadoFactura.Enviada)
            return UnprocessableEntity(ApiResponse<string>.Fail(
                "No se puede eliminar una factura ya enviada."));

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
        // Carga facturas con líneas y productos en una sola consulta
        IQueryable<BuenaTierra.Domain.Entities.Factura> q = _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId)
            .Include(f => f.Cliente)
            .Include(f => f.Lineas).ThenInclude(l => l.Producto)
            .Include(f => f.Lineas).ThenInclude(l => l.Lote);
        if (desde.HasValue) q = q.Where(f => f.FechaFactura >= desde.Value);
        if (hasta.HasValue) q = q.Where(f => f.FechaFactura <= hasta.Value);
        var list = await q.OrderByDescending(f => f.FechaFactura).ToListAsync(ct);

        OfficeOpenXml.ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");
        using var package = new OfficeOpenXml.ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Facturas");

        // Cabeceras (formato sanitario: 1 fila por producto-lote)
        ws.Cells[1, 1].Value = "Nº Factura";
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
        foreach (var f in list)
        {
            // Dirección completa del cliente
            var cli = f.Cliente;
            var direccion = cli != null
                ? string.Join(", ", new[] { cli.Direccion, cli.CodigoPostal, cli.Ciudad, cli.Provincia }
                    .Where(s => !string.IsNullOrWhiteSpace(s)))
                : "—";

            var lineas = f.Lineas.Any() ? f.Lineas : new List<BuenaTierra.Domain.Entities.FacturaLinea>();
            if (!lineas.Any())
            {
                ws.Cells[row, 1].Value = f.NumeroFactura;
                ws.Cells[row, 2].Value = f.FechaFactura.ToString("dd/MM/yyyy");
                ws.Cells[row, 3].Value = cli?.NombreCompleto ?? cli?.Nombre ?? "—";
                ws.Cells[row, 4].Value = cli?.Nif ?? "—";
                ws.Cells[row, 5].Value = direccion;
                ws.Cells[row, 6].Value = f.Estado.ToString();
                ws.Cells[row, 7].Value = "—";
                ws.Cells[row, 8].Value = "—";
                ws.Cells[row, 9].Value = 0;
                row++;
                continue;
            }

            foreach (var l in lineas.OrderBy(x => x.Orden))
            {
                ws.Cells[row, 1].Value = f.NumeroFactura;
                ws.Cells[row, 2].Value = f.FechaFactura.ToString("dd/MM/yyyy");
                ws.Cells[row, 3].Value = cli?.NombreCompleto ?? cli?.Nombre ?? "—";
                ws.Cells[row, 4].Value = cli?.Nif ?? "—";
                ws.Cells[row, 5].Value = direccion;
                ws.Cells[row, 6].Value = f.Estado.ToString();
                ws.Cells[row, 7].Value = l.Producto?.Nombre ?? l.Descripcion ?? "Producto";
                ws.Cells[row, 8].Value = l.Lote?.CodigoLote ?? "Sin lote";
                ws.Cells[row, 9].Value = (int)Math.Round(l.Cantidad, 0, MidpointRounding.AwayFromZero);
                row++;
            }
        }

        ws.Cells.AutoFitColumns();
        // Limitar ancho de columnas largas
        if (ws.Cells[1, 5].Value != null) ws.Column(5).Width = Math.Min(ws.Column(5).Width, 55);
        if (ws.Cells[1, 7].Value != null) ws.Column(7).Width = Math.Min(ws.Column(7).Width, 40);
        if (ws.Cells[1, 8].Value != null) ws.Column(8).Width = Math.Min(ws.Column(8).Width, 35);

        var bytes = package.GetAsByteArray();
        var dStr = (desde ?? DateOnly.FromDateTime(DateTime.Today.AddMonths(-1))).ToString("yyyyMMdd");
        var hStr = (hasta ?? DateOnly.FromDateTime(DateTime.Today)).ToString("yyyyMMdd");
        var fileName = $"facturas-{dStr}-{hStr}.xlsx";
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // IMPORTAR FACTURAS HISTÓRICAS
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>GET /api/facturas/importar-plantilla — Descarga la plantilla Excel para importar facturas</summary>
    [HttpGet("importar-plantilla")]
    public IActionResult DescargarPlantilla()
    {
        OfficeOpenXml.ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");
        using var package = new OfficeOpenXml.ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Facturas");

        ws.Cells[1, 1].Value = "NumeroFactura";
        ws.Cells[1, 2].Value = "Fecha";
        ws.Cells[1, 3].Value = "ClienteNIF";
        ws.Cells[1, 4].Value = "ClienteNombre";
        ws.Cells[1, 5].Value = "Total";
        ws.Cells[1, 6].Value = "Descripcion";

        using (var r = ws.Cells[1, 1, 1, 6])
        {
            r.Style.Font.Bold = true;
            r.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            r.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(68, 114, 196));
            r.Style.Font.Color.SetColor(System.Drawing.Color.White);
        }

        // Fila de ejemplo
        ws.Cells[2, 1].Value = "F2026001";
        ws.Cells[2, 2].Value = "15/01/2026";
        ws.Cells[2, 3].Value = "12345678A";
        ws.Cells[2, 4].Value = "Panadería López";
        ws.Cells[2, 5].Value = "125.50";
        ws.Cells[2, 6].Value = "Palmeras x10, Tortas x5";

        ws.Cells.AutoFitColumns();
        var bytes = package.GetAsByteArray();
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "plantilla-importar-facturas.xlsx");
    }

    /// <summary>POST /api/facturas/importar — Importa facturas históricas desde CSV o Excel</summary>
    [HttpPost("importar")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ApiResponse<ImportarFacturasResultado>>> Importar(
        IFormFile archivo, CancellationToken ct)
    {
        if (archivo == null || archivo.Length == 0)
            return BadRequest(ApiResponse<ImportarFacturasResultado>.Fail("No se ha proporcionado ningún archivo."));

        var ext = Path.GetExtension(archivo.FileName).ToLowerInvariant();
        if (ext != ".csv" && ext != ".xlsx" && ext != ".xls")
            return BadRequest(ApiResponse<ImportarFacturasResultado>.Fail("Formato no admitido. Use .csv o .xlsx"));

        var serie = await _uow.SeriesFacturacion.GetQueryable()
            .Where(s => s.EmpresaId == EmpresaId && s.Activa)
            .FirstOrDefaultAsync(ct);
        if (serie == null)
            return BadRequest(ApiResponse<ImportarFacturasResultado>.Fail("No hay ninguna serie de facturación activa."));

        List<ImportarFacturaFila> filas;
        try
        {
            if (ext == ".csv")
            {
                using var reader = new StreamReader(archivo.OpenReadStream());
                filas = ParseCsvImport(await reader.ReadToEndAsync(ct));
            }
            else
            {
                filas = ParseExcelImport(archivo.OpenReadStream());
            }
        }
        catch (Exception ex)
        {
            return BadRequest(ApiResponse<ImportarFacturasResultado>.Fail($"Error al leer el archivo: {ex.Message}"));
        }

        var clientes = (await _uow.Clientes.GetQueryable()
            .Where(c => c.EmpresaId == EmpresaId)
            .ToListAsync(ct)).ToList();

        int importadas = 0;
        int errores = 0;
        var detalles = new List<string>();

        foreach (var (fila, idx) in filas.Select((f, i) => (f, i + 2)))
        {
            try
            {
                if (string.IsNullOrWhiteSpace(fila.NumeroFactura))
                {
                    errores++;
                    detalles.Add($"Fila {idx}: NumeroFactura vacío, omitida.");
                    continue;
                }

                BuenaTierra.Domain.Entities.Cliente? cliente = null;
                if (!string.IsNullOrWhiteSpace(fila.ClienteNif))
                    cliente = clientes.FirstOrDefault(c => c.Nif == fila.ClienteNif.Trim());
                if (cliente == null && !string.IsNullOrWhiteSpace(fila.ClienteNombre))
                    cliente = clientes.FirstOrDefault(c =>
                        c.NombreCompleto.Equals(fila.ClienteNombre.Trim(), StringComparison.OrdinalIgnoreCase));
                if (cliente == null)
                {
                    cliente = new BuenaTierra.Domain.Entities.Cliente
                    {
                        EmpresaId = EmpresaId,
                        Nombre = fila.ClienteNombre ?? fila.ClienteNif ?? "IMPORTADO",
                        Nif = string.IsNullOrWhiteSpace(fila.ClienteNif) ? null : fila.ClienteNif.Trim(),
                        Activo = true,
                        FechaAlta = fila.Fecha
                    };
                    cliente = await _uow.Clientes.AddAsync(cliente, ct);
                    await _uow.SaveChangesAsync(ct);
                    clientes.Add(cliente);
                }

                var factura = new BuenaTierra.Domain.Entities.Factura
                {
                    EmpresaId = EmpresaId,
                    ClienteId = cliente.Id,
                    SerieId = serie.Id,
                    UsuarioId = UsuarioId,
                    NumeroFactura = fila.NumeroFactura.Trim(),
                    FechaFactura = fila.Fecha,
                    Estado = EstadoFactura.Emitida,
                    EsSimplificada = true,
                    Total = fila.Total,
                    BaseImponible = fila.Total,
                    Subtotal = fila.Total,
                    Notas = fila.Descripcion
                };
                await _uow.Facturas.AddAsync(factura, ct);
                await _uow.SaveChangesAsync(ct);
                importadas++;
            }
            catch (Exception ex)
            {
                errores++;
                detalles.Add($"Fila {idx} ({fila.NumeroFactura}): {ex.Message}");
            }
        }

        var resultado = new ImportarFacturasResultado(importadas, errores, detalles);
        return Ok(ApiResponse<ImportarFacturasResultado>.Ok(resultado,
            $"Importación completada: {importadas} facturas importadas, {errores} errores."));
    }

    private record ImportarFacturaFila(string NumeroFactura, DateOnly Fecha, string? ClienteNif, string? ClienteNombre, decimal Total, string? Descripcion);

    public record ImportarFacturasResultado(int Importadas, int Errores, List<string> Detalles);

    private static List<ImportarFacturaFila> ParseExcelImport(Stream stream)
    {
        OfficeOpenXml.ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");
        using var package = new OfficeOpenXml.ExcelPackage(stream);
        var ws = package.Workbook.Worksheets[0]
            ?? throw new InvalidOperationException("El archivo Excel no tiene hojas.");

        var headers = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int col = 1; col <= (ws.Dimension?.Columns ?? 0); col++)
        {
            var h = ws.Cells[1, col].GetValue<string>()?.Trim();
            if (!string.IsNullOrEmpty(h)) headers[NormalizeHeader(h)] = col;
        }

        var filas = new List<ImportarFacturaFila>();
        int lastRow = ws.Dimension?.Rows ?? 1;
        for (int row = 2; row <= lastRow; row++)
        {
            var num = GetExcelCell(ws, row, headers, "numerofactura", "numero", "factura", "nfactura");
            if (string.IsNullOrWhiteSpace(num)) continue;

            var fechaStr = GetExcelCell(ws, row, headers, "fecha", "fechafactura", "fechaemision") ?? "";
            var nif = GetExcelCell(ws, row, headers, "clientenif", "nif", "cif", "dni");
            var nombre = GetExcelCell(ws, row, headers, "clientenombre", "cliente", "nombre", "razonsocial");
            var totalStr = GetExcelCell(ws, row, headers, "total", "importe", "importetotal", "totalfactura") ?? "0";
            var desc = GetExcelCell(ws, row, headers, "descripcion", "descripcion", "concepto", "productos", "notas");

            var total = decimal.TryParse(totalStr.Replace(",", "."),
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var t) ? t : 0m;

            filas.Add(new ImportarFacturaFila(num, ParseFechaImport(fechaStr), nif, nombre, total, desc));
        }
        return filas;
    }

    private static List<ImportarFacturaFila> ParseCsvImport(string content)
    {
        var lines = content.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length < 2) throw new InvalidOperationException("El CSV está vacío o solo tiene cabecera.");

        var sep = lines[0].Contains(';') ? ';' : ',';
        var headerParts = lines[0].Trim().Split(sep);
        var headers = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < headerParts.Length; i++)
            headers[NormalizeHeader(headerParts[i].Trim('"', ' '))] = i;

        var filas = new List<ImportarFacturaFila>();
        for (int i = 1; i < lines.Length; i++)
        {
            var parts = lines[i].Trim().Split(sep);
            string ColVal(params string[] keys)
            {
                foreach (var k in keys)
                    if (headers.TryGetValue(k, out var idx) && idx < parts.Length)
                        return parts[idx].Trim('"', ' ');
                return string.Empty;
            }

            var num = ColVal("numerofactura", "numero", "factura", "nfactura");
            if (string.IsNullOrWhiteSpace(num)) continue;

            var fechaStr = ColVal("fecha", "fechafactura", "fechaemision");
            var nif = ColVal("clientenif", "nif", "cif", "dni");
            if (string.IsNullOrEmpty(nif)) nif = null;
            var nombre = ColVal("clientenombre", "cliente", "nombre", "razonsocial");
            if (string.IsNullOrEmpty(nombre)) nombre = null;
            var totalStr = ColVal("total", "importe", "importetotal", "totalfactura");
            var total = decimal.TryParse(totalStr.Replace(",", "."),
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var t) ? t : 0m;
            var desc = ColVal("descripcion", "descripcion", "concepto", "productos", "notas");
            if (string.IsNullOrEmpty(desc)) desc = null;

            filas.Add(new ImportarFacturaFila(num, ParseFechaImport(fechaStr), nif, nombre, total, desc));
        }
        return filas;
    }

    private static string NormalizeHeader(string s) =>
        s.ToLowerInvariant()
         .Replace(" ", "")
         .Replace("á", "a").Replace("é", "e").Replace("í", "i").Replace("ó", "o").Replace("ú", "u")
         .Replace("ñ", "n").Replace("ü", "u").Replace("ó", "o");

    private static string? GetExcelCell(OfficeOpenXml.ExcelWorksheet ws, int row, Dictionary<string, int> headers, params string[] keys)
    {
        foreach (var k in keys)
            if (headers.TryGetValue(k, out var col))
                return ws.Cells[row, col].GetValue<string>();
        return null;
    }

    private static DateOnly ParseFechaImport(string s)
    {
        if (DateTime.TryParseExact(s.Trim(),
            new[] { "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "d/M/yy", "dd/MM/yy" },
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out var dt))
            return DateOnly.FromDateTime(dt);
        return DateOnly.FromDateTime(DateTime.Today);
    }
}
