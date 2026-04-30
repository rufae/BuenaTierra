using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Services;

namespace BuenaTierra.Tests;

/// <summary>
/// Tests de no-regresión: política de precios y descuentos comerciales.
/// Verifican que ComercialPricingPolicy calcula correctamente:
///   - Precio base del producto
///   - Precio especial por condición de cliente
///   - Descuento general de cliente
///   - Descuento por condición especial de producto
///   - Precio manual de línea (override)
///   - Prioridad correcta entre fuentes de precio/descuento
/// Sin dependencias externas — cálculo puro de dominio.
/// </summary>
public class ComercialPricingPolicyTests
{
    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static Producto ProductoBase(decimal precio = 10m, decimal? descuentoDefault = null) => new()
    {
        Id            = 1,
        EmpresaId     = 1,
        Nombre        = "Palmera Test",
        Referencia    = "PALM001",
        Codigo        = "PALM001",
        PrecioVenta   = precio,
        IvaPorcentaje = 10m,
        DescuentoPorDefecto = descuentoDefault,
        Activo        = true,
    };

    private static Cliente ClienteBase(decimal descuentoGeneral = 0m) => new()
    {
        Id               = 1,
        EmpresaId        = 1,
        Nombre           = "Cliente Test",
        DescuentoGeneral = descuentoGeneral,
        CondicionesEspeciales = [],
    };

    private static ClienteCondicionEspecial Condicion(
        TipoCondicionEspecial tipo, string codigo, decimal precio = 0, decimal descuento = 0) => new()
    {
        Id              = 1,
        ClienteId       = 1,
        Tipo            = tipo,
        Codigo          = codigo,
        Precio          = precio,
        Descuento       = descuento,
        ArticuloFamilia = TipoArticuloFamilia.Articulo,
    };

    // ─── Precio ──────────────────────────────────────────────────────────────

    [Fact]
    public void Precio_SinCondicion_UsaPrecioBase()
    {
        var cliente  = ClienteBase();
        var producto = ProductoBase(precio: 5m);

        var result = ComercialPricingPolicy.Resolve(cliente, producto, null, 0);

        Assert.Equal(5m, result.PrecioUnitario);
        Assert.Equal("producto_base", result.OrigenPrecio);
    }

    [Fact]
    public void Precio_ConCondicionEspecialProducto_UsaPrecioCondicion()
    {
        var cliente = ClienteBase();
        cliente.CondicionesEspeciales =
        [
            Condicion(TipoCondicionEspecial.Precio, "PALM001", precio: 7m)
        ];
        var producto = ProductoBase(precio: 10m);

        var result = ComercialPricingPolicy.Resolve(cliente, producto, null, 0);

        Assert.Equal(7m, result.PrecioUnitario);
        Assert.Equal("condicion_especial", result.OrigenPrecio);
    }

    [Fact]
    public void Precio_ConPrecioManualLinea_ManualTieneMaximaPrioridad()
    {
        var cliente = ClienteBase();
        cliente.CondicionesEspeciales =
        [
            Condicion(TipoCondicionEspecial.Precio, "PALM001", precio: 7m)
        ];
        var producto = ProductoBase(precio: 10m);

        var result = ComercialPricingPolicy.Resolve(cliente, producto, precioManualLinea: 3m, 0);

        Assert.Equal(3m, result.PrecioUnitario);
        Assert.Equal("linea_manual", result.OrigenPrecio);
    }

    // ─── Descuento ───────────────────────────────────────────────────────────

    [Fact]
    public void Descuento_SinNada_EsCero()
    {
        var cliente  = ClienteBase(descuentoGeneral: 0);
        var producto = ProductoBase();

        var result = ComercialPricingPolicy.Resolve(cliente, producto, null, 0);

        Assert.Equal(0m, result.Descuento);
        Assert.Equal("sin_descuento", result.OrigenDescuento);
    }

