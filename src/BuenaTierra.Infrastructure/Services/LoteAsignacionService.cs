using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace BuenaTierra.Infrastructure.Services;

/// <summary>
/// Servicio central de asignación de lotes por FIFO.
/// Este es el motor que elimina la escritura manual de lotes.
///
/// Algoritmo:
/// 1. Obtiene lotes disponibles del producto ordenados FIFO
///    (fecha_fabricacion ASC, id ASC) excluyendo caducados y bloqueados
/// 2. Itera asignando cantidades hasta completar la solicitud
/// 3. Si no hay suficiente stock → lanza StockInsuficienteException
/// </summary>
public class LoteAsignacionService : ILoteAsignacionService
{
    private readonly IUnitOfWork _uow;
    private readonly ILogger<LoteAsignacionService> _logger;

    public LoteAsignacionService(IUnitOfWork uow, ILogger<LoteAsignacionService> logger)
    {
        _uow = uow;
        _logger = logger;
    }

    public async Task<List<LoteAsignado>> AsignarLotesAsync(
        int empresaId, int productoId, decimal cantidad, CancellationToken ct = default)
    {
        if (cantidad <= 0)
            throw new DomainException($"La cantidad solicitada debe ser mayor que 0. Recibido: {cantidad}");

        _logger.LogInformation("Iniciando asignación FIFO: empresa={EmpresaId}, producto={ProductoId}, cantidad={Cantidad}",
            empresaId, productoId, cantidad);

        // Obtener lotes ordenados FIFO con stock disponible
        var lotes = await _uow.Lotes.GetDisponiblesFIFOAsync(empresaId, productoId, ct);
        var lotesLista = lotes.ToList();

        if (!lotesLista.Any())
            throw new NoHayLotesDisponiblesException(productoId);

        var asignaciones = new List<LoteAsignado>();
        decimal restante = cantidad;

        foreach (var lote in lotesLista)
        {
            if (restante <= 0) break;

            var stockLote = lote.Stock!;
            decimal disponibleReal = stockLote.CantidadDisponible - stockLote.CantidadReservada;

            if (disponibleReal <= 0) continue;

            decimal asignar = Math.Min(disponibleReal, restante);

            asignaciones.Add(new LoteAsignado(
                LoteId: lote.Id,
                CodigoLote: lote.CodigoLote,
                ProductoId: productoId,
                Cantidad: asignar,
                FechaFabricacion: lote.FechaFabricacion,
                FechaCaducidad: lote.FechaCaducidad
            ));

            restante -= asignar;

            _logger.LogDebug("Asignado lote {CodigoLote}: {Cantidad} unidades (restante: {Restante})",
                lote.CodigoLote, asignar, restante);
        }

        if (restante > 0)
        {
            decimal disponibleTotal = cantidad - restante;
            var productoNombre = lotesLista.FirstOrDefault()?.Producto?.Nombre;
            _logger.LogWarning("Stock insuficiente para producto {ProductoId}: solicitado={Solicitado}, disponible={Disponible}",
                productoId, cantidad, disponibleTotal);
            throw new StockInsuficienteException(productoId, cantidad, disponibleTotal, productoNombre);
        }

        _logger.LogInformation("Asignación FIFO completada: {NumLotes} lotes para {Cantidad} unidades",
            asignaciones.Count, cantidad);

        return asignaciones;
    }

    public async Task<decimal> GetDisponibleAsync(int empresaId, int productoId, CancellationToken ct = default)
        => await _uow.Stock.GetTotalDisponibleAsync(empresaId, productoId, ct);
}
