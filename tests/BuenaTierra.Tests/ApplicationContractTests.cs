using BuenaTierra.Application.Interfaces;

namespace BuenaTierra.Tests;

/// <summary>
/// Tests de los DTOs y Records de la capa Application.
/// Validan contratos de dominio sin infraestructura.
/// </summary>
public class ApplicationContractTests
{
    // ── AuthResult ────────────────────────────────────────────────────────
    [Fact]
    public void AuthResult_Success_True_TieneToken()
    {
        var expires = DateTime.UtcNow.AddHours(1);
        var result = new AuthResult(true, "jwt-token-abc", "refresh-xyz", expires);

        Assert.True(result.Success);
        Assert.Equal("jwt-token-abc", result.Token);
        Assert.Equal("refresh-xyz", result.RefreshToken);
        Assert.Equal(expires, result.Expira);
        Assert.Null(result.Error);
    }

    [Fact]
    public void AuthResult_Failure_TieneError()
    {
        var result = new AuthResult(false, null, null, null, "Credenciales inválidas");

        Assert.False(result.Success);
        Assert.Null(result.Token);
        Assert.Equal("Credenciales inválidas", result.Error);
    }

    // ── LoteAsignado ──────────────────────────────────────────────────────
    [Fact]
    public void LoteAsignado_PropiedadesCorrectas()
    {
        var fecha = DateOnly.FromDateTime(DateTime.Today);
        var lote = new LoteAsignado(
            LoteId: 1,
            CodigoLote: "L001",
            ProductoId: 5,
            Cantidad: 3.5m,
            FechaFabricacion: fecha,
            FechaCaducidad: fecha.AddDays(90)
        );

        Assert.Equal(1, lote.LoteId);
        Assert.Equal("L001", lote.CodigoLote);
        Assert.Equal(5, lote.ProductoId);
        Assert.Equal(3.5m, lote.Cantidad);
    }

    // ── StockResumen ──────────────────────────────────────────────────────
    [Fact]
    public void StockResumen_PropiedadesMapeadasCorrectamente()
    {
        var resumen = new StockResumen(10, "Palmeras", 50m, 3);

        Assert.Equal(10, resumen.ProductoId);
        Assert.Equal("Palmeras", resumen.ProductoNombre);
        Assert.Equal(50m, resumen.TotalDisponible);
        Assert.Equal(3, resumen.NumLotes);
    }

    // ── StockAlerta ───────────────────────────────────────────────────────
    [Fact]
    public void StockAlerta_PropiedadesMapeadasCorrectamente()
    {
        var alerta = new StockAlerta(3, "Croissants", 2m, 10m);

        Assert.Equal(3, alerta.ProductoId);
        Assert.Equal("Croissants", alerta.ProductoNombre);
        Assert.Equal(2m, alerta.Disponible);
        Assert.Equal(10m, alerta.Minimo);
    }

    // ── FacturaCreada ─────────────────────────────────────────────────────
    [Fact]
    public void FacturaCreada_PropiedadesMapeadasCorrectamente()
    {
        var factura = new FacturaCreada(42, "A-2025-001", 350.75m);

        Assert.Equal(42, factura.FacturaId);
        Assert.Equal("A-2025-001", factura.NumeroFactura);
        Assert.Equal(350.75m, factura.Total);
    }
}