    [Fact]
    public void Descuento_DescuentoGeneralCliente_SeAplica()
    {
        var cliente  = ClienteBase(descuentoGeneral: 15m);
        var producto = ProductoBase();

        var result = ComercialPricingPolicy.Resolve(cliente, producto, null, 0);

        Assert.Equal(15m, result.Descuento);
        Assert.Equal("cliente_general", result.OrigenDescuento);
    }

    [Fact]
    public void Descuento_DescuentoPorDefectoProducto_SeAplicaSinOtro()
    {
        var cliente  = ClienteBase(descuentoGeneral: 0);
        var producto = ProductoBase(descuentoDefault: 5m);

        var result = ComercialPricingPolicy.Resolve(cliente, producto, null, 0);

        Assert.Equal(5m, result.Descuento);
        Assert.Equal("producto_defecto", result.OrigenDescuento);
    }

    [Fact]
    public void Descuento_CondicionEspecificaProducto_SuperaGeneralCliente()
    {
        var cliente = ClienteBase(descuentoGeneral: 10m);
        cliente.CondicionesEspeciales =
        [
            Condicion(TipoCondicionEspecial.Descuento, "PALM001", descuento: 25m)
        ];
        var producto = ProductoBase();

        var result = ComercialPricingPolicy.Resolve(cliente, producto, null, 0);

        Assert.Equal(25m, result.Descuento);
        Assert.Equal("condicion_especial", result.OrigenDescuento);
    }

    [Fact]
    public void Descuento_ManualLinea_SuperaCondicionEspecial()
    {
        var cliente = ClienteBase(descuentoGeneral: 10m);
        cliente.CondicionesEspeciales =
        [
            Condicion(TipoCondicionEspecial.Descuento, "PALM001", descuento: 25m)
        ];
        var producto = ProductoBase();

        var result = ComercialPricingPolicy.Resolve(cliente, producto, null, descuentoManualLinea: 50m);

        Assert.Equal(50m, result.Descuento);
        Assert.Equal("linea_manual", result.OrigenDescuento);
    }

    // ─── Totales (cálculo final base imponible + IVA) ────────────────────────

    [Theory]
    [InlineData(10.0, 0.0,  2.0, 10.0, 20.0, 2.0)]   // 10€ x2, sin descuento → BI=20, IVA=2
    [InlineData(10.0, 50.0, 1.0, 10.0, 5.0,  0.5)]    // 10€ x1, -50% → BI=5, IVA=0.5
    [InlineData(5.0,  20.0, 3.0, 10.0, 12.0, 1.2)]    // 5€ x3, -20% → BI=12, IVA=1.2
    public void Total_CalculoBaseImponibleIva_Correcto(
        double precioD, double descuentoPctD, double cantidadD, double ivaPctD,
        double expectedBID, double expectedIvaD)
    {
        decimal precio       = (decimal)precioD;
        decimal descuentoPct = (decimal)descuentoPctD;
        decimal cantidad     = (decimal)cantidadD;
        decimal ivaPct       = (decimal)ivaPctD;
        decimal expectedBI   = (decimal)expectedBID;
        decimal expectedIva  = (decimal)expectedIvaD;

        var baseImponible = precio * cantidad * (1 - descuentoPct / 100);
        var iva = Math.Round(baseImponible * ivaPct / 100, 2);

        Assert.Equal(expectedBI, baseImponible);
        Assert.Equal(expectedIva, iva);
    }

    // ─── Condición global (*) aplica a todos los productos ───────────────────

    [Fact]
    public void Descuento_CondicionGlobalAsterisco_AplicaATodosLosProductos()
    {
        var cliente = ClienteBase();
        cliente.CondicionesEspeciales =
        [
            Condicion(TipoCondicionEspecial.Descuento, "*", descuento: 8m)
        ];
        var producto = ProductoBase();

        var result = ComercialPricingPolicy.Resolve(cliente, producto, null, 0);

        Assert.Equal(8m, result.Descuento);
        Assert.Equal("condicion_especial", result.OrigenDescuento);
    }
}
