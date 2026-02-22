using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Exceptions;

namespace BuenaTierra.Tests;

/// <summary>
/// Tests de dominio puro: entidades Lote y Stock.
/// Sin dependencias externas — sin Mocks ni BD.
/// </summary>
public class DomainEntityTests
{
    // ── Lote.EstaVigente ──────────────────────────────────────────────────
    [Fact]
    public void Lote_NoVencido_NoBloqueado_EstaVigente()
    {
        var lote = new Lote
        {
            CodigoLote = "L001",
            FechaFabricacion = DateOnly.FromDateTime(DateTime.Today.AddDays(-5)),
            FechaCaducidad = DateOnly.FromDateTime(DateTime.Today.AddDays(30)),
            Bloqueado = false,
        };
        Assert.True(lote.EstaVigente);
    }

    [Fact]
    public void Lote_Bloqueado_NoEstaVigente()
    {
        var lote = new Lote
        {
            CodigoLote = "L002",
            FechaFabricacion = DateOnly.FromDateTime(DateTime.Today.AddDays(-5)),
            FechaCaducidad = DateOnly.FromDateTime(DateTime.Today.AddDays(30)),
            Bloqueado = true,
        };
        Assert.False(lote.EstaVigente);
    }

    [Fact]
    public void Lote_Vencido_NoEstaVigente()
    {
        var lote = new Lote
        {
            CodigoLote = "L003",
            FechaFabricacion = DateOnly.FromDateTime(DateTime.Today.AddDays(-20)),
            FechaCaducidad = DateOnly.FromDateTime(DateTime.Today.AddDays(-1)),
            Bloqueado = false,
        };
        Assert.False(lote.EstaVigente);
    }

    [Fact]
    public void Lote_SinFechaCaducidad_EstaVigente()
    {
        var lote = new Lote
        {
            CodigoLote = "L004",
            FechaFabricacion = DateOnly.FromDateTime(DateTime.Today.AddDays(-5)),
            FechaCaducidad = null,
            Bloqueado = false,
        };
        Assert.True(lote.EstaVigente);
    }

    // ── Stock.DisponibleReal y TieneAlertas ───────────────────────────────
    [Fact]
    public void Stock_DisponibleReal_EsCantidadDisponibleMenosReservada()
    {
        var stock = new Stock { CantidadDisponible = 10m, CantidadReservada = 3m };
        Assert.Equal(7m, stock.DisponibleReal);
    }

    [Fact]
    public void Stock_TieneAlertas_CuandoDisponibleMenorOIgualAMinimo()
    {
        var stock = new Stock { CantidadDisponible = 5m, StockMinimo = 5m };
        Assert.True(stock.TieneAlertas);
    }

    [Fact]
    public void Stock_NoTieneAlertas_CuandoDisponibleSuperaMinimo()
    {
        var stock = new Stock { CantidadDisponible = 10m, StockMinimo = 5m };
        Assert.False(stock.TieneAlertas);
    }

    // ── Excepciones de dominio ────────────────────────────────────────────
    [Fact]
    public void StockInsuficienteException_MensajeContieneProductoId()
    {
        var ex = new StockInsuficienteException(42, 10m, 3m);
        Assert.Contains("42", ex.Message);
    }

    [Fact]
    public void NoHayLotesDisponiblesException_MensajeContieneProductoId()
    {
        var ex = new NoHayLotesDisponiblesException(7);
        Assert.Contains("7", ex.Message);
    }

    [Fact]
    public void DomainException_EsException()
    {
        var ex = new DomainException("Error de dominio test");
        Assert.IsAssignableFrom<Exception>(ex);
        Assert.Equal("Error de dominio test", ex.Message);
    }
}
