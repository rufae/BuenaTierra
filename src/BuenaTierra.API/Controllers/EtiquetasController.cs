using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class EtiquetasController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly IWebHostEnvironment _env;
    private readonly BarcodeService _barcodeSvc;
    private readonly DocumentConversionService _docSvc;
    private readonly OdtVariableService _odtSvc;

    public EtiquetasController(
        IUnitOfWork uow,
        IWebHostEnvironment env,
        BarcodeService barcodeSvc,
        DocumentConversionService docSvc,
        OdtVariableService odtSvc)
    {
        _uow = uow;
        _env = env;
        _barcodeSvc = barcodeSvc;
        _docSvc = docSvc;
        _odtSvc = odtSvc;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // ═══════════════════════════════════════════════════════
    // PLANTILLAS
    // ═══════════════════════════════════════════════════════

    [HttpGet("plantillas")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetPlantillas(CancellationToken ct)
    {
        var items = await _uow.PlantillasEtiqueta.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId && p.Activa)
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new
            {
                p.Id,
                p.Nombre,
                p.Descripcion,
                p.AnchoMm,
                p.AltoMm,
                TipoImpresora = p.TipoImpresora.ToString(),
                p.EsPlantillaBase,
                p.ContenidoJson,
                p.ContenidoHtml,
                p.CreatedAt,
            })
            .ToListAsync(ct);
        return Ok(ApiResponse<IEnumerable<object>>.Ok(items.Cast<object>()));
    }

    [HttpGet("plantillas/{id:int}")]
    public async Task<ActionResult<ApiResponse<PlantillaEtiqueta>>> GetPlantilla(int id, CancellationToken ct)
    {
        var p = await _uow.PlantillasEtiqueta.GetQueryable()
            .FirstOrDefaultAsync(x => x.Id == id && x.EmpresaId == EmpresaId, ct)
            ?? throw new EntidadNotFoundException(nameof(PlantillaEtiqueta), id);
        return Ok(ApiResponse<PlantillaEtiqueta>.Ok(p));
    }

    [HttpPost("plantillas")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<PlantillaEtiqueta>>> CreatePlantilla(
        [FromBody] PlantillaRequest req, CancellationToken ct)
    {
        var p = new PlantillaEtiqueta
        {
            EmpresaId     = EmpresaId,
            Nombre        = req.Nombre,
            Descripcion   = req.Descripcion,
            AnchoMm       = req.AnchoMm,
            AltoMm        = req.AltoMm,
            TipoImpresora = Enum.Parse<TipoImpresora>(req.TipoImpresora ?? "A4", true),
            ContenidoJson = req.ContenidoJson ?? "{}",
            ContenidoHtml = req.ContenidoHtml,
            UsuarioId     = UsuarioId,
        };
        await _uow.PlantillasEtiqueta.AddAsync(p, ct);
        await _uow.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetPlantilla), new { id = p.Id }, ApiResponse<PlantillaEtiqueta>.Ok(p));
    }

    [HttpPut("plantillas/{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<PlantillaEtiqueta>>> UpdatePlantilla(
        int id, [FromBody] PlantillaRequest req, CancellationToken ct)
    {
        var p = await _uow.PlantillasEtiqueta.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(PlantillaEtiqueta), id);
        if (p.EmpresaId != EmpresaId) return Forbid();

        p.Nombre        = req.Nombre;
        p.Descripcion   = req.Descripcion;
        p.AnchoMm       = req.AnchoMm;
        p.AltoMm        = req.AltoMm;
        p.TipoImpresora = Enum.Parse<TipoImpresora>(req.TipoImpresora ?? "A4", true);
        p.ContenidoJson = req.ContenidoJson ?? p.ContenidoJson;
        p.ContenidoHtml = req.ContenidoHtml;

        await _uow.PlantillasEtiqueta.UpdateAsync(p, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<PlantillaEtiqueta>.Ok(p));
    }

    [HttpDelete("plantillas/{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> DeletePlantilla(int id, CancellationToken ct)
    {
        var p = await _uow.PlantillasEtiqueta.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(PlantillaEtiqueta), id);
        if (p.EmpresaId != EmpresaId) return Forbid();
        if (p.EsPlantillaBase)
            return BadRequest(ApiResponse<string>.Fail("No se pueden eliminar plantillas base del sistema"));

        p.Activa = false;
        await _uow.PlantillasEtiqueta.UpdateAsync(p, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("Plantilla desactivada"));
    }

    // ═══════════════════════════════════════════════════════
    // ETIQUETAS IMPORTADAS
    // ═══════════════════════════════════════════════════════

    [HttpGet("importadas")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetImportadas(CancellationToken ct)
    {
        var items = await _uow.EtiquetasImportadas.GetQueryable()
            .Where(e => e.EmpresaId == EmpresaId)
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new
            {
                e.Id,
                e.Nombre,
                Formato = e.Formato.ToString(),
                e.TamanoBytes,
                e.RutaArchivo,
                e.CreatedAt,
            })
            .ToListAsync(ct);
        return Ok(ApiResponse<IEnumerable<object>>.Ok(items.Cast<object>()));
    }

    [HttpPost("importar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> Importar(IFormFile archivo, CancellationToken ct)
    {
        if (archivo == null || archivo.Length == 0)
            return BadRequest(ApiResponse<string>.Fail("Se requiere un archivo"));

        var ext = Path.GetExtension(archivo.FileName).TrimStart('.').ToLowerInvariant();
        // Normalizar .jpeg → .jpg para que coincida con el enum FormatoEtiqueta
        if (ext == "jpeg") ext = "jpg";
        if (!Enum.TryParse<FormatoEtiqueta>(ext, true, out var formato))
            return BadRequest(ApiResponse<string>.Fail($"Formato no soportado: .{ext}"));

        var uploadsDir = Path.Combine(_env.ContentRootPath, "uploads", "etiquetas", EmpresaId.ToString());
        Directory.CreateDirectory(uploadsDir);

        var fileName = $"{Guid.NewGuid():N}{Path.GetExtension(archivo.FileName)}";
        var fullPath = Path.Combine(uploadsDir, fileName);

        await using var stream = new FileStream(fullPath, FileMode.Create);
        await archivo.CopyToAsync(stream, ct);

        var entity = new EtiquetaImportada
        {
            EmpresaId    = EmpresaId,
            Nombre       = Path.GetFileNameWithoutExtension(archivo.FileName),
            RutaArchivo  = $"uploads/etiquetas/{EmpresaId}/{fileName}",
            Formato      = formato,
            TamanoBytes  = archivo.Length,
            UsuarioId    = UsuarioId,
        };
        await _uow.EtiquetasImportadas.AddAsync(entity, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new { entity.Id, entity.Nombre, Formato = entity.Formato.ToString() }));
    }

    [HttpDelete("importadas/{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> DeleteImportada(int id, CancellationToken ct)
    {
        var e = await _uow.EtiquetasImportadas.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(EtiquetaImportada), id);
        if (e.EmpresaId != EmpresaId) return Forbid();

        // Borrar archivo físico si existe
        var fullPath = Path.Combine(_env.ContentRootPath, e.RutaArchivo);
        if (System.IO.File.Exists(fullPath))
            System.IO.File.Delete(fullPath);

        await _uow.EtiquetasImportadas.DeleteAsync(e, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("Eliminado"));
    }

    [HttpGet("importadas/{id:int}/descargar")]
    public async Task<IActionResult> DescargarImportada(int id, CancellationToken ct)
    {
        var e = await _uow.EtiquetasImportadas.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(EtiquetaImportada), id);
        if (e.EmpresaId != EmpresaId) return Forbid();

        var fullPath = Path.Combine(_env.ContentRootPath, e.RutaArchivo);
        if (!System.IO.File.Exists(fullPath))
            return NotFound(ApiResponse<string>.Fail("Archivo no encontrado en disco"));

        var contentType = e.Formato switch
        {
            FormatoEtiqueta.Odt  => "application/vnd.oasis.opendocument.text",
            FormatoEtiqueta.Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            FormatoEtiqueta.Pdf  => "application/pdf",
            FormatoEtiqueta.Png  => "image/png",
            FormatoEtiqueta.Jpg  => "image/jpeg",
            _                    => "application/octet-stream",
        };
        var fileName = $"{e.Nombre}.{e.Formato.ToString().ToLowerInvariant()}";
        var bytes = await System.IO.File.ReadAllBytesAsync(fullPath, ct);

        // Para formatos visualizables en browser (PDF, imágenes), servir inline.
        // Para documentos (ODT, DOCX), servir como attachment para forzar descarga.
        var isInlineViewable = e.Formato is FormatoEtiqueta.Pdf or FormatoEtiqueta.Png or FormatoEtiqueta.Jpg;
        if (isInlineViewable)
        {
            Response.Headers["Content-Disposition"] = $"inline; filename=\"{fileName}\"";
            return File(bytes, contentType);
        }
        return File(bytes, contentType, fileName);
    }

    // ═══════════════════════════════════════════════════════
    // TIPOS IVA ↔ RE
    // ═══════════════════════════════════════════════════════

    [HttpGet("tipos-iva-re")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetTiposIvaRe(CancellationToken ct)
    {
        var items = await _uow.TiposIvaRe.GetQueryable()
            .Where(t => t.EmpresaId == EmpresaId && t.Activo)
            .OrderBy(t => t.IvaPorcentaje)
            .Select(t => new
            {
                t.Id,
                t.IvaPorcentaje,
                t.RecargoEquivalenciaPorcentaje,
                t.Descripcion,
            })
            .ToListAsync(ct);
        return Ok(ApiResponse<IEnumerable<object>>.Ok(items.Cast<object>()));
    }

    [HttpPost("tipos-iva-re")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> CreateTipoIvaRe([FromBody] TipoIvaReRequest req, CancellationToken ct)
    {
        // Verificar duplicado (empresa + IVA%)
        var existente = await _uow.TiposIvaRe.GetQueryable()
            .AnyAsync(t => t.EmpresaId == EmpresaId && t.IvaPorcentaje == req.IvaPorcentaje, ct);
        if (existente)
            return Conflict(ApiResponse<string>.Fail($"Ya existe un tipo IVA con {req.IvaPorcentaje}% para esta empresa"));

        var entity = new TipoIvaRe
        {
            EmpresaId                      = EmpresaId,
            IvaPorcentaje                  = req.IvaPorcentaje,
            RecargoEquivalenciaPorcentaje  = req.RecargoEquivalenciaPorcentaje,
            Descripcion                    = req.Descripcion,
        };
        await _uow.TiposIvaRe.AddAsync(entity, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { entity.Id, entity.IvaPorcentaje, entity.RecargoEquivalenciaPorcentaje }));
    }

    [HttpPut("tipos-iva-re/{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> UpdateTipoIvaRe(int id, [FromBody] TipoIvaReRequest req, CancellationToken ct)
    {
        var e = await _uow.TiposIvaRe.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(TipoIvaRe), id);
        if (e.EmpresaId != EmpresaId) return Forbid();

        // Check duplicate (same IVA% but different id)
        var duplicado = await _uow.TiposIvaRe.GetQueryable()
            .AnyAsync(t => t.EmpresaId == EmpresaId && t.IvaPorcentaje == req.IvaPorcentaje && t.Id != id, ct);
        if (duplicado)
            return Conflict(ApiResponse<string>.Fail($"Ya existe otro tipo IVA con {req.IvaPorcentaje}%"));

        e.IvaPorcentaje                 = req.IvaPorcentaje;
        e.RecargoEquivalenciaPorcentaje = req.RecargoEquivalenciaPorcentaje;
        e.Descripcion                   = req.Descripcion;

        await _uow.TiposIvaRe.UpdateAsync(e, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new { e.Id, e.IvaPorcentaje, e.RecargoEquivalenciaPorcentaje, e.Descripcion }));
    }

    [HttpDelete("tipos-iva-re/{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> DeleteTipoIvaRe(int id, CancellationToken ct)
    {
        var e = await _uow.TiposIvaRe.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(TipoIvaRe), id);
        if (e.EmpresaId != EmpresaId) return Forbid();
        e.Activo = false;
        await _uow.TiposIvaRe.UpdateAsync(e, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("Desactivado"));
    }

    // ═══════════════════════════════════════════════════════
    // IMPRESIÓN (cola de trabajos)
    // ═══════════════════════════════════════════════════════

    [HttpPost("imprimir")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> Imprimir([FromBody] ImprimirRequest req, CancellationToken ct)
    {
        var plantilla = await _uow.PlantillasEtiqueta.GetByIdAsync(req.PlantillaEtiquetaId, ct)
            ?? throw new EntidadNotFoundException(nameof(PlantillaEtiqueta), req.PlantillaEtiquetaId);

        var trabajo = new TrabajoImpresionEtiqueta
        {
            EmpresaId            = EmpresaId,
            PlantillaEtiquetaId  = req.PlantillaEtiquetaId,
            ProductoId           = req.ProductoId,
            LoteId               = req.LoteId,
            Copias               = req.Copias > 0 ? req.Copias : 1,
            Estado               = EstadoImpresion.Pendiente,
            UsuarioId            = UsuarioId,
        };
        await _uow.TrabajosImpresion.AddAsync(trabajo, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { trabajo.Id, Estado = trabajo.Estado.ToString() }));
    }

    [HttpGet("trabajos")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetTrabajos(
        [FromQuery] string? estado, CancellationToken ct)
    {
        var q = _uow.TrabajosImpresion.GetQueryable()
            .Where(t => t.EmpresaId == EmpresaId);

        if (!string.IsNullOrEmpty(estado) && Enum.TryParse<EstadoImpresion>(estado, true, out var est))
            q = q.Where(t => t.Estado == est);

        var items = await q
            .OrderByDescending(t => t.CreatedAt)
            .Take(100)
            .Select(t => new
            {
                t.Id,
                PlantillaNombre = t.PlantillaEtiqueta.Nombre,
                ProductoNombre  = t.Producto != null ? t.Producto.Nombre : null,
                CodigoLote      = t.Lote != null ? t.Lote.CodigoLote : null,
                t.Copias,
                Estado = t.Estado.ToString(),
                t.CreatedAt,
            })
            .ToListAsync(ct);
        return Ok(ApiResponse<IEnumerable<object>>.Ok(items.Cast<object>()));
    }

    // ═══════════════════════════════════════════════════════
    // PREVIEW: datos para previsualización de etiqueta
    // ═══════════════════════════════════════════════════════

    [HttpGet("preview/{plantillaId:int}")]
    public async Task<ActionResult<ApiResponse<object>>> Preview(
        int plantillaId, [FromQuery] int? productoId, [FromQuery] int? loteId, CancellationToken ct)
    {
        var plantilla = await _uow.PlantillasEtiqueta.GetByIdAsync(plantillaId, ct)
            ?? throw new EntidadNotFoundException(nameof(PlantillaEtiqueta), plantillaId);

        object? productoData = null;
        object? loteData = null;
        object? empresaData = null;

        // Siempre incluir datos de empresa para rellenar campos {{empresa.*}}
        var empresa = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        if (empresa != null)
        {
            empresaData = new
            {
                empresa.Nombre,
                Cif = empresa.Nif,
                empresa.Direccion,
                Nrgs = empresa.NumeroRgseaa,
            };
        }

        if (productoId.HasValue)
        {
            var prod = await _uow.Productos.GetByIdAsync(productoId.Value, ct);
            if (prod != null)
            {
                productoData = new
                {
                    prod.Id,
                    prod.Nombre,
                    prod.Codigo,
                    prod.CodigoBarras,
                    prod.PrecioVenta,
                    prod.IvaPorcentaje,
                    prod.PesoUnitarioGr,
                    prod.UnidadMedida,
                    prod.VidaUtilDias,
                    prod.IngredientesTexto,
                    prod.Trazas,
                    prod.Conservacion,
                    prod.ValorEnergeticoKj,
                    prod.ValorEnergeticoKcal,
                    prod.Grasas,
                    prod.GrasasSaturadas,
                    prod.HidratosCarbono,
                    prod.Azucares,
                    prod.Proteinas,
                    prod.Sal,
                };
            }
        }

        if (loteId.HasValue)
        {
            var lote = await _uow.Lotes.GetByIdAsync(loteId.Value, ct);
            if (lote != null)
            {
                loteData = new
                {
                    lote.Id,
                    lote.CodigoLote,
                    lote.FechaFabricacion,
                    lote.FechaCaducidad,
                };
            }
        }

        return Ok(ApiResponse<object>.Ok(new
        {
            Plantilla = new
            {
                plantilla.Id,
                plantilla.Nombre,
                plantilla.AnchoMm,
                plantilla.AltoMm,
                plantilla.ContenidoJson,
                plantilla.ContenidoHtml,
            },
            Producto = productoData,
            Lote = loteData,
            Empresa = empresaData,
        }));
    }

    // ═══════════════════════════════════════════════════════
    // BARCODE
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Genera una imagen PNG del código de barras de un producto.
    /// GET /api/etiquetas/barcode/{productoId}
    /// </summary>
    [HttpGet("barcode/{productoId:int}")]
    [ResponseCache(Duration = 3600)]
    public async Task<IActionResult> GetBarcode(int productoId, [FromQuery] int w = 300, [FromQuery] int h = 100, CancellationToken ct = default)
    {
        var producto = await _uow.Productos.GetByIdAsync(productoId, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), productoId);
        var png = _barcodeSvc.GenerateBarcodePng(producto.CodigoBarras ?? "", w, h);
        return File(png, "image/png");
    }

    /// <summary>
    /// Genera una imagen PNG de un código QR con contenido libre.
    /// GET /api/etiquetas/qr?content=xxx
    /// </summary>
    [HttpGet("qr")]
    [ResponseCache(Duration = 3600)]
    public IActionResult GetQr([FromQuery] string content, [FromQuery] int size = 200)
    {
        var png = _barcodeSvc.GenerateQrPng(content ?? "", size);
        return File(png, "image/png");
    }

    // ═══════════════════════════════════════════════════════
    // EXPORTAR PLANTILLA HTML → PDF
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Exporta una plantilla HTML a PDF con las dimensiones configuradas.
    /// GET /api/etiquetas/plantillas/{id}/exportar-pdf?productoId=X&loteId=Y
    /// </summary>
    [HttpGet("plantillas/{id:int}/exportar-pdf")]
    public async Task<IActionResult> ExportarPlantillaPdf(
        int id, [FromQuery] int? productoId, [FromQuery] int? loteId, CancellationToken ct)
    {
        var plantilla = await _uow.PlantillasEtiqueta.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(PlantillaEtiqueta), id);
        if (plantilla.EmpresaId != EmpresaId) return Forbid();

        var html = plantilla.ContenidoHtml ?? "<p>Sin contenido</p>";

        // Sustituir variables si se proporcionan producto/lote
        if (productoId.HasValue || loteId.HasValue)
        {
            var producto = productoId.HasValue ? await _uow.Productos.GetByIdAsync(productoId.Value, ct) : null;
            var lote = loteId.HasValue ? await _uow.Lotes.GetByIdAsync(loteId.Value, ct) : null;
            var empresa = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
            var vars = _odtSvc.BuildVariables(producto, lote, empresa);

            foreach (var (key, value) in vars)
            {
                html = html.Replace("{{" + key + "}}", System.Net.WebUtility.HtmlEncode(value));
            }

            // Replace barcode_img placeholder with inline data URI
            if (producto?.CodigoBarras != null)
            {
                var barcodeBytes = _barcodeSvc.GenerateBarcodePng(producto.CodigoBarras);
                var base64 = Convert.ToBase64String(barcodeBytes);
                html = html.Replace("{{producto.barcode_img}}", $"data:image/png;base64,{base64}");
            }
        }

        // Wrap in full HTML doc with proper sizing
        var fullHtml = WrapHtmlForPdf(html, plantilla.AnchoMm, plantilla.AltoMm);
        var pdfBytes = await _docSvc.ConvertHtmlToPdfAsync(fullHtml, plantilla.AnchoMm, plantilla.AltoMm, ct);

        // Build filename: {producto}_{lote}.pdf or plantilla name as fallback
        var producto2 = productoId.HasValue ? await _uow.Productos.GetByIdAsync(productoId.Value, ct) : null;
        var lote2 = loteId.HasValue ? await _uow.Lotes.GetByIdAsync(loteId.Value, ct) : null;
        var pdfName = producto2 != null && lote2 != null
            ? $"{producto2.Nombre}_{lote2.CodigoLote}.pdf"
            : producto2 != null
                ? $"{producto2.Nombre}.pdf"
                : $"{plantilla.Nombre}.pdf";

        Response.Headers["Content-Disposition"] = $"inline; filename=\"{pdfName}\"";
        return File(pdfBytes, "application/pdf");
    }

    // ═══════════════════════════════════════════════════════
    // GENERAR ETIQUETA DESDE IMPORTADA (ODT con variables)
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Rellena las variables {{xxx}} de un archivo ODT importado con datos reales.
    /// POST /api/etiquetas/importadas/{id}/generar { productoId, loteId }
    /// </summary>
    [HttpPost("importadas/{id:int}/generar")]
    public async Task<IActionResult> GenerarDesdeImportada(
        int id, [FromBody] GenerarImportadaRequest req, CancellationToken ct)
    {
        var etiqueta = await _uow.EtiquetasImportadas.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(EtiquetaImportada), id);
        if (etiqueta.EmpresaId != EmpresaId) return Forbid();

        if (etiqueta.Formato != FormatoEtiqueta.Odt)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden rellenar variables en archivos ODT"));

        var fullPath = Path.Combine(_env.ContentRootPath, etiqueta.RutaArchivo);
        if (!System.IO.File.Exists(fullPath))
            return NotFound(ApiResponse<string>.Fail("Archivo no encontrado en disco"));

        var producto = req.ProductoId.HasValue ? await _uow.Productos.GetByIdAsync(req.ProductoId.Value, ct) : null;
        var lote = req.LoteId.HasValue ? await _uow.Lotes.GetByIdAsync(req.LoteId.Value, ct) : null;
        var empresa = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        var variables = _odtSvc.BuildVariables(producto, lote, empresa);

        await using var inputStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
        var resultStream = await _odtSvc.RellenarVariablesAsync(inputStream, variables, ct);

        var fileName = $"{etiqueta.Nombre}_generada.odt";
        return File(resultStream, "application/vnd.oasis.opendocument.text", fileName);
    }

    /// <summary>
    /// Convierte un ODT importado a PDF (requiere LibreOffice).
    /// GET /api/etiquetas/importadas/{id}/preview-pdf?productoId=X&loteId=Y
    /// </summary>
    [HttpGet("importadas/{id:int}/preview-pdf")]
    public async Task<IActionResult> PreviewImportadaPdf(
        int id, [FromQuery] int? productoId, [FromQuery] int? loteId, CancellationToken ct)
    {
        var etiqueta = await _uow.EtiquetasImportadas.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(EtiquetaImportada), id);
        if (etiqueta.EmpresaId != EmpresaId) return Forbid();

        var fullPath = Path.Combine(_env.ContentRootPath, etiqueta.RutaArchivo);
        if (!System.IO.File.Exists(fullPath))
            return NotFound(ApiResponse<string>.Fail("Archivo no encontrado en disco"));

        Stream odtStream;

        // If it's an ODT and we have variable params, substitute first
        if (etiqueta.Formato == FormatoEtiqueta.Odt && (productoId.HasValue || loteId.HasValue))
        {
            var producto = productoId.HasValue ? await _uow.Productos.GetByIdAsync(productoId.Value, ct) : null;
            var lote = loteId.HasValue ? await _uow.Lotes.GetByIdAsync(loteId.Value, ct) : null;
            var empresa = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
            var variables = _odtSvc.BuildVariables(producto, lote, empresa);

            await using var inputStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
            odtStream = await _odtSvc.RellenarVariablesAsync(inputStream, variables, ct);
        }
        else
        {
            odtStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
        }

        await using (odtStream)
        {
            if (etiqueta.Formato == FormatoEtiqueta.Odt)
            {
                var pdfBytes = await _docSvc.ConvertOdtToPdfAsync(odtStream, ct);
                if (pdfBytes == null)
                    return StatusCode(503, ApiResponse<string>.Fail(
                        "LibreOffice no está instalado. Instale LibreOffice para la conversión ODT→PDF."));
                Response.Headers["Content-Disposition"] = $"inline; filename=\"{etiqueta.Nombre}.pdf\"";
                return File(pdfBytes, "application/pdf");
            }

            // For PDF files, just serve inline directly
            if (etiqueta.Formato == FormatoEtiqueta.Pdf)
            {
                var bytes = await System.IO.File.ReadAllBytesAsync(fullPath, ct);
                Response.Headers["Content-Disposition"] = $"inline; filename=\"{etiqueta.Nombre}.pdf\"";
                return File(bytes, "application/pdf");
            }

            return BadRequest(ApiResponse<string>.Fail($"Formato {etiqueta.Formato} no soporta preview PDF"));
        }
    }

    // ═══════════════════════════════════════════════════════
    // CAPACIDADES
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Devuelve qué capacidades de conversión están disponibles en el servidor.
    /// GET /api/etiquetas/capacidades
    /// </summary>
    [HttpGet("capacidades")]
    [AllowAnonymous]
    public IActionResult GetCapacidades()
    {
        return Ok(ApiResponse<object>.Ok(new
        {
            HtmlToPdf = true,   // PuppeteerSharp siempre disponible
            OdtToPdf = _docSvc.IsLibreOfficeAvailable(),
            BarcodeGeneration = true,
        }));
    }

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    private static string WrapHtmlForPdf(string bodyHtml, decimal widthMm, decimal heightMm) =>
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>" +
        $"@page {{ size: {widthMm}mm {heightMm}mm; margin: 0; }} " +
        $"* {{ margin: 0; padding: 0; box-sizing: border-box; }} " +
        $"body {{ width: {widthMm}mm; min-height: {heightMm}mm; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; }} " +
        "table { border-collapse: collapse; } " +
        "img { max-width: 100%; height: auto; }" +
        $"</style></head><body>{bodyHtml}</body></html>";
}

// ═══════════════════════════════════════════════════════
// DTOs de petición
// ═══════════════════════════════════════════════════════

public record PlantillaRequest(
    string Nombre,
    string? Descripcion,
    decimal AnchoMm,
    decimal AltoMm,
    string? TipoImpresora,
    string? ContenidoJson,
    string? ContenidoHtml
);

public record TipoIvaReRequest(
    decimal IvaPorcentaje,
    decimal RecargoEquivalenciaPorcentaje,
    string? Descripcion
);

public record ImprimirRequest(
    int PlantillaEtiquetaId,
    int? ProductoId,
    int? LoteId,
    int Copias
);

public record GenerarImportadaRequest(
    int? ProductoId,
    int? LoteId
);
