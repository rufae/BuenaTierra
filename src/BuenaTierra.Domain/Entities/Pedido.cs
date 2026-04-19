using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class Pedido : TenantEntity
{
    public int ClienteId { get; set; }
    public int UsuarioId { get; set; }
    public string? NumeroPedido { get; set; }
    public DateOnly FechaPedido { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public DateOnly? FechaEntrega { get; set; }
    public EstadoPedido Estado { get; set; } = EstadoPedido.Pendiente;
    public decimal Subtotal { get; set; }
    public decimal DescuentoTotal { get; set; }
    public decimal IvaTotal { get; set; }
    public decimal RecargoEquivalenciaTotal { get; set; } = 0;
    public decimal RetencionTotal { get; set; } = 0;
    public decimal Total { get; set; }
    public string? Notas { get; set; }

    // Navegación
    public virtual Cliente Cliente { get; set; } = null!;
    public virtual Usuario Usuario { get; set; } = null!;
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual ICollection<PedidoLinea> Lineas { get; set; } = new List<PedidoLinea>();
    public virtual ICollection<Albaran> Albaranes { get; set; } = new List<Albaran>();
}

public class PedidoLinea : BaseEntity
{
    public int PedidoId { get; set; }
    public int ProductoId { get; set; }
    public string? Descripcion { get; set; }
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
    public decimal Descuento { get; set; } = 0;
    public decimal IvaPorcentaje { get; set; } = 10;
    public decimal RecargoEquivalenciaPorcentaje { get; set; } = 0;
    public short Orden { get; set; } = 0;

    public decimal Subtotal => Math.Round(Cantidad * PrecioUnitario * (1 - Descuento / 100), 4);
    public decimal IvaImporte => Math.Round(Subtotal * IvaPorcentaje / 100, 4);
    public decimal RecargoEquivalenciaImporte => Math.Round(Subtotal * RecargoEquivalenciaPorcentaje / 100, 4);

    /// <summary>
    /// JSON serializado con la asignación FIFO de lotes al confirmar el pedido.
    /// Formato: [{"loteId":1,"codigoLote":"120426-5-001","cantidad":3.0}]
    /// NULL mientras el pedido está en Pendiente.
    /// </summary>
    public string? ReservaLotesJson { get; set; }

    // Navegación
    public virtual Pedido Pedido { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
}

public class Albaran : TenantEntity
{
    public int? PedidoId { get; set; }
    public int ClienteId { get; set; }
    public int UsuarioId { get; set; }
    public int? SerieId { get; set; }
    public string? NumeroAlbaran { get; set; }
    public DateOnly FechaAlbaran { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public DateOnly? FechaEntrega { get; set; }
    public EstadoAlbaran Estado { get; set; } = EstadoAlbaran.Pendiente;
    public decimal Subtotal { get; set; }
    public decimal DescuentoTotal { get; set; }
    public decimal IvaTotal { get; set; }
    public decimal RecargoEquivalenciaTotal { get; set; } = 0;
    public decimal RetencionTotal { get; set; } = 0;
    public decimal Total { get; set; }
    public string? Notas { get; set; }

    // Navegación
    public virtual Cliente Cliente { get; set; } = null!;
    public virtual Usuario Usuario { get; set; } = null!;
    public virtual Pedido? Pedido { get; set; }
    public virtual SerieFacturacion? Serie { get; set; }
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual ICollection<AlbaranLinea> Lineas { get; set; } = new List<AlbaranLinea>();
    public virtual ICollection<Factura> Facturas { get; set; } = new List<Factura>();
}

public class AlbaranLinea : BaseEntity
{
    public int AlbaranId { get; set; }
    public int ProductoId { get; set; }
    public int? LoteId { get; set; }
    public string? Descripcion { get; set; }
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
    public decimal Descuento { get; set; } = 0;
    public decimal IvaPorcentaje { get; set; } = 10;

    public decimal RecargoEquivalenciaPorcentaje { get; set; } = 0;
    public short Orden { get; set; } = 0;

    public decimal Subtotal => Math.Round(Cantidad * PrecioUnitario * (1 - Descuento / 100), 4);
    public decimal IvaImporte => Math.Round(Subtotal * IvaPorcentaje / 100, 4);
    public decimal RecargoEquivalenciaImporte => Math.Round(Subtotal * RecargoEquivalenciaPorcentaje / 100, 4);

    // Navegación
    public virtual Albaran Albaran { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Lote? Lote { get; set; }
}
