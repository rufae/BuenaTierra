using BuenaTierra.Domain.Common;

namespace BuenaTierra.Domain.Entities;

public class Trazabilidad : BaseEntity
{
    public int EmpresaId { get; set; }
    public int LoteId { get; set; }
    public int ProductoId { get; set; }
    public int? ClienteId { get; set; }
    public int? FacturaId { get; set; }
    public int? AlbaranId { get; set; }
    public decimal Cantidad { get; set; }
    public string TipoOperacion { get; set; } = string.Empty;
    public DateTime FechaOperacion { get; set; } = DateTime.UtcNow;
    public int? UsuarioId { get; set; }
    public string DatosAdicionales { get; set; } = "{}";

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Lote Lote { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Cliente? Cliente { get; set; }
    public virtual Factura? Factura { get; set; }
    public virtual Albaran? Albaran { get; set; }
    public virtual Usuario? Usuario { get; set; }
}
