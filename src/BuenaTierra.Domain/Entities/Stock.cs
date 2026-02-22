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
    public decimal StockMinimo { get; set; } = 0;
    public new DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Lote Lote { get; set; } = null!;

    public decimal DisponibleReal => CantidadDisponible - CantidadReservada;
    public bool TieneAlertas => CantidadDisponible <= StockMinimo;
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
