using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;

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
    // GET /api/empresa/lista — Listado público para selector de login (sin auth)
    // ═══════════════════════════════════════════════════════

    [HttpGet("lista")]
    [AllowAnonymous]
    public async Task<IActionResult> ListarParaLogin(CancellationToken ct)
    {
        var empresas = await _uow.Empresas.FindAsync(e => e.Activa, ct);
        var resultado = empresas
            .OrderBy(e => e.Nombre)
            .Select(e => new { e.Id, e.Nombre })
            .ToList();
        return Ok(ApiResponse<object>.Ok(resultado));
    }

    // ═══════════════════════════════════════════════════════
    // GET /api/empresa/admin/lista — Listado completo para administración global
    // ═══════════════════════════════════════════════════════

    [HttpGet("admin/lista")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ListarAdmin(CancellationToken ct)
    {
        var empresas = await _uow.Empresas.GetQueryable()
            .OrderBy(e => e.Nombre)
            .Select(e => new
            {
                e.Id,
                e.Nombre,
                e.Nif,
                e.RazonSocial,
                e.Telefono,
                e.Email,
                e.Activa,
                e.EsObrador,
            })
            .ToListAsync(ct);

        return Ok(ApiResponse<object>.Ok(empresas));
    }

    // ═══════════════════════════════════════════════════════
    // POST /api/empresa/admin — Crear empresa
    // ═══════════════════════════════════════════════════════

    [HttpPost("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CrearAdmin([FromBody] CreateEmpresaRequest req, CancellationToken ct)
    {
        var nombre = (req.Nombre ?? string.Empty).Trim();
        var nif = (req.Nif ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(nombre) || string.IsNullOrWhiteSpace(nif))
            return BadRequest(ApiResponse<string>.Fail("Nombre y NIF son obligatorios"));

        var existeNif = await _uow.Empresas.ExistsAsync(e => e.Nif == nif, ct);
        if (existeNif)
            return Conflict(ApiResponse<string>.Fail("Ya existe una empresa con ese NIF"));

        var nueva = new BuenaTierra.Domain.Entities.Empresa
        {
            Nombre = nombre,
            Nif = nif,
            RazonSocial = req.RazonSocial?.Trim(),
            Direccion = req.Direccion?.Trim(),
            CodigoPostal = req.CodigoPostal?.Trim(),
            Ciudad = req.Ciudad?.Trim(),
            Provincia = req.Provincia?.Trim(),
            Pais = string.IsNullOrWhiteSpace(req.Pais) ? "España" : req.Pais.Trim(),
            Telefono = req.Telefono?.Trim(),
            Email = req.Email?.Trim(),
            Web = req.Web?.Trim(),
            NumeroRgseaa = req.NumeroRgseaa?.Trim(),
            Activa = req.Activa,
            EsObrador = req.EsObrador,
            EmpresaPadreId = req.EmpresaPadreId,
            Configuracion = "{}",
        };

        var creada = await _uow.Empresas.AddAsync(nueva, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            creada.Id,
            creada.Nombre,
            creada.Nif,
            creada.Activa,
            creada.EsObrador,
        }, "Empresa creada"));
    }

    // ═══════════════════════════════════════════════════════
    // PUT /api/empresa/admin/{id} — Editar cualquier empresa
    // ═══════════════════════════════════════════════════════

    [HttpPut("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateAdmin(int id, [FromBody] UpdateEmpresaAdminRequest req, CancellationToken ct)
    {
        var e = await _uow.Empresas.GetByIdAsync(id, ct);
        if (e is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        var nombre = (req.Nombre ?? e.Nombre).Trim();
        var nif = (req.Nif ?? e.Nif).Trim();
        if (string.IsNullOrWhiteSpace(nombre) || string.IsNullOrWhiteSpace(nif))
            return BadRequest(ApiResponse<string>.Fail("Nombre y NIF son obligatorios"));

        var existeNif = await _uow.Empresas.ExistsAsync(x => x.Nif == nif && x.Id != id, ct);
        if (existeNif)
            return Conflict(ApiResponse<string>.Fail("Ya existe otra empresa con ese NIF"));

        e.Nombre = nombre;
        e.Nif = nif;
        e.RazonSocial = req.RazonSocial?.Trim();
        e.Direccion = req.Direccion?.Trim();
        e.CodigoPostal = req.CodigoPostal?.Trim();
        e.Ciudad = req.Ciudad?.Trim();
        e.Provincia = req.Provincia?.Trim();
        e.Pais = string.IsNullOrWhiteSpace(req.Pais) ? e.Pais : req.Pais.Trim();
        e.Telefono = req.Telefono?.Trim();
        e.Email = req.Email?.Trim();
        e.Web = req.Web?.Trim();
        e.NumeroRgseaa = req.NumeroRgseaa?.Trim();
        e.Activa = req.Activa;
        e.EsObrador = req.EsObrador;
        e.EmpresaPadreId = req.EmpresaPadreId;

        await _uow.Empresas.UpdateAsync(e, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            e.Id,
            e.Nombre,
            e.Nif,
            e.Activa,
            e.EsObrador,
        }, "Empresa actualizada"));
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
    // PUT /api/empresa/configuracion/tema — Guardar colores de la empresa (Admin, Obrador)
    // ═══════════════════════════════════════════════════════

    [HttpPut("configuracion/tema")]
    [Authorize(Roles = "Admin,Obrador")]
    public async Task<IActionResult> UpdateConfiguracionTema([FromBody] UpdateConfiguracionTemaRequest req, CancellationToken ct)
    {
        // Validar formato hex #RRGGBB
        var hexRegex = new System.Text.RegularExpressions.Regex(@"^#[0-9a-fA-F]{6}$");
        if (!hexRegex.IsMatch(req.ColorPrimario ?? ""))
            return BadRequest(ApiResponse<string>.Fail("colorPrimario debe ser un color hexadecimal válido (#RRGGBB)"));
        if (!hexRegex.IsMatch(req.ColorSecundario ?? ""))
            return BadRequest(ApiResponse<string>.Fail("colorSecundario debe ser un color hexadecimal válido (#RRGGBB)"));

        var e = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        if (e is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        JsonObject root;
        try
        {
            root = string.IsNullOrWhiteSpace(e.Configuracion)
                ? new JsonObject()
                : JsonNode.Parse(e.Configuracion)?.AsObject() ?? new JsonObject();
        }
        catch
        {
            root = new JsonObject();
        }

        root["colorPrimario"]   = req.ColorPrimario;
        root["colorSecundario"] = req.ColorSecundario;

        e.Configuracion = root.ToJsonString(new JsonSerializerOptions { WriteIndented = false });

        await _uow.Empresas.UpdateAsync(e, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            colorPrimario   = req.ColorPrimario,
            colorSecundario = req.ColorSecundario,
        }, "Colores de empresa actualizados"));
    }

    // ═══════════════════════════════════════════════════════
    // PUT /api/empresa/configuracion/ia — Guardar solo configuración IA (Admin/Obrador)
    // ═══════════════════════════════════════════════════════
    [HttpPut("configuracion/ia")]
    [Authorize(Roles = "Admin,Obrador")]
    public async Task<IActionResult> UpdateConfiguracionIa([FromBody] UpdateConfiguracionIaRequest req, CancellationToken ct)
    {
        var e = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        if (e is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        JsonObject root;
        try
        {
            root = string.IsNullOrWhiteSpace(e.Configuracion)
                ? new JsonObject()
                : JsonNode.Parse(e.Configuracion)?.AsObject() ?? new JsonObject();
        }
        catch
        {
            root = new JsonObject();
        }

        root["buenatierrAI"] = new JsonObject
        {
            ["enabled"] = req.Enabled,
            ["providerBaseUrl"] = req.ProviderBaseUrl?.Trim(),
            ["model"] = req.Model?.Trim(),
            ["apiKey"] = req.ApiKey ?? string.Empty,
        };

        e.Configuracion = root.ToJsonString(new JsonSerializerOptions
        {
            WriteIndented = false
        });

        await _uow.Empresas.UpdateAsync(e, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("Configuración IA actualizada"));
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

    // ═══════════════════════════════════════════════════════
    // GET /api/empresa/{id}/relaciones — Contar relaciones antes de borrar (Admin)
    // ═══════════════════════════════════════════════════════

    [HttpGet("{id:int}/relaciones")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ContarRelaciones(int id, CancellationToken ct)
    {
        var empresa = await _uow.Empresas.GetByIdAsync(id, ct);
        if (empresa is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        var relaciones = new Dictionary<string, int>
        {
            ["clientes"]          = await _uow.Clientes.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
            ["productos"]         = await _uow.Productos.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
            ["pedidos"]           = await _uow.Pedidos.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
            ["facturas"]          = await _uow.Facturas.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
            ["albaranes"]         = await _uow.Albaranes.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
            ["lotes"]             = await _uow.Lotes.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
            ["stock"]             = await _uow.Stock.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
            ["series_facturacion"]= await _uow.SeriesFacturacion.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
            ["usuarios"]          = await _uow.Usuarios.GetQueryable().CountAsync(x => x.EmpresaId == id, ct),
        };

        int total = relaciones.Values.Sum();
        bool puedeEliminar = total == 0;

        return Ok(ApiResponse<object>.Ok(new
        {
            empresaId = id,
            nombre    = empresa.Nombre,
            puedeEliminar,
            totalRelaciones = total,
            detalle = relaciones,
            mensaje = puedeEliminar
                ? "La empresa no tiene datos relacionados y puede eliminarse de forma segura."
                : $"La empresa tiene {total} registros relacionados. No se puede eliminar hasta que se vacíen o reasignen.",
        }));
    }

    // ═══════════════════════════════════════════════════════
    // DELETE /api/empresa/{id} — Borrado seguro con pre-check (Admin)
    // ═══════════════════════════════════════════════════════

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        // No se puede eliminar la empresa propia del usuario autenticado
        if (id == EmpresaId)
            return UnprocessableEntity(ApiResponse<string>.Fail(
                "No puedes eliminar la empresa en la que estás autenticado."));

        var empresa = await _uow.Empresas.GetByIdAsync(id, ct);
        if (empresa is null) return NotFound(ApiResponse<string>.Fail("Empresa no encontrada"));

        // Pre-check de relaciones — bloqueo si hay datos asociados
        var tieneRelaciones =
            await _uow.Clientes.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct) ||
            await _uow.Productos.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct) ||
            await _uow.Pedidos.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct) ||
            await _uow.Facturas.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct) ||
            await _uow.Albaranes.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct) ||
            await _uow.Lotes.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct) ||
            await _uow.Stock.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct) ||
            await _uow.SeriesFacturacion.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct) ||
            await _uow.Usuarios.GetQueryable().AnyAsync(x => x.EmpresaId == id, ct);

        if (tieneRelaciones)
            return UnprocessableEntity(ApiResponse<string>.Fail(
                $"La empresa '{empresa.Nombre}' tiene datos asociados y no puede eliminarse. " +
                "Consulte GET /api/empresa/{id}/relaciones para ver el detalle."));

        // Capturar datos antes del borrado para auditoría
        var datosAntes = System.Text.Json.JsonSerializer.Serialize(new
        {
            empresa.Id, empresa.Nombre, empresa.Nif, empresa.RazonSocial, empresa.Activa
        });

        await _uow.Empresas.DeleteAsync(empresa, ct);
        await _uow.SaveChangesAsync(ct);

        // Registrar en log de auditoría (after commit, best-effort)
        var ipCliente = HttpContext.Connection.RemoteIpAddress?.ToString();
        var usuarioId = int.TryParse(User.FindFirstValue("sub"), out var uid) ? uid : (int?)null;
        await _uow.RegistrarAuditoriaAsync(
            tabla: "empresas",
            operacion: "DELETE",
            registroId: id,
            usuarioId: usuarioId,
            ipCliente: ipCliente,
            datosAntes: datosAntes,
            datosDespues: null,
            ct: ct);

        return Ok(ApiResponse<string>.Ok("OK",
            $"Empresa '{empresa.Nombre}' eliminada correctamente."));
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

public record UpdateConfiguracionTemaRequest(
    string? ColorPrimario,
    string? ColorSecundario
);

public record UpdateConfiguracionIaRequest(
    bool Enabled,
    string? ProviderBaseUrl,
    string? Model,
    string? ApiKey
);

public record CreateEmpresaRequest(
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
    string? NumeroRgseaa,
    bool EsObrador,
    bool Activa,
    int? EmpresaPadreId
);

public record UpdateEmpresaAdminRequest(
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
    string? NumeroRgseaa,
    bool EsObrador,
    bool Activa,
    int? EmpresaPadreId
);
