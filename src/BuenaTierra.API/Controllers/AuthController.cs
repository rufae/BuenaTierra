using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly AppDbContext _ctx;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IAuthService authService, AppDbContext ctx, ILogger<AuthController> logger)
    {
        _authService = authService;
        _ctx = ctx;
        _logger = logger;
    }

    /// <summary>POST /api/auth/login — Obtener JWT + RefreshToken</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<LoginResponse>>> Login(
        [FromBody] LoginRequest request, CancellationToken ct)
    {
        var result = await _authService.LoginAsync(request.Email, request.Password, ct);
        if (!result.Success)
            return Unauthorized(ApiResponse<LoginResponse>.Fail(result.Error ?? "Credenciales inválidas"));

        return Ok(ApiResponse<LoginResponse>.Ok(new LoginResponse(result.Token!, result.RefreshToken!, result.Expira!.Value, result.DebeCambiarPassword)));
    }

    /// <summary>POST /api/auth/refresh — Renovar token con refresh token</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<LoginResponse>>> Refresh(
        [FromBody] RefreshRequest request, CancellationToken ct)
    {
        var result = await _authService.RefreshTokenAsync(request.RefreshToken, ct);
        if (!result.Success)
            return Unauthorized(ApiResponse<LoginResponse>.Fail(result.Error ?? "Refresh token inválido"));

        return Ok(ApiResponse<LoginResponse>.Ok(new LoginResponse(result.Token!, result.RefreshToken!, result.Expira!.Value, result.DebeCambiarPassword)));
    }

    /// <summary>POST /api/auth/logout — Invalidar refresh token</summary>
    [HttpPost("logout")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<string>>> Logout(CancellationToken ct)
    {
        var usuarioId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _authService.LogoutAsync(usuarioId, ct);
        return Ok(ApiResponse<string>.Ok("OK"));
    }

    /// <summary>
    /// POST /api/auth/solicitar-reset — Envía un código de recuperación por correo.
    /// No revela si el email existe (evita enumeración de usuarios).
    /// </summary>
    [HttpPost("solicitar-reset")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<string>>> SolicitarReset(
        [FromBody] SolicitarResetRequest request, CancellationToken ct)
    {
        var email = request.Email?.Trim().ToLower();
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(ApiResponse<string>.Fail("Indica un correo electrónico"));

        var usuario = await _ctx.Usuarios.FirstOrDefaultAsync(u => u.Email == email && u.Activo, ct);

        if (usuario != null)
        {
            var codigo = GenerarCodigoReset();
            usuario.ResetPasswordCode = HashResetCode(codigo);
            usuario.ResetPasswordCodeExp = DateTime.UtcNow.AddMinutes(15);
            await _ctx.SaveChangesAsync(ct);

            var enviado = await EnviarCorreoResetAsync(usuario, codigo, ct);
            if (!enviado)
                _logger.LogWarning("Recuperación de contraseña: no se pudo enviar el correo (SMTP no configurado o fallo) para {Email}", email);
        }

        // Respuesta genérica: no revela si el email existe
        return Ok(ApiResponse<string>.Ok(
            "Si el correo existe y está activo, recibirás un código para restablecer tu contraseña."));
    }

    /// <summary>POST /api/auth/reset-password — Restablece la contraseña con el código recibido</summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<string>>> ResetPassword(
        [FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        var email = request.Email?.Trim().ToLower();
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(ApiResponse<string>.Fail("Indica un correo electrónico"));

        var usuario = await _ctx.Usuarios.FirstOrDefaultAsync(u => u.Email == email && u.Activo, ct);

        if (usuario == null
            || string.IsNullOrWhiteSpace(usuario.ResetPasswordCode)
            || usuario.ResetPasswordCodeExp == null
            || usuario.ResetPasswordCodeExp < DateTime.UtcNow
            || !string.Equals(usuario.ResetPasswordCode, HashResetCode(request.Codigo ?? ""), StringComparison.Ordinal))
            return BadRequest(ApiResponse<string>.Fail("Código inválido o expirado"));

        var errorPassword = PasswordPolicy.Validate(request.NuevaPassword);
        if (errorPassword != null)
            return BadRequest(ApiResponse<string>.Fail(errorPassword));

        usuario.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NuevaPassword);
        usuario.ResetPasswordCode = null;
        usuario.ResetPasswordCodeExp = null;
        usuario.DebeCambiarPassword = false;
        usuario.RefreshToken = null;
        usuario.RefreshTokenExp = null;

        await _ctx.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("Contraseña restablecida correctamente"));
    }

    /// <summary>POST /api/auth/establecer-password — Cambio de contraseña forzado en primer login</summary>
    [HttpPost("establecer-password")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<string>>> EstablecerPassword(
        [FromBody] EstablecerPasswordRequest request, CancellationToken ct)
    {
        var usuarioId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _authService.EstablecerPasswordAsync(usuarioId, request.NuevaPassword, ct);
        return Ok(ApiResponse<string>.Ok("Contraseña establecida correctamente"));
    }

    /// <summary>GET /api/auth/me — Info del usuario actual</summary>
    [HttpGet("me")]
    [Authorize]
    public ActionResult<object> Me()
    {
        return Ok(new
        {
            Id = User.FindFirstValue(ClaimTypes.NameIdentifier),
            Email = User.FindFirstValue(ClaimTypes.Email),
            Nombre = User.FindFirstValue(ClaimTypes.Name),
            EmpresaId = User.FindFirstValue("empresa_id"),
            Rol = User.FindFirstValue(ClaimTypes.Role)
        });
    }

    private async Task<bool> EnviarCorreoResetAsync(Usuario usuario, string codigo, CancellationToken ct)
    {
        var empresa = await _ctx.Empresas.FirstOrDefaultAsync(e => e.Id == usuario.EmpresaId, ct);
        if (empresa == null || string.IsNullOrWhiteSpace(empresa.Configuracion))
            return false;

        var subject = "Recuperación de contraseña — BuenaTierra";
        var html = $"""
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
              <h2 style="color:#2563eb;margin:0 0 16px">Recupera tu contraseña</h2>
              <p>Hola {System.Net.WebUtility.HtmlEncode(usuario.NombreCompleto)},</p>
              <p>Hemos recibido una solicitud para restablecer tu contraseña. Usa el siguiente código:</p>
              <p style="text-align:center;margin:24px 0">
                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1d4ed8;background:#eff6ff;padding:12px 24px;border-radius:8px">{codigo}</span>
              </p>
              <p>El código es válido durante <strong>15 minutos</strong>. Si no has solicitado este cambio, ignora este correo.</p>
              <p style="color:#6b7280;font-size:12px;margin-top:24px">Este es un mensaje automático, por favor no respondas.</p>
            </div>
            """;

        return await BuenaTierra.API.Services.SmtpMailer.SendAsync(empresa.Configuracion, usuario.Email, subject, html, ct);
    }

    private static string GenerarCodigoReset()
        => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    private static string HashResetCode(string codigo)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(codigo ?? "")));
}

public record LoginRequest(string Email, string Password);
public record RefreshRequest(string RefreshToken);
public record EstablecerPasswordRequest(string NuevaPassword);
public record SolicitarResetRequest(string Email);
public record ResetPasswordRequest(string Email, string Codigo, string NuevaPassword);
public record LoginResponse(string Token, string RefreshToken, DateTime Expira, bool DebeCambiarPassword = false);
