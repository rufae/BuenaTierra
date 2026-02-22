using BuenaTierra.Domain.Common;

namespace BuenaTierra.Domain.Entities;

public class Categoria : BaseEntity
{
    public int EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public int? PadreId { get; set; }
    public bool Activa { get; set; } = true;

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Categoria? CategoriaPadre { get; set; }
    public virtual ICollection<Categoria> Subcategorias { get; set; } = new List<Categoria>();
    public virtual ICollection<Producto> Productos { get; set; } = new List<Producto>();
}

public class Alergeno : BaseEntity
{
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public string? IconoUrl { get; set; }
}

public class Ingrediente : BaseEntity
{
    public int EmpresaId { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public string? Proveedor { get; set; }
    public string? CodigoProveedor { get; set; }
    public bool Activo { get; set; } = true;

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual ICollection<IngredienteAlergeno> IngredienteAlergenos { get; set; } = new List<IngredienteAlergeno>();
}

public class IngredienteAlergeno
{
    public int IngredienteId { get; set; }
    public int AlergenoId { get; set; }
    public virtual Ingrediente Ingrediente { get; set; } = null!;
    public virtual Alergeno Alergeno { get; set; } = null!;
}
