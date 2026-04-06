using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService) => _authService = authService;

    /// <summary>POST /api/auth/login — Obtener JWT + RefreshToken</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<LoginResponse>>> Login(
        [FromBody] LoginRequest request, CancellationToken ct)
    {
        var result = await _authService.LoginAsync(request.Email, request.Password, request.EmpresaId, ct);
        if (!result.Success)
            return Unauthorized(ApiResponse<LoginResponse>.Fail(result.Error ?? "Credenciales inválidas"));

        return Ok(ApiResponse<LoginResponse>.Ok(new LoginResponse(result.Token!, result.RefreshToken!, result.Expira!.Value)));
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

        return Ok(ApiResponse<LoginResponse>.Ok(new LoginResponse(result.Token!, result.RefreshToken!, result.Expira!.Value)));
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
}

public record LoginRequest(string Email, string Password, int EmpresaId);
public record RefreshRequest(string RefreshToken);
public record LoginResponse(string Token, string RefreshToken, DateTime Expira);
