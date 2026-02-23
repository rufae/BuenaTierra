namespace BuenaTierra.Domain.Enums;

public enum RolUsuario
{
    Admin,
    Obrador,
    Repartidor
}

public enum EstadoPedido
{
    Pendiente,
    Confirmado,
    EnPreparacion,
    Servido,
    Cancelado
}

public enum EstadoAlbaran
{
    Pendiente,
    Entregado,
    Facturado,
    Cancelado
}

public enum EstadoFactura
{
    Borrador,
    Emitida,
    Cobrada,
    Cancelada
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
