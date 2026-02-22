using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class SerieFacturacion : BaseEntity
{
    public int EmpresaId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public string? Prefijo { get; set; }
    public int UltimoNumero { get; set; } = 0;
    public string Formato { get; set; } = "{PREFIJO}{ANIO}{NUMERO:6}";
    public bool Activa { get; set; } = true;

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
}

public class Factura : TenantEntity
{
    public int? AlbaranId { get; set; }
    public int? PedidoId { get; set; }
    public int ClienteId { get; set; }
    public int UsuarioId { get; set; }
    public int SerieId { get; set; }
    public string NumeroFactura { get; set; } = string.Empty;
    public DateOnly FechaFactura { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public DateOnly? FechaVencimiento { get; set; }
    public EstadoFactura Estado { get; set; } = EstadoFactura.Emitida;
    public bool EsSimplificada { get; set; } = false;
    public decimal Subtotal { get; set; }
    public decimal DescuentoTotal { get; set; }
    public decimal BaseImponible { get; set; }
    public string IvaDesglose { get; set; } = "[]";
    public decimal IvaTotal { get; set; }
    public decimal Total { get; set; }
    public string? PdfUrl { get; set; }
    public string? Notas { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Cliente Cliente { get; set; } = null!;
    public virtual Usuario Usuario { get; set; } = null!;
    public virtual SerieFacturacion Serie { get; set; } = null!;
    public virtual Albaran? Albaran { get; set; }
    public virtual ICollection<FacturaLinea> Lineas { get; set; } = new List<FacturaLinea>();

    public void RecalcularTotales()
    {
        Subtotal = Lineas.Sum(l => l.Subtotal);
        BaseImponible = Subtotal - DescuentoTotal;
        IvaTotal = Lineas.Sum(l => l.IvaImporte);
        Total = BaseImponible + IvaTotal;
    }
}

public class FacturaLinea : BaseEntity
{
    public int FacturaId { get; set; }
    public int ProductoId { get; set; }
    public int? LoteId { get; set; }
    public string? Descripcion { get; set; }
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
    public decimal Descuento { get; set; } = 0;
    public decimal IvaPorcentaje { get; set; } = 10;
    public short Orden { get; set; } = 0;

    // Columnas calculadas (corresponden a GENERATED ALWAYS en PG)
    public decimal Subtotal => Math.Round(Cantidad * PrecioUnitario * (1 - Descuento / 100), 4);
    public decimal IvaImporte => Math.Round(Subtotal * IvaPorcentaje / 100, 4);
    public decimal Total => Subtotal + IvaImporte;

    // Navegación
    public virtual Factura Factura { get; set; } = null!;
    public virtual Producto Producto { get; set; } = null!;
    public virtual Lote? Lote { get; set; }
}
