using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class Produccion : TenantEntity
{
    public int ProductoId { get; set; }
    public int UsuarioId { get; set; }
    public DateOnly FechaProduccion { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public decimal CantidadProducida { get; set; }
    public decimal CantidadMerma { get; set; } = 0;
    public EstadoProduccion Estado { get; set; } = EstadoProduccion.Planificada;
    public string? Notas { get; set; }
    /// <summary>Código de lote personalizado sugerido por el usuario (ddMMyyyy o libre). Si null, se autogenera en Finalizar.</summary>
    public string? CodigoLoteSugerido { get; set; }
    /// <summary>Fecha de caducidad introducida manualmente por el usuario. Si se rellena, tiene prioridad sobre el cálculo automático por VidaUtilDias.</summary>
    public DateOnly? FechaCaducidadSugerida { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Usuario Usuario { get; set; } = null!;
    public virtual ICollection<Lote> Lotes { get; set; } = new List<Lote>();

    public decimal CantidadNeta => CantidadProducida - CantidadMerma;
}

public class Lote : BaseEntity
{
    public int EmpresaId { get; set; }
    public int ProductoId { get; set; }
    public int? ProduccionId { get; set; }
    public string CodigoLote { get; set; } = string.Empty;
    public DateOnly FechaFabricacion { get; set; }
    public DateOnly? FechaCaducidad { get; set; }
    public decimal CantidadInicial { get; set; }
    public bool Bloqueado { get; set; } = false;
    public string? MotivoBloqueado { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Produccion? Produccion { get; set; }
    public virtual Stock? Stock { get; set; }

    public bool EstaVigente => !Bloqueado &&
        (FechaCaducidad == null || FechaCaducidad > DateOnly.FromDateTime(DateTime.Today));

    public bool EstaProximoCaducidad => FechaCaducidad.HasValue &&
        FechaCaducidad.Value > DateOnly.FromDateTime(DateTime.Today) &&
        FechaCaducidad.Value <= DateOnly.FromDateTime(DateTime.Today.AddDays(3));
}
