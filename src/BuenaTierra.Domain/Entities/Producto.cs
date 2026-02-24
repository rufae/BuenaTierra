using BuenaTierra.Domain.Common;

namespace BuenaTierra.Domain.Entities;

public class Producto : TenantEntity
{
    public int? CategoriaId { get; set; }
    public string? Codigo { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public string? DescripcionLarga { get; set; }
    public decimal PrecioVenta { get; set; }
    public decimal? PrecioCoste { get; set; }
    public decimal IvaPorcentaje { get; set; } = 10.00m;
    public string UnidadMedida { get; set; } = "unidad";
    public decimal? PesoUnitarioGr { get; set; }
    public int? VidaUtilDias { get; set; }
    public decimal? TemperaturaMin { get; set; }
    public decimal? TemperaturaMax { get; set; }
    public bool RequiereLote { get; set; } = true;
    public bool CompartidoRepartidores { get; set; } = true;
    public bool Activo { get; set; } = true;
    public string? ImagenUrl { get; set; }

    // Campos comerciales del cliente
    public string? CodigoBarras { get; set; }
    public string? ProveedorHabitual { get; set; }
    public string? Referencia { get; set; }          // Referencia en el proveedor
    public string? Fabricante { get; set; }
    public decimal? DescuentoPorDefecto { get; set; } // % descuento por defecto
    public decimal? StockMinimo { get; set; }
    public decimal? StockMaximo { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Categoria? Categoria { get; set; }
    public virtual ICollection<ProductoIngrediente> ProductoIngredientes { get; set; } = new List<ProductoIngrediente>();
    public virtual ICollection<Lote> Lotes { get; set; } = new List<Lote>();
    public virtual ICollection<Stock> Stocks { get; set; } = new List<Stock>();
}

public class ProductoIngrediente : BaseEntity
{
    public int ProductoId { get; set; }
    public int IngredienteId { get; set; }
    public decimal? CantidadGr { get; set; }
    public bool EsPrincipal { get; set; } = false;

    public virtual Producto Producto { get; set; } = null!;
    public virtual Ingrediente Ingrediente { get; set; } = null!;
}
