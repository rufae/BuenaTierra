using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Enums;
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
        int empresaId, int productoId, decimal cantidad, OrigenStock origen = OrigenStock.Fabrica, CancellationToken ct = default)
    {
        if (cantidad <= 0)
            throw new DomainException($"La cantidad solicitada debe ser mayor que 0. Recibido: {cantidad}");

        _logger.LogInformation("Iniciando asignación FIFO: empresa={EmpresaId}, producto={ProductoId}, cantidad={Cantidad}, origen={Origen}",
            empresaId, productoId, cantidad, origen);

        // Obtener lotes ordenados FIFO con stock disponible en la ubicación de origen
        var lotes = await _uow.Lotes.GetDisponiblesFIFOAsync(empresaId, productoId, origen, ct);
        var lotesLista = lotes.ToList();

        if (!lotesLista.Any())
        {
            if (origen == OrigenStock.Furgoneta)
            {
                var enFabrica = await _uow.Stock.GetTotalDisponibleOrigenAsync(empresaId, productoId, OrigenStock.Fabrica, ct);
                var pista = enFabrica > 0
                    ? $" Hay {enFabrica:0.###} uds en fábrica: muévelas a la furgoneta desde Carga."
                    : "";
                throw new DomainException(
                    $"No hay stock en furgoneta para el producto {productoId}. Carga mercancía a la furgoneta antes de confirmar.{pista}");
            }
            throw new NoHayLotesDisponiblesException(productoId);
        }

        var asignaciones = new List<LoteAsignado>();
        decimal restante = cantidad;

        foreach (var lote in lotesLista)
        {
            if (restante <= 0) break;

            var stockLote = lote.Stock!;
            // Disponible en la ubicación de origen para este lote
            decimal disponibleOrigen = origen == OrigenStock.Furgoneta
                ? stockLote.CantidadFurgoneta
                : Math.Max(0, stockLote.CantidadDisponible - stockLote.CantidadReservada - stockLote.CantidadFurgoneta);

            if (disponibleOrigen <= 0) continue;

            decimal asignar = Math.Min(disponibleOrigen, restante);

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
            _logger.LogWarning("Stock insuficiente ({Origen}) para producto {ProductoId}: solicitado={Solicitado}, disponible={Disponible}",
                origen, productoId, cantidad, disponibleTotal);

            // Error bloqueante: no hay fallback al otro origen
            if (origen == OrigenStock.Furgoneta)
            {
                var enFabrica = await _uow.Stock.GetTotalDisponibleOrigenAsync(empresaId, productoId, OrigenStock.Fabrica, ct);
                var pista = enFabrica > 0
                    ? $" Hay {enFabrica:0.###} uds en fábrica: muévelas a la furgoneta desde Carga."
                    : "";
                throw new DomainException(
                    $"No hay stock suficiente en furgoneta{(productoNombre != null ? $" para '{productoNombre}'" : "")}. " +
                    $"Solicitado: {cantidad}, disponible en furgoneta: {disponibleTotal}. " +
                    $"Carga mercancía a la furgoneta antes de confirmar.{pista}");
            }

            throw new StockInsuficienteException(productoId, cantidad, disponibleTotal, productoNombre);
        }

        _logger.LogInformation("Asignación FIFO completada: {NumLotes} lotes para {Cantidad} unidades (origen {Origen})",
            asignaciones.Count, cantidad, origen);

        return asignaciones;
    }

    public async Task<decimal> GetDisponibleAsync(int empresaId, int productoId, CancellationToken ct = default)
        => await _uow.Stock.GetTotalDisponibleAsync(empresaId, productoId, ct);
}
