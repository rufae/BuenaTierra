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
    public string VidaUtilUnidad { get; set; } = "Dias";
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

    // ── Información nutricional (por 100g) — para etiquetas UE 1169/2011 ──
    public decimal? ValorEnergeticoKj { get; set; }
    public decimal? ValorEnergeticoKcal { get; set; }
    public decimal? Grasas { get; set; }
    public decimal? GrasasSaturadas { get; set; }
    public decimal? HidratosCarbono { get; set; }
    public decimal? Azucares { get; set; }
    public decimal? Proteinas { get; set; }
    public decimal? Sal { get; set; }

    // ── Etiquetado ──
    public string? IngredientesTexto { get; set; }    // texto completo con alérgenos en MAYÚSCULAS
    public string? Trazas { get; set; }                // "Puede contener trazas de..."
    public string? Conservacion { get; set; }          // "Conservar en lugar fresco y seco"

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
