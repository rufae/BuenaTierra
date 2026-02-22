using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace BuenaTierra.Tests;

/// <summary>
/// Tests unitarios del motor FIFO de asignación de lotes.
/// No requieren BD: usan Mocks de IUnitOfWork.
/// </summary>
public class LoteAsignacionServiceTests
{
    private static LoteAsignacionService BuildService(IUnitOfWork uow)
        => new(uow, NullLogger<LoteAsignacionService>.Instance);

    private static Lote CreateLote(int id, string codigo, decimal disponible, int productoId = 1, int empresaId = 1)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var lote = new Lote
        {
            Id = id,
            EmpresaId = empresaId,
            ProductoId = productoId,
            CodigoLote = codigo,
            FechaFabricacion = today.AddDays(-id), // más antiguo = id más alto → FIFO
            FechaCaducidad = today.AddDays(90),
            CantidadInicial = disponible,
            Bloqueado = false,
        };
        lote.Stock = new Stock
        {
            EmpresaId = empresaId,
            ProductoId = productoId,
            LoteId = id,
            CantidadDisponible = disponible,
            CantidadReservada = 0,
        };
        return lote;
    }

    // ── Test 1: Asignación exacta con un solo lote ────────────────────────
    [Fact]
    public async Task AsignarLotes_UnLote_ExactoStock_DevuelveUnaAsignacion()
    {
        var lotes = new List<Lote> { CreateLote(1, "L001", 10m) };

        var mockLoteRepo = new Mock<ILoteRepository>();
        mockLoteRepo.Setup(r => r.GetDisponiblesFIFOAsync(1, 1, default))
            .ReturnsAsync(lotes);

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Lotes).Returns(mockLoteRepo.Object);

        var svc = BuildService(mockUow.Object);
        var result = await svc.AsignarLotesAsync(1, 1, 10m);

        Assert.Single(result);
        Assert.Equal("L001", result[0].CodigoLote);
        Assert.Equal(10m, result[0].Cantidad);
    }

    // ── Test 2: Split automático entre múltiples lotes ────────────────────
    [Fact]
    public async Task AsignarLotes_MultiLote_SplitAutomatico_10Cajas()
    {
        // Stock: 3 + 4 + 3 = 10 cajas en tres lotes (caso real del negocio)
        var lotes = new List<Lote>
        {
            CreateLote(1, "LOTE-A", 3m),
            CreateLote(2, "LOTE-B", 4m),
            CreateLote(3, "LOTE-C", 3m),
        };

        var mockLoteRepo = new Mock<ILoteRepository>();
        mockLoteRepo.Setup(r => r.GetDisponiblesFIFOAsync(1, 1, default))
            .ReturnsAsync(lotes);

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Lotes).Returns(mockLoteRepo.Object);

        var svc = BuildService(mockUow.Object);
        var result = await svc.AsignarLotesAsync(1, 1, 10m);

        Assert.Equal(3, result.Count);
        Assert.Equal(3m, result[0].Cantidad);
        Assert.Equal(4m, result[1].Cantidad);
        Assert.Equal(3m, result[2].Cantidad);
        Assert.Equal(10m, result.Sum(r => r.Cantidad));
    }

    // ── Test 3: Stock insuficiente lanza excepción ────────────────────────
    [Fact]
    public async Task AsignarLotes_StockInsuficiente_LanzaStockInsuficienteException()
    {
        var lotes = new List<Lote> { CreateLote(1, "LOTE-X", 5m) };

        var mockLoteRepo = new Mock<ILoteRepository>();
        mockLoteRepo.Setup(r => r.GetDisponiblesFIFOAsync(1, 1, default))
            .ReturnsAsync(lotes);

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Lotes).Returns(mockLoteRepo.Object);

        var svc = BuildService(mockUow.Object);

        await Assert.ThrowsAsync<StockInsuficienteException>(
            () => svc.AsignarLotesAsync(1, 1, 20m));
    }

    // ── Test 4: Sin lotes disponibles lanza NoHayLotesDisponiblesException ─
    [Fact]
    public async Task AsignarLotes_SinLotes_LanzaNoHayLotesDisponiblesException()
    {
        var mockLoteRepo = new Mock<ILoteRepository>();
        mockLoteRepo.Setup(r => r.GetDisponiblesFIFOAsync(1, 1, default))
            .ReturnsAsync(new List<Lote>());

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Lotes).Returns(mockLoteRepo.Object);

        var svc = BuildService(mockUow.Object);

        await Assert.ThrowsAsync<NoHayLotesDisponiblesException>(
            () => svc.AsignarLotesAsync(1, 1, 5m));
    }

    // ── Test 5: Cantidad 0 o negativa lanza DomainException ──────────────
    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task AsignarLotes_CantidadInvalida_LanzaDomainException(decimal cantidad)
    {
        var mockUow = new Mock<IUnitOfWork>();
        var svc = BuildService(mockUow.Object);

        await Assert.ThrowsAsync<DomainException>(
            () => svc.AsignarLotesAsync(1, 1, cantidad));
    }

    // ── Test 6: FIFO - primero producido = primero asignado ──────────────
    [Fact]
    public async Task AsignarLotes_FIFO_AsignaLotesMasAntiguosPrimero()
    {
        // Lote 1 es más antiguo (FechaFabricacion = today - 1), Lote 2 más reciente (today - 2 = hoy-2)
        // En CreateLote, FechaFabricacion = today.AddDays(-id), así lote id=1 → today-1 (más reciente), id=3 → today-3 (más antiguo)
        // En FIFO real, GetDisponiblesFIFOAsync ya devuelve ordenado; testeamos que respetamos el orden dado
        var lotes = new List<Lote>
        {
            CreateLote(3, "LOTE-VIEJO", 2m),  // más antiguo
            CreateLote(1, "LOTE-NUEVO", 10m), // más reciente
        };

        var mockLoteRepo = new Mock<ILoteRepository>();
        mockLoteRepo.Setup(r => r.GetDisponiblesFIFOAsync(1, 1, default))
            .ReturnsAsync(lotes);

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Lotes).Returns(mockLoteRepo.Object);

        var svc = BuildService(mockUow.Object);
        var result = await svc.AsignarLotesAsync(1, 1, 5m);

        // Primer lote asignado debe ser el más antiguo (LOTE-VIEJO, usando primero)
        Assert.Equal("LOTE-VIEJO", result[0].CodigoLote);
        Assert.Equal(2m, result[0].Cantidad);
        Assert.Equal("LOTE-NUEVO", result[1].CodigoLote);
        Assert.Equal(3m, result[1].Cantidad);
    }
}
