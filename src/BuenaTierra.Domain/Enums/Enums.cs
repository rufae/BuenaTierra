namespace BuenaTierra.Domain.Enums;

public enum RolUsuario
{
    Admin,
    Obrador,
    Repartidor
}

// Alineado con DB: Pendiente→Confirmado→EnPreparacion→Preparado→EnReparto→Entregado→Cancelado
public enum EstadoPedido
{
    Pendiente,
    Confirmado,
    EnPreparacion,
    Preparado,
    EnReparto,
    Entregado,
    Cancelado
}

// Alineado con DB: Pendiente→EnReparto→Entregado→Facturado→Cancelado
public enum EstadoAlbaran
{
    Pendiente,
    EnReparto,
    Entregado,
    Facturado,
    Cancelado
}

// Alineado con DB: Borrador→Emitida→Enviada→Cobrada→Anulada
public enum EstadoFactura
{
    Borrador,
    Emitida,
    Enviada,
    Cobrada,
    Anulada,
    // Some older code references Cancelada — keep alias to avoid breaking callers
    Cancelada = Anulada
}

public enum EstadoProduccion
{
    Planificada,
    EnProceso,
    Finalizada,
    Cancelada
}

public enum EstadoPreventa
{
    Borrador,
    PendienteRevision,
    Confirmada,
    Convertida,
    Cancelada
}

public enum EstadoPreventaLinea
{
    Previsto,
    PendienteCompra,
    ListoParaPedido,
    Convertida,
    NoServible,
    Cancelada
}

public enum TipoCliente
{
    Empresa,
    Autonomo,
    Particular,
    Repartidor
}

public enum FormaPago
{
    Contado,
    Transfer30,
    Transfer60,
    Transfer90,
    Domiciliacion,
    Cheque,
    Efectivo,
    Otro
}

public enum TipoImpuesto
{
    IVA,
    RecargoEquivalencia,
    Exento,
    IGIC
}

public enum EstadoCliente
{
    Activo,
    Inactivo,
    Suspendido,
    Bloqueado
}

public enum EstadoSincronizacion
{
    Sincronizado,
    Pendiente,
    Error,
    NoAplicable
}

public enum TipoCondicionEspecial
{
    Precio,
    Descuento,
    PrecioEspecial
}

public enum TipoArticuloFamilia
{
    Articulo,
    Familia
}

public enum TipoMovimientoStock
{
    EntradaProduccion,
    Venta,
    AjustePositivo,
    AjusteNegativo,
    Devolucion,
    Caducidad,
    CargaFurgoneta,
    DescargaFurgoneta,
    Merma
}

/// <summary>Ubicación de la que sale (o a la que vuelve) la mercancía en una venta/devolución.</summary>
public enum OrigenStock
{
    Fabrica,
    Furgoneta
}

/// <summary>
/// Motivos de devolución. Cada motivo define con MotivoDevolucionInfo.SumaStock()
/// si la mercancía vuelve al stock o no (pérdida: caducidad, daño...).
/// </summary>
public enum MotivoDevolucion
{
    /// <summary>El cliente rechazó el producto (en buen estado) → repone stock.</summary>
    DevolucionVoluntaria,
    /// <summary>Error de preparación/pedido del obrador (en buen estado) → repone stock.</summary>
    ErrorPreparacion,
    /// <summary>Caducidad detectada → NO repone stock.</summary>
    Caducidad,
    /// <summary>Producto dañado/roto en ruta → NO repone stock.</summary>
    ProductoDaniado,
    /// <summary>Defecto de calidad del obrador (no revendible) → repone stock.</summary>
    CalidadObrador,
    /// <summary>Otro motivo (requiere descripción) → NO repone stock (seguro por defecto).</summary>
    Otro
}

public static class MotivoDevolucionInfo
{
    /// <summary>Indica si la devolución con este motivo repone el stock.</summary>
    public static bool SumaStock(MotivoDevolucion motivo) => motivo switch
    {
        MotivoDevolucion.DevolucionVoluntaria => true,
        MotivoDevolucion.ErrorPreparacion => true,
        MotivoDevolucion.CalidadObrador => true,
        MotivoDevolucion.Caducidad => false,
        MotivoDevolucion.ProductoDaniado => false,
        MotivoDevolucion.Otro => false,
        _ => false
    };

    /// <summary>Etiqueta visible del motivo.</summary>
    public static string Descripcion(MotivoDevolucion motivo) => motivo switch
    {
        MotivoDevolucion.DevolucionVoluntaria => "Devolución voluntaria",
        MotivoDevolucion.ErrorPreparacion => "Error de preparación",
        MotivoDevolucion.Caducidad => "Caducidad",
        MotivoDevolucion.ProductoDaniado => "Producto dañado",
        MotivoDevolucion.CalidadObrador => "Calidad del obrador",
        MotivoDevolucion.Otro => "Otro motivo",
        _ => motivo.ToString()
    };
}

// ── Etiquetas ─────────────────────────────────────────

public enum TipoImpresora
{
    A4,
    TermicaDirecta,
    TermicaTransferencia
}

public enum FormatoEtiqueta
{
    Docx,
    Odt,
    Pdf,
    Png,
    Jpg
}

public enum EstadoImpresion
{
    Pendiente,
    Impreso,
    Error
}

public enum EstadoCorreo
{
    Borrador,
    Enviado,
    Error
}
