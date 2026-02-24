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

/// <summary>
/// Registro de control de materias primas / ingredientes en recepción.
/// Equivale a la hoja "CONTROL MAT PRIMAS" exigida por sanidad.
/// </summary>
public class ControlMateriaPrima : BaseEntity
{
    public int EmpresaId { get; set; }

    // Datos de recepción
    public DateOnly FechaEntrada { get; set; }
    public int? IngredienteId { get; set; }       // FK opcional al catálogo
    public string Producto { get; set; } = string.Empty; // nombre tal como aparece en el albarán
    public decimal Unidades { get; set; }
    public DateOnly? FechaCaducidad { get; set; }
    public string? Proveedor { get; set; }
    public string? Lote { get; set; }
    public DateOnly? FechaAperturaLote { get; set; }

    // Inspección organoléptica / transporte
    /// <summary>true = Correcto, false = Incorrecto</summary>
    public bool CondicionesTransporte { get; set; } = true;
    /// <summary>true = Aceptada, false = Rechazada</summary>
    public bool MercanciaAceptada { get; set; } = true;

    public string? Responsable { get; set; }
    public DateOnly? FechaFinExistencia { get; set; }
    public string? Observaciones { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Ingrediente? Ingrediente { get; set; }
}
