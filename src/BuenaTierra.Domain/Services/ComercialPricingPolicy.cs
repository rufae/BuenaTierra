using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Services;

public readonly record struct ComercialPricingResult(
    decimal PrecioUnitario,
    decimal Descuento,
    string OrigenPrecio,
    string OrigenDescuento);

public static class ComercialPricingPolicy
{
    public static ComercialPricingResult Resolve(
        Cliente cliente,
        Producto producto,
        decimal? precioManualLinea,
        decimal descuentoManualLinea)
    {
        var condicionPrecio = FindBestCondicion(cliente, producto,
            c => c.Tipo is TipoCondicionEspecial.Precio or TipoCondicionEspecial.PrecioEspecial);

        var condicionDescuento = FindBestCondicion(cliente, producto,
            c => c.Tipo == TipoCondicionEspecial.Descuento);

        decimal precio;
        string origenPrecio;

        if (precioManualLinea.HasValue)
        {
            precio = precioManualLinea.Value;
            origenPrecio = "linea_manual";
        }
        else if (condicionPrecio is not null && condicionPrecio.Precio > 0)
        {
            precio = condicionPrecio.Precio;
            origenPrecio = "condicion_especial";
        }
        else
        {
            precio = producto.PrecioVenta;
            origenPrecio = "producto_base";
        }

        decimal descuento;
        string origenDescuento;

        if (descuentoManualLinea > 0)
        {
            descuento = descuentoManualLinea;
            origenDescuento = "linea_manual";
        }
        else if (condicionDescuento is not null && condicionDescuento.Descuento > 0)
        {
            descuento = condicionDescuento.Descuento;
            origenDescuento = "condicion_especial";
        }
        else if (cliente.DescuentoGeneral > 0)
        {
            descuento = cliente.DescuentoGeneral;
            origenDescuento = "cliente_general";
        }
        else if ((producto.DescuentoPorDefecto ?? 0m) > 0)
        {
            descuento = producto.DescuentoPorDefecto!.Value;
            origenDescuento = "producto_defecto";
        }
        else
        {
            descuento = 0m;
            origenDescuento = "sin_descuento";
        }

        return new ComercialPricingResult(precio, descuento, origenPrecio, origenDescuento);
    }

    private static ClienteCondicionEspecial? FindBestCondicion(
        Cliente cliente,
        Producto producto,
        Func<ClienteCondicionEspecial, bool> tipoFilter)
    {
        if (cliente.CondicionesEspeciales == null || cliente.CondicionesEspeciales.Count == 0)
            return null;

        var candidates = cliente.CondicionesEspeciales
            .Where(c => c.ArticuloFamilia != TipoArticuloFamilia.Familia)
            .Where(tipoFilter)
            .Select(c => new { Condicion = c, Specificity = GetSpecificity(c.Codigo, producto) })
            .Where(x => x.Specificity > 0)
            .OrderByDescending(x => x.Specificity)
            .ThenByDescending(x => x.Condicion.UpdatedAt)
            .ThenByDescending(x => x.Condicion.Id)
            .Select(x => x.Condicion)
            .ToList();

        return candidates.FirstOrDefault();
    }

    private static int GetSpecificity(string? codigoCondicion, Producto producto)
    {
        if (IsGlobal(codigoCondicion))
            return 1;

        var key = codigoCondicion!.Trim().ToUpperInvariant();

        var productKeys = new[]
        {
            producto.Codigo?.Trim().ToUpperInvariant(),
            producto.Referencia?.Trim().ToUpperInvariant(),
            producto.Id.ToString()
        }
        .Where(k => !string.IsNullOrWhiteSpace(k));

        return productKeys.Any(k => k == key) ? 2 : 0;
    }

    private static bool IsGlobal(string? codigo)
    {
        if (string.IsNullOrWhiteSpace(codigo)) return true;

        var value = codigo.Trim();
        return value == "*"
            || value.Equals("TODOS", StringComparison.OrdinalIgnoreCase)
            || value.Equals("ALL", StringComparison.OrdinalIgnoreCase);
    }
}
