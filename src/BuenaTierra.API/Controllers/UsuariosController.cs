using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Entities;
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
        var result = await (
            from u in _uow.Usuarios.GetQueryable()
            join e in _uow.Empresas.GetQueryable() on u.EmpresaId equals e.Id
            orderby e.Nombre, u.Nombre
            select new
            {
                u.Id,
                u.EmpresaId,
                EmpresaNombre = e.Nombre,
                u.Nombre,
                u.Apellidos,
                u.Email,
                u.Telefono,
                Rol = u.Rol.ToString(),
                u.Activo,
                u.UltimoAcceso,
                NombreCompleto = u.NombreCompleto,
                u.ClienteId,
            }
        ).ToListAsync(ct);

        return Ok(ApiResponse<IEnumerable<object>>.Ok(result));
    }

    // ── GET /api/usuarios/{id} ────────────────────────────────────────────────

    [HttpGet("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<object>>> GetById(int id, CancellationToken ct)
    {
        var u = await _uow.Usuarios.GetByIdAsync(id, ct);
        if (u is null)
            return NotFound(ApiResponse<object>.Fail("Usuario no encontrado"));

        var empresaNombre = await _uow.Empresas.GetQueryable()
            .Where(x => x.Id == u.EmpresaId)
            .Select(x => x.Nombre)
            .FirstOrDefaultAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            u.Id, u.EmpresaId, EmpresaNombre = empresaNombre, u.Nombre, u.Apellidos, u.Email, u.Telefono,
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
        var empresaObjetivoId = req.EmpresaId ?? EmpresaId;

        var empresaObjetivo = await _uow.Empresas.GetByIdAsync(empresaObjetivoId, ct);
        if (empresaObjetivo is null || !empresaObjetivo.Activa)
            return BadRequest(ApiResponse<object>.Fail("La empresa seleccionada no existe o está inactiva"));

        // Check email unique within empresa
        var existe = await _uow.Usuarios.ExistsAsync(
            u => u.EmpresaId == empresaObjetivoId && u.Email == req.Email.Trim().ToLower(), ct);
        if (existe)
            return Conflict(ApiResponse<object>.Fail("Ya existe un usuario con ese email"));

        if (!Enum.TryParse<RolUsuario>(req.Rol, out var rol))
            return BadRequest(ApiResponse<object>.Fail("Rol no válido. Use: Admin, Obrador, Repartidor"));

        if (rol == RolUsuario.Repartidor && req.ClienteId.HasValue)
        {
            var clienteValido = await _uow.Clientes.ExistsAsync(
                c => c.Id == req.ClienteId.Value && c.EmpresaId == empresaObjetivoId && c.Activo, ct);
            if (!clienteValido)
                return BadRequest(ApiResponse<object>.Fail("Cliente vinculado no válido para la empresa seleccionada"));
        }

        var nuevo = new Usuario
        {
            EmpresaId  = empresaObjetivoId,
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
            creado.Id, creado.EmpresaId, EmpresaNombre = empresaObjetivo.Nombre, creado.Nombre, creado.Apellidos, creado.Email,
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
        if (u is null)
            return NotFound(ApiResponse<object>.Fail("Usuario no encontrado"));

        if (!Enum.TryParse<RolUsuario>(req.Rol, out var rol))
            return BadRequest(ApiResponse<object>.Fail("Rol no válido"));

        var empresaObjetivoId = req.EmpresaId ?? u.EmpresaId;
        var empresaObjetivo = await _uow.Empresas.GetByIdAsync(empresaObjetivoId, ct);
        if (empresaObjetivo is null || !empresaObjetivo.Activa)
            return BadRequest(ApiResponse<object>.Fail("La empresa seleccionada no existe o está inactiva"));

        // Prevent demoting the last admin
        var dejaDeSerAdminActivo =
            u.Rol == RolUsuario.Admin && (rol != RolUsuario.Admin || !req.Activo || empresaObjetivoId != u.EmpresaId);

        if (dejaDeSerAdminActivo)
        {
            var admins = await _uow.Usuarios.CountAsync(
                x => x.EmpresaId == u.EmpresaId && x.Rol == RolUsuario.Admin && x.Activo, ct);
            if (admins <= 1)
                return BadRequest(ApiResponse<object>.Fail("No puedes cambiar el rol del único administrador activo"));
        }

        // Email uniqueness check (if changed)
        var emailNuevo = req.Email.Trim().ToLower();
        var cambiaEmail = !string.Equals(u.Email, emailNuevo, StringComparison.OrdinalIgnoreCase);
        var cambiaEmpresa = empresaObjetivoId != u.EmpresaId;
        if (cambiaEmail || cambiaEmpresa)
        {
            var existe = await _uow.Usuarios.ExistsAsync(
                x => x.EmpresaId == empresaObjetivoId && x.Email == emailNuevo && x.Id != id, ct);
            if (existe)
                return Conflict(ApiResponse<object>.Fail("Ya existe un usuario con ese email"));
        }

        if (rol == RolUsuario.Repartidor && req.ClienteId.HasValue)
        {
            var clienteValido = await _uow.Clientes.ExistsAsync(
                c => c.Id == req.ClienteId.Value && c.EmpresaId == empresaObjetivoId && c.Activo, ct);
            if (!clienteValido)
                return BadRequest(ApiResponse<object>.Fail("Cliente vinculado no válido para la empresa seleccionada"));
        }

        u.EmpresaId = empresaObjetivoId;
        u.Nombre   = req.Nombre.Trim();
        u.Apellidos = req.Apellidos?.Trim();
        u.Email    = emailNuevo;
        u.Telefono = req.Telefono?.Trim();
        u.Rol      = rol;
        u.Activo   = req.Activo;
        u.ClienteId = rol == RolUsuario.Repartidor ? req.ClienteId : null;

        await _uow.Usuarios.UpdateAsync(u, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            u.Id, u.EmpresaId, EmpresaNombre = empresaObjetivo.Nombre, u.Nombre, u.Apellidos, u.Email,
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
        if (u is null)
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
        if (u is null)
            return NotFound(ApiResponse<string>.Fail("Usuario no encontrado"));

        if (u.Id == UsuarioActualId)
            return BadRequest(ApiResponse<string>.Fail("No puedes eliminar tu propio usuario"));

        // Check last admin
        if (u.Rol == RolUsuario.Admin)
        {
            var admins = await _uow.Usuarios.CountAsync(
                x => x.EmpresaId == u.EmpresaId && x.Rol == RolUsuario.Admin && x.Activo, ct);
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

    // ── GET /api/usuarios/admin/empresas/{empresaId}/clientes ────────────────

    [HttpGet("admin/empresas/{empresaId:int}/clientes")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetClientesPorEmpresa(int empresaId, CancellationToken ct)
    {
        var empresa = await _uow.Empresas.GetByIdAsync(empresaId, ct);
        if (empresa is null)
            return NotFound(ApiResponse<IEnumerable<object>>.Fail("Empresa no encontrada"));

        var clientes = await _uow.Clientes.GetQueryable()
            .Where(c => c.EmpresaId == empresaId && c.Activo)
            .OrderBy(c => c.Nombre)
            .Select(c => new
            {
                c.Id,
                c.Nombre,
                Tipo = c.Tipo.ToString(),
            })
            .ToListAsync(ct);

        return Ok(ApiResponse<IEnumerable<object>>.Ok(clientes));
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
    int? ClienteId,
    int? EmpresaId
);

public record UpdateUsuarioRequest(
    string Nombre,
    string? Apellidos,
    string Email,
    string? Telefono,
    string Rol,
    bool Activo,
    int? ClienteId,
    int? EmpresaId
);

public record UpdateMeRequest(string Nombre, string? Apellidos, string? Telefono, string? Email);
public record CambiarPasswordMeRequest(string PasswordActual, string NuevaPassword);
public record CambiarPasswordRequest(string NuevaPassword);
