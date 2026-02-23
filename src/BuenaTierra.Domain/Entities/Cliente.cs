using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class Cliente : TenantEntity
{
    // ── Identificación ────────────────────────────────────────────────────────
    public TipoCliente Tipo { get; set; } = TipoCliente.Particular;
    public string? CodigoClienteInterno { get; set; }
    public string Nombre { get; set; } = string.Empty;           // nombre_comercial principal
    public string? Apellidos { get; set; }
    public string? RazonSocial { get; set; }
    public string? NombreComercial { get; set; }
    public string? NombreFiscal { get; set; }
    public string? Nif { get; set; }                             // NIF / CIF / DNI
    public string? AliasCliente { get; set; }

    // ── Domicilio ─────────────────────────────────────────────────────────────
    public string? Direccion { get; set; }
    public string? CodigoPostal { get; set; }
    public string? Ciudad { get; set; }                          // poblacion
    public string? Provincia { get; set; }
    public string? Pais { get; set; }

    // ── Contacto ──────────────────────────────────────────────────────────────
    public string? Telefono { get; set; }                        // movil principal
    public string? Telefono2 { get; set; }
    public string? Email { get; set; }
    public string? PersonaContacto { get; set; }
    public string? ObservacionesContacto { get; set; }

    // ── Datos Bancarios ───────────────────────────────────────────────────────
    public string? Ccc { get; set; }
    public string? Iban { get; set; }
    public string? Banco { get; set; }
    public string? Bic { get; set; }

    // ── Datos Comerciales ─────────────────────────────────────────────────────
    public FormaPago FormaPago { get; set; } = FormaPago.Contado;
    public int DiasPago { get; set; } = 0;
    public TipoImpuesto TipoImpuesto { get; set; } = TipoImpuesto.IVA;
    public bool AplicarImpuesto { get; set; } = true;
    public bool RecargoEquivalencia { get; set; } = false;
    public bool NoAplicarRetenciones { get; set; } = false;
    public decimal PorcentajeRetencion { get; set; } = 0;
    public decimal DescuentoGeneral { get; set; } = 0;
    public int? TarifaId { get; set; }

    // ── Otros Datos ───────────────────────────────────────────────────────────
    public EstadoCliente EstadoCliente { get; set; } = EstadoCliente.Activo;
    public bool Activo { get; set; } = true;
    public DateOnly? FechaAlta { get; set; }
    public EstadoSincronizacion EstadoSincronizacion { get; set; } = EstadoSincronizacion.NoAplicable;
    public bool NoRealizarFacturas { get; set; } = false;
    public string? Notas { get; set; }

    // ── Repartidor vinculado (para clientes atendidos por repartidor) ─────────
    public int? RepartidorEmpresaId { get; set; }

    // ── Navegación ────────────────────────────────────────────────────────────
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Empresa? RepartidorEmpresa { get; set; }
    public virtual ICollection<Factura> Facturas { get; set; } = new List<Factura>();
    public virtual ICollection<Pedido> Pedidos { get; set; } = new List<Pedido>();
    public virtual ICollection<Albaran> Albaranes { get; set; } = new List<Albaran>();
    public virtual ICollection<ClienteCondicionEspecial> CondicionesEspeciales { get; set; } = new List<ClienteCondicionEspecial>();

    public string NombreCompleto => RazonSocial ?? NombreComercial ?? $"{Nombre} {Apellidos}".Trim();
}

// ── Condiciones especiales de venta por cliente ───────────────────────────────
public class ClienteCondicionEspecial : BaseEntity
{
    public int ClienteId { get; set; }
    public TipoArticuloFamilia ArticuloFamilia { get; set; } = TipoArticuloFamilia.Articulo;
    public string Codigo { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public TipoCondicionEspecial Tipo { get; set; } = TipoCondicionEspecial.Precio;
    public decimal Precio { get; set; } = 0;
    public decimal Descuento { get; set; } = 0;

    // Navegación
    public virtual Cliente Cliente { get; set; } = null!;
}
