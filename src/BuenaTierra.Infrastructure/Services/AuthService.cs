using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace BuenaTierra.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly IUnitOfWork _uow;
    private readonly IConfiguration _config;
    private readonly ILogger<AuthService> _logger;

    public AuthService(IUnitOfWork uow, IConfiguration config, ILogger<AuthService> logger)
    {
        _uow = uow;
        _config = config;
        _logger = logger;
    }

    public async Task<AuthResult> LoginAsync(string email, string password, int empresaId, CancellationToken ct = default)
    {
        var usuario = (await _uow.Usuarios.FindAsync(
            u => u.Email == email.ToLower() && u.EmpresaId == empresaId && u.Activo, ct))
            .FirstOrDefault();

        if (usuario == null || !BCrypt.Net.BCrypt.Verify(password, usuario.PasswordHash))
        {
            _logger.LogWarning("Intento de login fallido: email={Email}, empresa={EmpresaId}", email, empresaId);
            return new AuthResult(false, null, null, null, "Credenciales inválidas");
        }

        var token = GenerarJwt(usuario);
        var refreshToken = GenerarRefreshToken();
        var refreshExp = DateTime.UtcNow.AddDays(int.Parse(_config["Jwt:RefreshExpiresInDays"] ?? "30"));

        usuario.RefreshToken = refreshToken;
        usuario.RefreshTokenExp = refreshExp;
        usuario.UltimoAcceso = DateTime.UtcNow;

        await _uow.Usuarios.UpdateAsync(usuario, ct);
        await _uow.SaveChangesAsync(ct);

        _logger.LogInformation("Login exitoso: usuario={UsuarioId}, empresa={EmpresaId}", usuario.Id, empresaId);

        int expiresMinutes = int.Parse(_config["Jwt:ExpiresInMinutes"] ?? "480");
        return new AuthResult(true, token, refreshToken, DateTime.UtcNow.AddMinutes(expiresMinutes));
    }

    public async Task<AuthResult> RefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        var usuario = (await _uow.Usuarios.FindAsync(
            u => u.RefreshToken == refreshToken && u.RefreshTokenExp > DateTime.UtcNow && u.Activo, ct))
            .FirstOrDefault();

        if (usuario == null)
            return new AuthResult(false, null, null, null, "Refresh token inválido o expirado");

        var token = GenerarJwt(usuario);
        var newRefreshToken = GenerarRefreshToken();
        var refreshExp = DateTime.UtcNow.AddDays(int.Parse(_config["Jwt:RefreshExpiresInDays"] ?? "30"));

        usuario.RefreshToken = newRefreshToken;
        usuario.RefreshTokenExp = refreshExp;

        await _uow.Usuarios.UpdateAsync(usuario, ct);
        await _uow.SaveChangesAsync(ct);

        int expiresMinutes = int.Parse(_config["Jwt:ExpiresInMinutes"] ?? "480");
        return new AuthResult(true, token, newRefreshToken, DateTime.UtcNow.AddMinutes(expiresMinutes));
    }

    public async Task LogoutAsync(int usuarioId, CancellationToken ct = default)
    {
        var usuario = await _uow.Usuarios.GetByIdAsync(usuarioId, ct)
            ?? throw new EntidadNotFoundException("Usuario", usuarioId);

        usuario.RefreshToken = null;
        usuario.RefreshTokenExp = null;

        await _uow.Usuarios.UpdateAsync(usuario, ct);
        await _uow.SaveChangesAsync(ct);
    }

    private string GenerarJwt(Domain.Entities.Usuario usuario)
    {
        var secret = _config["Jwt:Secret"]
            ?? throw new InvalidOperationException("JWT Secret no configurado");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        int expiresMinutes = int.Parse(_config["Jwt:ExpiresInMinutes"] ?? "480");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, usuario.Id.ToString()),
            new Claim(ClaimTypes.Email, usuario.Email),
            new Claim(ClaimTypes.Name, usuario.NombreCompleto),
            new Claim("empresa_id", usuario.EmpresaId.ToString()),
            new Claim(ClaimTypes.Role, usuario.Rol.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerarRefreshToken()
    {
        var bytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes);
    }
}
