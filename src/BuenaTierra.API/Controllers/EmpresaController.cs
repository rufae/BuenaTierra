using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/empresa")]
[Authorize]
public class EmpresaController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly IWebHostEnvironment _env;
    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    public EmpresaController(IUnitOfWork uow, IWebHostEnvironment env)
    {
        _uow = uow;
        _env = env;
    }

    // ═══════════════════════════════════════════════════════
    // GET /api/empresa — Datos de la empresa del usuario actual
    // ═══════════════════════════════════════════════════════

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var e = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        if (e is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        return Ok(ApiResponse<object>.Ok(new
        {
            e.Id,
            e.Nombre,
            e.Nif,
            e.RazonSocial,
            e.Direccion,
            e.CodigoPostal,
            e.Ciudad,
            e.Provincia,
            e.Pais,
            e.Telefono,
            e.Email,
            e.Web,
            e.LogoUrl,
            e.NumeroRgseaa,
            e.EsObrador,
            e.Activa,
            e.Configuracion,
        }));
    }

    // ═══════════════════════════════════════════════════════
    // PUT /api/empresa — Actualizar datos de la empresa (Admin only)
    // ═══════════════════════════════════════════════════════

    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update([FromBody] UpdateEmpresaRequest req, CancellationToken ct)
    {
        var e = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        if (e is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        e.Nombre       = req.Nombre?.Trim() ?? e.Nombre;
        e.Nif          = req.Nif?.Trim() ?? e.Nif;
        e.RazonSocial  = req.RazonSocial?.Trim();
        e.Direccion    = req.Direccion?.Trim();
        e.CodigoPostal = req.CodigoPostal?.Trim();
        e.Ciudad       = req.Ciudad?.Trim();
        e.Provincia    = req.Provincia?.Trim();
        e.Pais         = req.Pais?.Trim() ?? e.Pais;
        e.Telefono     = req.Telefono?.Trim();
        e.Email        = req.Email?.Trim();
        e.Web          = req.Web?.Trim();
        e.NumeroRgseaa = req.NumeroRgseaa?.Trim();

        await _uow.Empresas.UpdateAsync(e, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            e.Id, e.Nombre, e.Nif, e.RazonSocial, e.Direccion,
            e.CodigoPostal, e.Ciudad, e.Provincia, e.Pais,
            e.Telefono, e.Email, e.Web, e.LogoUrl, e.NumeroRgseaa,
        }, "Datos de empresa actualizados"));
    }

    // ═══════════════════════════════════════════════════════
    // PUT /api/empresa/configuracion — Guardar JSON de configuración
    // ═══════════════════════════════════════════════════════

    [HttpPut("configuracion")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateConfiguracion([FromBody] UpdateConfiguracionRequest req, CancellationToken ct)
    {
        var e = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        if (e is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        e.Configuracion = req.Configuracion ?? "{}";

        await _uow.Empresas.UpdateAsync(e, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("Configuración actualizada"));
    }

    // ═══════════════════════════════════════════════════════
    // POST /api/empresa/logo — Upload logo
    // ═══════════════════════════════════════════════════════

    [HttpPost("logo")]
    [Authorize(Roles = "Admin")]
    [RequestSizeLimit(5 * 1024 * 1024)] // 5 MB
    public async Task<IActionResult> UploadLogo(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(ApiResponse<string>.Fail("Archivo vacío"));

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowedExts = new[] { ".png", ".jpg", ".jpeg", ".webp", ".svg" };
        if (!allowedExts.Contains(ext))
            return BadRequest(ApiResponse<string>.Fail("Formato no permitido. Use: png, jpg, jpeg, webp, svg"));

        var e = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        if (e is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        // Guardar archivo
        var uploadsDir = Path.Combine(_env.ContentRootPath, "uploads", "logos");
        Directory.CreateDirectory(uploadsDir);

        var fileName = $"empresa_{EmpresaId}{ext}";
        var filePath = Path.Combine(uploadsDir, fileName);

        // Eliminar logo anterior si existe con diferente extensión
        foreach (var oldFile in Directory.GetFiles(uploadsDir, $"empresa_{EmpresaId}.*"))
        {
            if (oldFile != filePath) System.IO.File.Delete(oldFile);
        }

        await using var stream = new FileStream(filePath, FileMode.Create);
        await file.CopyToAsync(stream, ct);

        e.LogoUrl = $"/api/empresa/logo/{fileName}";
        await _uow.Empresas.UpdateAsync(e, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new { logoUrl = e.LogoUrl }, "Logo actualizado"));
    }

    // ═══════════════════════════════════════════════════════
    // GET /api/empresa/logo/{filename} — Servir logo
    // ═══════════════════════════════════════════════════════

    [HttpGet("logo/{filename}")]
    [AllowAnonymous]
    public IActionResult GetLogo(string filename)
    {
        var uploadsDir = Path.Combine(_env.ContentRootPath, "uploads", "logos");
        var filePath = Path.Combine(uploadsDir, filename);

        if (!System.IO.File.Exists(filePath))
            return NotFound();

        var ext = Path.GetExtension(filename).ToLowerInvariant();
        var contentType = ext switch
        {
            ".png"  => "image/png",
            ".jpg"  => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".svg"  => "image/svg+xml",
            _       => "application/octet-stream",
        };

        return PhysicalFile(filePath, contentType);
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public record UpdateEmpresaRequest(
    string? Nombre,
    string? Nif,
    string? RazonSocial,
    string? Direccion,
    string? CodigoPostal,
    string? Ciudad,
    string? Provincia,
    string? Pais,
    string? Telefono,
    string? Email,
    string? Web,
    string? NumeroRgseaa
);

public record UpdateConfiguracionRequest(string? Configuracion);
