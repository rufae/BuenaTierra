using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace BuenaTierra.Tests;

/// <summary>
/// Tests unitarios de aislamiento multiempresa.
/// Verifican que los métodos clave de la capa de infraestructura
/// usan empresaId como filtro discriminante y no devuelven datos ajenos.
/// No requieren BD: usan Mocks de IUnitOfWork.
/// </summary>
public class MultiempresaIsolationTests
{
    private const int EmpresaPropia = 1;
    private const int EmpresaAjena  = 2;

    // ═══════════════════════════════════════════════════════
    // LoteAsignacionService — FIFO aislado por empresa
    // ═══════════════════════════════════════════════════════

    [Fact]
    public async Task FIFO_NoDevuelveLotesDeEmpresaAjena()
    {
        // Arrange: repositorio devuelve vacío cuando se pide lotes de empresa propia
        // (simula que empresa 1 no tiene stock — empresa 2 sí tendría, pero no debe devolverse)
        var mockLotes = new Mock<ILoteRepository>();
        mockLotes
            .Setup(r => r.GetDisponiblesFIFOAsync(EmpresaPropia, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Lotes).Returns(mockLotes.Object);

        var mockStock = new Mock<IStockRepository>();
        mockUow.Setup(u => u.Stock).Returns(mockStock.Object);

        var service = new LoteAsignacionService(mockUow.Object, NullLogger<LoteAsignacionService>.Instance);

        // Act: pedir asignación para empresa propia — espera excepción (sin stock propio)
        await Assert.ThrowsAsync<NoHayLotesDisponiblesException>(
            () => service.AsignarLotesAsync(EmpresaPropia, 10, 5m));

        // Assert: se llamó al repositorio con empresa propia, NUNCA con empresa ajena
        mockLotes.Verify(
            r => r.GetDisponiblesFIFOAsync(EmpresaPropia, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
        mockLotes.Verify(
            r => r.GetDisponiblesFIFOAsync(EmpresaAjena, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "FIFO no debe consultar stock de otra empresa");
    }

    [Fact]
    public async Task FIFO_StockDisponible_NoConsultaEmpresaAjena()
    {
        var mockStock = new Mock<IStockRepository>();
        mockStock
            .Setup(r => r.GetTotalDisponibleAsync(EmpresaPropia, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(10m);

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Stock).Returns(mockStock.Object);

        var mockLotes = new Mock<ILoteRepository>();
        mockUow.Setup(u => u.Lotes).Returns(mockLotes.Object);

        var service = new LoteAsignacionService(mockUow.Object, NullLogger<LoteAsignacionService>.Instance);

        var disponible = await service.GetDisponibleAsync(EmpresaPropia, 10);

        mockStock.Verify(
            r => r.GetTotalDisponibleAsync(EmpresaPropia, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
        mockStock.Verify(
            r => r.GetTotalDisponibleAsync(EmpresaAjena, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "El stock disponible no debe consultar otra empresa");

        Assert.Equal(10m, disponible);
    }

    // ═══════════════════════════════════════════════════════
    // Repositorio de Lotes — FIFO con datos de dos empresas
    // ═══════════════════════════════════════════════════════

    [Fact]
    public async Task FIFO_ConLotesDosEmpresas_SoloDevuelveLotesDeEmpresaPropia()
    {
        // Simula que el repositorio devuelve correctamente solo los lotes de empresa 1
        var lotesEmpresa1 = new List<Lote>
        {
            CrearLote(1, EmpresaPropia, "L001", 5m),
            CrearLote(2, EmpresaPropia, "L002", 5m),
        };

        var mockLotes = new Mock<ILoteRepository>();
        mockLotes
            .Setup(r => r.GetDisponiblesFIFOAsync(EmpresaPropia, 10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(lotesEmpresa1);

        var mockUow = new Mock<IUnitOfWork>();
        mockUow.Setup(u => u.Lotes).Returns(mockLotes.Object);
        mockUow.Setup(u => u.Stock).Returns(new Mock<IStockRepository>().Object);

        var service = new LoteAsignacionService(mockUow.Object, NullLogger<LoteAsignacionService>.Instance);

        var asignaciones = await service.AsignarLotesAsync(EmpresaPropia, 10, 10m);

        // Todas las asignaciones deben ser de la empresa propia
        foreach (var a in asignaciones)
            Assert.True(a.LoteId == 1 || a.LoteId == 2, "solo deben asignarse lotes de empresa 1");

        Assert.Equal(2, asignaciones.Count());
    }

    // ═══════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════

    private static Lote CrearLote(int id, int empresaId, string codigo, decimal disponible)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var lote = new Lote
        {
            Id               = id,
            EmpresaId        = empresaId,
            ProductoId       = 10,
            CodigoLote       = codigo,
            FechaFabricacion = today.AddDays(-id),
            FechaCaducidad   = today.AddDays(90),
            CantidadInicial  = disponible,
            Bloqueado        = false,
        };
        lote.Stock = new Stock
        {
            EmpresaId          = empresaId,
            ProductoId         = 10,
            LoteId             = id,
            CantidadDisponible = disponible,
            CantidadReservada  = 0,
        };
        return lote;
    }
}
