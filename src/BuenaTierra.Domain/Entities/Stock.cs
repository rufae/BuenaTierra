using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class Stock : BaseEntity
{
    public int EmpresaId { get; set; }
    public int ProductoId { get; set; }
    public int LoteId { get; set; }
    public decimal CantidadDisponible { get; set; } = 0;
    public decimal CantidadReservada { get; set; } = 0;

    /// <summary>
    /// Unidades de ESTA fila (producto+lote) que están actualmente en la furgoneta.
    /// Semántica: disponible = TOTAL (fábrica + furgoneta); en fábrica = disponible - furgoneta.
    /// Invariante: CantidadFurgoneta &lt;= CantidadDisponible.
    /// Extensión futura multi-furgoneta: migrar a tabla de ubicaciones con repartidor_id.
    /// </summary>
    public decimal CantidadFurgoneta { get; set; } = 0;
    public decimal StockMinimo { get; set; } = 0;
    public new DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Lote Lote { get; set; } = null!;

    public decimal DisponibleReal => CantidadDisponible - CantidadReservada;
    public bool TieneAlertas => CantidadDisponible <= StockMinimo;

    /// <summary>Unidades en fábrica (disponible menos lo que está en la furgoneta).</summary>
    public decimal FabricaDisponible => Math.Max(0, CantidadDisponible - CantidadFurgoneta);

    /// <summary>Unidades disponibles en la ubicación indicada.</summary>
    public decimal DisponibleParaOrigen(OrigenStock origen)
        => origen == OrigenStock.Furgoneta ? CantidadFurgoneta : FabricaDisponible;

    /// <summary>
    /// Descuenta stock saliendo de la ubicación indicada.
    /// Fabrica: baja el total (la furgoneta no se toca).
    /// Furgoneta: baja el total Y la porción de furgoneta.
    /// </summary>
    public void Consumir(OrigenStock origen, decimal cantidad)
    {
        CantidadDisponible -= cantidad;
        if (origen == OrigenStock.Furgoneta)
            CantidadFurgoneta = Math.Max(0, CantidadFurgoneta - cantidad);
        CantidadFurgoneta = Math.Min(CantidadFurgoneta, CantidadDisponible);
    }

    /// <summary>
    /// Repone stock entrando en la ubicación indicada (cancelación / devolución).
    /// Fabrica: sube solo el total. Furgoneta: sube el total y la porción de furgoneta.
    /// </summary>
    public void Reponer(OrigenStock destino, decimal cantidad)
    {
        CantidadDisponible += cantidad;
        if (destino == OrigenStock.Furgoneta)
            CantidadFurgoneta += cantidad;
        CantidadFurgoneta = Math.Min(CantidadFurgoneta, CantidadDisponible);
    }

    /// <summary>Red de seguridad: mantiene la invariante furgoneta &lt;= disponible.</summary>
    public void AjustarInvarianteFurgoneta()
        => CantidadFurgoneta = Math.Max(0, Math.Min(CantidadFurgoneta, CantidadDisponible));
}

public class MovimientoStock : BaseEntity
{
    public int EmpresaId { get; set; }
    public int ProductoId { get; set; }
    public int LoteId { get; set; }
    public TipoMovimientoStock Tipo { get; set; }
    public decimal Cantidad { get; set; }
    public decimal CantidadAntes { get; set; }
    public decimal CantidadDespues { get; set; }
    public string? ReferenciaTipo { get; set; }
    public int? ReferenciaId { get; set; }
    public int? UsuarioId { get; set; }
    public string? Notas { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Lote Lote { get; set; } = null!;
    public virtual Usuario? Usuario { get; set; }
}
