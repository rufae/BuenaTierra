using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsuariosController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    public UsuariosController(IUnitOfWork uow) => _uow = uow;

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioActualId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool EsAdmin => User.IsInRole("Admin");

    // ── GET /api/usuarios ─────────────────────────────────────────────────────

    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetAll(CancellationToken ct)
    {
        var usuarios = await _uow.Usuarios.FindAsync(u => u.EmpresaId == EmpresaId, ct);
        var result = usuarios.Select(u => new
        {
            u.Id,
            u.Nombre,
            u.Apellidos,
            u.Email,
            u.Telefono,
            Rol = u.Rol.ToString(),
            u.Activo,
            u.UltimoAcceso,
            NombreCompleto = u.NombreCompleto,
            u.ClienteId,
        });
        return Ok(ApiResponse<IEnumerable<object>>.Ok(result));
    }

    // ── GET /api/usuarios/{id} ────────────────────────────────────────────────

    [HttpGet("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<object>>> GetById(int id, CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(id, ct);
        if (u is null || u.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<object>.Fail("Usuario no encontrado"));

        return Ok(ApiResponse<object>.Ok(new
        {
            u.Id, u.Nombre, u.Apellidos, u.Email, u.Telefono,
            Rol = u.Rol.ToString(), u.Activo, u.UltimoAcceso, NombreCompleto = u.NombreCompleto,
            u.ClienteId,
        }));
    }

    // ── POST /api/usuarios ────────────────────────────────────────────────────

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<object>>> Create(
        [FromBody] CreateUsuarioRequest req, CancellationToken ct)
    {
        // Check email unique within empresa
        var existe = await _uow.Usuarios.ExistsAsync(
            u => u.EmpresaId == EmpresaId && u.Email == req.Email.Trim().ToLower(), ct);
        if (existe)
            return Conflict(ApiResponse<object>.Fail("Ya existe un usuario con ese email"));

        if (!Enum.TryParse<RolUsuario>(req.Rol, out var rol))
            return BadRequest(ApiResponse<object>.Fail("Rol no válido. Use: Admin, Obrador, Repartidor"));

        var nuevo = new Usuario
        {
            EmpresaId  = EmpresaId,
            Nombre     = req.Nombre.Trim(),
            Apellidos  = req.Apellidos?.Trim(),
            Email      = req.Email.Trim().ToLower(),
            Telefono   = req.Telefono?.Trim(),
            Rol        = rol,
            Activo     = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            ClienteId  = rol == RolUsuario.Repartidor ? req.ClienteId : null,
        };

        var creado = await _uow.Usuarios.AddAsync(nuevo, ct);
        await _uow.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { id = creado.Id }, ApiResponse<object>.Ok(new
        {
            creado.Id, creado.Nombre, creado.Apellidos, creado.Email,
            Rol = creado.Rol.ToString(), creado.Activo, creado.ClienteId,
        }));
    }

    // ── PUT /api/usuarios/{id} ────────────────────────────────────────────────

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<object>>> Update(
        int id, [FromBody] UpdateUsuarioRequest req, CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(id, ct);
        if (u is null || u.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<object>.Fail("Usuario no encontrado"));

        // Prevent demoting the last admin
        if (u.Rol == RolUsuario.Admin && req.Rol != "Admin")
        {
            var admins = await _uow.Usuarios.CountAsync(
                x => x.EmpresaId == EmpresaId && x.Rol == RolUsuario.Admin && x.Activo, ct);
            if (admins <= 1)
                return BadRequest(ApiResponse<object>.Fail("No puedes cambiar el rol del único administrador activo"));
        }

        // Email uniqueness check (if changed)
        if (!string.Equals(u.Email, req.Email.Trim().ToLower(), StringComparison.OrdinalIgnoreCase))
        {
            var existe = await _uow.Usuarios.ExistsAsync(
                x => x.EmpresaId == EmpresaId && x.Email == req.Email.Trim().ToLower() && x.Id != id, ct);
            if (existe)
                return Conflict(ApiResponse<object>.Fail("Ya existe un usuario con ese email"));
        }

        if (!Enum.TryParse<RolUsuario>(req.Rol, out var rol))
            return BadRequest(ApiResponse<object>.Fail("Rol no válido"));

        u.Nombre   = req.Nombre.Trim();
        u.Apellidos = req.Apellidos?.Trim();
        u.Email    = req.Email.Trim().ToLower();
        u.Telefono = req.Telefono?.Trim();
        u.Rol      = rol;
        u.Activo   = req.Activo;
        u.ClienteId = rol == RolUsuario.Repartidor ? req.ClienteId : null;

        await _uow.Usuarios.UpdateAsync(u, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            u.Id, u.Nombre, u.Apellidos, u.Email,
            Rol = u.Rol.ToString(), u.Activo, u.ClienteId,
        }));
    }

    // ── PUT /api/usuarios/{id}/cambiar-password ───────────────────────────────

    [HttpPut("{id:int}/cambiar-password")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<string>>> CambiarPassword(
        int id, [FromBody] CambiarPasswordRequest req, CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(id, ct);
        if (u is null || u.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Usuario no encontrado"));

        if (string.IsNullOrWhiteSpace(req.NuevaPassword) || req.NuevaPassword.Length < 8)
            return BadRequest(ApiResponse<string>.Fail("La contraseña debe tener al menos 8 caracteres"));

        u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NuevaPassword);
        await _uow.Usuarios.UpdateAsync(u, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("Contraseña actualizada"));
    }

    // ── DELETE /api/usuarios/{id} ─────────────────────────────────────────────

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<string>>> Delete(int id, CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(id, ct);
        if (u is null || u.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Usuario no encontrado"));

        if (u.Id == UsuarioActualId)
            return BadRequest(ApiResponse<string>.Fail("No puedes eliminar tu propio usuario"));

        // Check last admin
        if (u.Rol == RolUsuario.Admin)
        {
            var admins = await _uow.Usuarios.CountAsync(
                x => x.EmpresaId == EmpresaId && x.Rol == RolUsuario.Admin && x.Activo, ct);
            if (admins <= 1)
                return BadRequest(ApiResponse<string>.Fail("No puedes eliminar el único administrador activo"));
        }

        // Soft delete
        u.Activo = false;
        await _uow.Usuarios.UpdateAsync(u, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("Usuario desactivado"));
    }

    // ── Me — cualquier usuario autenticado ────────────────────────────────────

    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<object>>> Me(CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(UsuarioActualId, ct);
        if (u is null) return NotFound(ApiResponse<object>.Fail("Usuario no encontrado"));

        return Ok(ApiResponse<object>.Ok(new
        {
            u.Id, u.Nombre, u.Apellidos, u.Email, u.Telefono,
            Rol = u.Rol.ToString(), u.Activo, u.UltimoAcceso,
            NombreCompleto = u.NombreCompleto,
        }));
    }
    /// <summary>PUT /api/usuarios/me — El usuario actualiza sus propios datos (nombre, apellidos, teléfono)</summary>
    [HttpPut("me")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateMe(
        [FromBody] UpdateMeRequest req, CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(UsuarioActualId, ct);
        if (u is null) return NotFound(ApiResponse<object>.Fail("Usuario no encontrado"));

        // Validar email si se cambia
        if (!string.IsNullOrWhiteSpace(req.Email) &&
            !req.Email.Equals(u.Email, StringComparison.OrdinalIgnoreCase))
        {
            var existe = await _uow.Usuarios.FindAsync(
                x => x.Email == req.Email.Trim().ToLower() && x.Id != UsuarioActualId, ct);
            if (existe.Any())
                return BadRequest(ApiResponse<object>.Fail("Ya existe un usuario con ese email"));
            u.Email = req.Email.Trim().ToLower();
        }

        u.Nombre    = req.Nombre.Trim();
        u.Apellidos = req.Apellidos?.Trim();
        u.Telefono  = req.Telefono?.Trim();

        await _uow.Usuarios.UpdateAsync(u, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            u.Id, u.Nombre, u.Apellidos, u.Email, u.Telefono,
            Rol = u.Rol.ToString(), NombreCompleto = u.NombreCompleto,
        }, "Perfil actualizado correctamente"));
    }

    /// <summary>
    /// PUT /api/usuarios/me/cambiar-password — El usuario cambia su propia contraseña
    /// (requiere contraseña actual; no requiere rol Admin).
    /// </summary>
    [HttpPut("me/cambiar-password")]
    public async Task<ActionResult<ApiResponse<string>>> CambiarPasswordMe(
        [FromBody] CambiarPasswordMeRequest req, CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(UsuarioActualId, ct);
        if (u is null) return NotFound(ApiResponse<string>.Fail("Usuario no encontrado"));

        if (!BCrypt.Net.BCrypt.Verify(req.PasswordActual, u.PasswordHash))
            return BadRequest(ApiResponse<string>.Fail("La contraseña actual no es correcta"));

        if (string.IsNullOrWhiteSpace(req.NuevaPassword) || req.NuevaPassword.Length < 8)
            return BadRequest(ApiResponse<string>.Fail("La nueva contraseña debe tener al menos 8 caracteres"));

        u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NuevaPassword);
        await _uow.Usuarios.UpdateAsync(u, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("Contraseña actualizada correctamente"));
    }

    /// <summary>GET /api/usuarios/me/configuracion — Devuelve la configuración personal del usuario (SMTP, IMAP)</summary>
    [HttpGet("me/configuracion")]
    public async Task<ActionResult<ApiResponse<object>>> GetConfiguracionMe(CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(UsuarioActualId, ct);
        if (u is null) return NotFound(ApiResponse<object>.Fail("Usuario no encontrado"));

        var cfg = new System.Collections.Generic.Dictionary<string, object?>();
        if (!string.IsNullOrWhiteSpace(u.Configuracion))
        {
            try
            {
                var parsed = System.Text.Json.JsonSerializer.Deserialize<System.Collections.Generic.Dictionary<string, System.Text.Json.JsonElement>>(u.Configuracion);
                if (parsed != null)
                    foreach (var kv in parsed)
                        cfg[kv.Key] = kv.Value;
            }
            catch { /* return empty config */ }
        }
        return Ok(ApiResponse<object>.Ok(cfg));
    }

    /// <summary>PUT /api/usuarios/me/configuracion — Guarda la configuración personal del usuario (SMTP, IMAP)</summary>
    [HttpPut("me/configuracion")]
    public async Task<ActionResult<ApiResponse<string>>> PutConfiguracionMe(
        [FromBody] System.Text.Json.JsonElement body, CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(UsuarioActualId, ct);
        if (u is null) return NotFound(ApiResponse<string>.Fail("Usuario no encontrado"));

        u.Configuracion = body.GetRawText();
        await _uow.Usuarios.UpdateAsync(u, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("Configuración guardada"));
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public record CreateUsuarioRequest(
    string Nombre,
    string? Apellidos,
    string Email,
    string? Telefono,
    string Rol,
    string Password,
    int? ClienteId
);

public record UpdateUsuarioRequest(
    string Nombre,
    string? Apellidos,
    string Email,
    string? Telefono,
    string Rol,
    bool Activo,
    int? ClienteId
);

public record UpdateMeRequest(string Nombre, string? Apellidos, string? Telefono, string? Email);
public record CambiarPasswordMeRequest(string PasswordActual, string NuevaPassword);
public record CambiarPasswordRequest(string NuevaPassword);
