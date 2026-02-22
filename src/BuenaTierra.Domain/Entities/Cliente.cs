using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class Cliente : TenantEntity
{
    public int? RepartidorEmpresaId { get; set; }
    public TipoCliente Tipo { get; set; } = TipoCliente.Particular;
    public string Nombre { get; set; } = string.Empty;
    public string? Apellidos { get; set; }
    public string? RazonSocial { get; set; }
    public string? Nif { get; set; }
    public string? Direccion { get; set; }
    public string? CodigoPostal { get; set; }
    public string? Ciudad { get; set; }
    public string? Provincia { get; set; }
    public string? Telefono { get; set; }
    public string? Telefono2 { get; set; }
    public string? Email { get; set; }
    public string? CondicionesPago { get; set; }
    public int DiasPago { get; set; } = 0;
    public decimal DescuentoGeneral { get; set; } = 0;
    public int? TarifaId { get; set; }
    public string? Notas { get; set; }
    public bool Activo { get; set; } = true;

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Empresa? RepartidorEmpresa { get; set; }
    public virtual ICollection<Factura> Facturas { get; set; } = new List<Factura>();
    public virtual ICollection<Pedido> Pedidos { get; set; } = new List<Pedido>();
    public virtual ICollection<Albaran> Albaranes { get; set; } = new List<Albaran>();

    public string NombreCompleto => RazonSocial ?? $"{Nombre} {Apellidos}".Trim();
}
