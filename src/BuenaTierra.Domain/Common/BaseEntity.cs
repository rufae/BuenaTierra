namespace BuenaTierra.Domain.Common;

/// <summary>
/// Entidad base con propiedades comunes de auditoría.
/// </summary>
public abstract class BaseEntity
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Entidad base que incluye empresa_id para soporte multi-tenant.
/// La propiedad de navegación Empresa se declara en cada entidad concreta.
/// </summary>
public abstract class TenantEntity : BaseEntity
{
    public int EmpresaId { get; set; }
}
