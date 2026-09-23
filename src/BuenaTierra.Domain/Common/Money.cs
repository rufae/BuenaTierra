namespace BuenaTierra.Domain.Common;

/// <summary>
/// Regla única de redondeo monetario del proyecto: 2 decimales (céntimos),
/// AwayFromZero. Las cabeceras de pedido/albarán/factura se calculan SIEMPRE
/// como suma de valores redondeados con esta función para que los tres
/// documentos de la misma venta cuadren exactamente al céntimo.
/// </summary>
public static class Money
{
    public static decimal R2(decimal value)
        => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
