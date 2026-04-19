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
    Caducidad
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
