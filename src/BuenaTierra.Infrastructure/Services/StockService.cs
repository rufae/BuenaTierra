using BuenaTierra.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
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
        var desglose = await _uow.Stock.GetDesgloseAsync(empresaId, productoId, ct);

        return new StockResumen(productoId, producto.Nombre, total, stocks.Count(),
            desglose.Vendible, desglose.Caducado, desglose.LotesVendibles);
    }

    public async Task AjustarAsync(int empresaId, int productoId, int loteId, decimal cantidad, string motivo, int usuarioId, CancellationToken ct = default)
    {
        var stock = await _uow.Stock.GetByProductoLoteAsync(empresaId, productoId, loteId, ct)
            ?? throw new EntidadNotFoundException("Stock", $"producto={productoId},lote={loteId}");

        decimal cantidadAntes = stock.CantidadDisponible;
        decimal nuevaCantidad = cantidadAntes + cantidad;

        if (nuevaCantidad < 0)
            throw new DomainException($"El ajuste dejaría el stock en negativo: {nuevaCantidad}");

        // El total no puede bajar por debajo de lo que está cargado en la furgoneta
        // (invariante del CHECK stock_furgoneta_valida). Mejor un error claro que un 500.
        if (stock.CantidadFurgoneta > nuevaCantidad)
            throw new DomainException(
                $"El ajuste dejaría el total ({nuevaCantidad:0.###}) por debajo de lo cargado en furgoneta " +
                $"({stock.CantidadFurgoneta:0.###}). Descarga mercancía de la furgoneta antes de ajustar.");

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

    public async Task<PurgaCaducados> PurgarCaducadosAsync(int? empresaId = null, CancellationToken ct = default)
    {
        // El dia de caducidad AUN se vende/comen; se retira el dia siguiente.
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var query = _uow.Stock.GetQueryable()
            .Include(s => s.Lote)
            .Where(s => s.Lote!.FechaCaducidad != null && s.Lote.FechaCaducidad < hoy
                        && (s.CantidadDisponible > 0 || s.CantidadFurgoneta > 0 || s.CantidadReservada > 0));
        if (empresaId is int id)
        {
            query = query.Where(s => s.EmpresaId == id);
        }
        var vencidos = await query.ToListAsync(ct);

        var detalle = new List<string>();
        decimal unidades = 0m;
        foreach (var stock in vencidos)
        {
            var cantidadAntes = stock.CantidadDisponible;
            var enFurgoneta = stock.CantidadFurgoneta;
            unidades += cantidadAntes;

            stock.CantidadDisponible = 0m;
            stock.CantidadReservada = 0m;
            stock.CantidadFurgoneta = 0m;
            stock.UpdatedAt = DateTime.UtcNow;
            await _uow.Stock.UpdateAsync(stock, ct);

            await _uow.MovimientosStock.AddAsync(new MovimientoStock
            {
                EmpresaId = stock.EmpresaId,
                ProductoId = stock.ProductoId,
                LoteId = stock.LoteId,
                Tipo = TipoMovimientoStock.Caducidad,
                Cantidad = cantidadAntes,
                CantidadAntes = cantidadAntes,
                CantidadDespues = 0m,
                ReferenciaTipo = "caducidad_automatica",
                Notas = $"Lote {stock.Lote!.CodigoLote} caducado el {stock.Lote.FechaCaducidad:yyyy-MM-dd}"
                        + (enFurgoneta > 0 ? $" (incluia {enFurgoneta:0.###} en furgoneta)" : ""),
            }, ct);

            detalle.Add($"{stock.Lote.CodigoLote}: {cantidadAntes:0.###} uds");
        }
        if (vencidos.Count > 0)
        {
            await _uow.SaveChangesAsync(ct);
            _logger.LogInformation(
                "Purga de caducados: {Lotes} lote(s), {Unidades} uds retiradas del stock",
                vencidos.Count, unidades);
        }
        return new PurgaCaducados(vencidos.Count, unidades, detalle);
    }
}
