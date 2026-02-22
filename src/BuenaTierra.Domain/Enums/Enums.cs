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

public enum TipoMovimientoStock
{
    EntradaProduccion,
    Venta,
    AjustePositivo,
    AjusteNegativo,
    Devolucion,
    Caducidad
}
