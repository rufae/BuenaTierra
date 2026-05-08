using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class Preventa : TenantEntity
{
    public int ClienteId { get; set; }
    public int? RepartidorId { get; set; }
    public DateOnly FechaPreventa { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public EstadoPreventa Estado { get; set; } = EstadoPreventa.Borrador;
    public int Version { get; set; } = 1;
    public bool AlertaConfirmada { get; set; } = false;
    public string? Notas { get; set; }

    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Cliente Cliente { get; set; } = null!;
    public virtual Usuario? Repartidor { get; set; }
    public virtual ICollection<PreventaLinea> Lineas { get; set; } = new List<PreventaLinea>();
}

public class PreventaLinea : BaseEntity
{
    public int PreventaId { get; set; }
    public int ProductoId { get; set; }
    public DateOnly FechaObjetivo { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public decimal CantidadPrevista { get; set; } = 0;
    public decimal? CantidadFinal { get; set; }
    public EstadoPreventaLinea EstadoLinea { get; set; } = EstadoPreventaLinea.Previsto;
    public bool Editable { get; set; } = true;
    public int? PedidoId { get; set; }
    public string? MotivoBloqueo { get; set; }
    public string? Observaciones { get; set; }

    public virtual Preventa Preventa { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Pedido? Pedido { get; set; }
    public virtual ICollection<PreventaHistorial> Historial { get; set; } = new List<PreventaHistorial>();
}

public class PreventaHistorial
{
    public long Id { get; set; }
    public int PreventaLineaId { get; set; }
    public string Accion { get; set; } = string.Empty;
    public decimal? CantidadAnterior { get; set; }
    public decimal? CantidadNueva { get; set; }
    public int? UsuarioId { get; set; }
    public string Detalle { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public virtual PreventaLinea PreventaLinea { get; set; } = null!;
    public virtual Usuario? Usuario { get; set; }
}
