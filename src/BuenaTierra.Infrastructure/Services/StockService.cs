using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace BuenaTierra.Infrastructure.Services;

public class StockService : IStockService
{
    private readonly IUnitOfWork _uow;
    private readonly ILogger<StockService> _logger;

    public StockService(IUnitOfWork uow, ILogger<StockService> logger)
    {
        _uow = uow;
        _logger = logger;
    }

    public async Task<StockResumen> GetResumenAsync(int empresaId, int productoId, CancellationToken ct = default)
    {
        var producto = await _uow.Productos.GetByIdAsync(productoId, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), productoId);

        decimal total = await _uow.Stock.GetTotalDisponibleAsync(empresaId, productoId, ct);
        var stocks = await _uow.Stock.GetByProductoAsync(empresaId, productoId, ct);

        return new StockResumen(productoId, producto.Nombre, total, stocks.Count());
    }

    public async Task AjustarAsync(int empresaId, int productoId, int loteId, decimal cantidad, string motivo, int usuarioId, CancellationToken ct = default)
    {
        var stock = await _uow.Stock.GetByProductoLoteAsync(empresaId, productoId, loteId, ct)
            ?? throw new EntidadNotFoundException("Stock", $"producto={productoId},lote={loteId}");

        decimal cantidadAntes = stock.CantidadDisponible;
        decimal nuevaCantidad = cantidadAntes + cantidad;

        if (nuevaCantidad < 0)
            throw new DomainException($"El ajuste dejaría el stock en negativo: {nuevaCantidad}");

        stock.CantidadDisponible = nuevaCantidad;
        stock.UpdatedAt = DateTime.UtcNow;
        await _uow.Stock.UpdateAsync(stock, ct);

        var tipoMovimiento = cantidad >= 0 ? TipoMovimientoStock.AjustePositivo : TipoMovimientoStock.AjusteNegativo;

        await _uow.MovimientosStock.AddAsync(new MovimientoStock
        {
            EmpresaId = empresaId,
            ProductoId = productoId,
            LoteId = loteId,
            Tipo = tipoMovimiento,
            Cantidad = Math.Abs(cantidad),
            CantidadAntes = cantidadAntes,
            CantidadDespues = nuevaCantidad,
            ReferenciaTipo = "ajuste_manual",
            UsuarioId = usuarioId,
            Notas = motivo
        }, ct);

        await _uow.SaveChangesAsync(ct);

        _logger.LogInformation("Ajuste de stock: empresa={EmpresaId}, producto={ProductoId}, lote={LoteId}, cantidad={Cantidad}, motivo={Motivo}",
            empresaId, productoId, loteId, cantidad, motivo);
    }

    public async Task<IEnumerable<StockAlerta>> GetAlertasAsync(int empresaId, CancellationToken ct = default)
    {
        var stocksBajos = await _uow.Stock.GetStockBajoMinimoAsync(empresaId, ct);
        return stocksBajos.Select(s => new StockAlerta(
            s.ProductoId,
            s.Producto?.Nombre ?? "Desconocido",
            s.CantidadDisponible,
            s.StockMinimo
        ));
    }
}
