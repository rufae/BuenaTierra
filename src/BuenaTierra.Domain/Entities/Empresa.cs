using BuenaTierra.Domain.Common;

namespace BuenaTierra.Domain.Entities;

public class Empresa : BaseEntity
{
    public string Nombre { get; set; } = string.Empty;
    public string Nif { get; set; } = string.Empty;
    public string? RazonSocial { get; set; }
    public string? Direccion { get; set; }
    public string? CodigoPostal { get; set; }
    public string? Ciudad { get; set; }
    public string? Provincia { get; set; }
    public string Pais { get; set; } = "España";
    public string? Telefono { get; set; }
    public string? Email { get; set; }
    public string? Web { get; set; }
    public string? LogoUrl { get; set; }
    public bool EsObrador { get; set; } = false;
    public int? EmpresaPadreId { get; set; }
    public bool Activa { get; set; } = true;
    public string Configuracion { get; set; } = "{}";

    // Navegación
    public virtual Empresa? EmpresaPadre { get; set; }
    public virtual ICollection<Empresa> SubEmpresas { get; set; } = new List<Empresa>();
    public virtual ICollection<Usuario> Usuarios { get; set; } = new List<Usuario>();
    public virtual ICollection<Cliente> Clientes { get; set; } = new List<Cliente>();
    public virtual ICollection<Producto> Productos { get; set; } = new List<Producto>();
    public virtual ICollection<Produccion> Producciones { get; set; } = new List<Produccion>();
    public virtual ICollection<Lote> Lotes { get; set; } = new List<Lote>();
    public virtual ICollection<Factura> Facturas { get; set; } = new List<Factura>();
    public virtual ICollection<SerieFacturacion> SeriesFacturacion { get; set; } = new List<SerieFacturacion>();
}
