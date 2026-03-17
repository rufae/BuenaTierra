using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class Usuario : BaseEntity
{
    public int EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? Apellidos { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? Telefono { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public RolUsuario Rol { get; set; } = RolUsuario.Obrador;
    public bool Activo { get; set; } = true;
    public DateTime? UltimoAcceso { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExp { get; set; }
    public int? ClienteId { get; set; }             // Vincula Repartidor → Cliente

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Cliente? ClienteVinculado { get; set; }

    public string NombreCompleto => $"{Nombre} {Apellidos}".Trim();
}
