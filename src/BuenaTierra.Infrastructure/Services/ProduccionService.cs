using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace BuenaTierra.Infrastructure.Services;

/// <summary>
/// Gestiona el ciclo de vida de producciones y generación automática de lotes.
/// Cuando una producción pasa a estado 'Finalizada', genera automáticamente
/// el lote con código DDMMYYYY-ProductoID-Secuencia y actualiza el stock.
/// </summary>
public class ProduccionService : IProduccionService
{
    private readonly IUnitOfWork _uow;
    private readonly ILogger<ProduccionService> _logger;

    public ProduccionService(IUnitOfWork uow, ILogger<ProduccionService> logger)
    {
        _uow = uow;
        _logger = logger;
    }

    public async Task<ProduccionCreada> CrearProduccionAsync(CrearProduccionRequest request, CancellationToken ct = default)
    {
        var producto = await _uow.Productos.GetByIdAsync(request.ProductoId, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), request.ProductoId);

        var produccion = new Produccion
        {
            EmpresaId = request.EmpresaId,
            ProductoId = request.ProductoId,
            UsuarioId = request.UsuarioId,
            FechaProduccion = request.FechaProduccion,
            CantidadProducida = request.CantidadProducida,
            CantidadMerma = request.CantidadMerma,
            Estado = EstadoProduccion.Planificada,
            Notas = request.Notas,
            CodigoLoteSugerido = request.CodigoLoteSugerido,
        };

        await _uow.Producciones.AddAsync(produccion, ct);
        await _uow.SaveChangesAsync(ct);

        _logger.LogInformation("Producción creada: id={ProduccionId}, producto={ProductoId}, cantidad={Cantidad}",
            produccion.Id, request.ProductoId, request.CantidadProducida);

        return new ProduccionCreada(produccion.Id, null, null);
    }

    public async Task FinalizarProduccionAsync(int produccionId, int empresaId, int usuarioId, CancellationToken ct = default)
    {
        var produccion = await _uow.Producciones.GetByIdAsync(produccionId, ct)
            ?? throw new EntidadNotFoundException(nameof(Produccion), produccionId);

        if (produccion.EmpresaId != empresaId)
            throw new DomainException("Acceso no autorizado");

        if (produccion.Estado == EstadoProduccion.Finalizada)
            throw new EstadoInvalidoException(nameof(Produccion), produccion.Estado.ToString(), "Finalizar");

        if (produccion.Estado == EstadoProduccion.Cancelada)
            throw new EstadoInvalidoException(nameof(Produccion), produccion.Estado.ToString(), "Finalizar");

        await _uow.BeginTransactionAsync(ct);

        try
        {
            // Actualizar estado
            produccion.Estado = EstadoProduccion.Finalizada;
            await _uow.Producciones.UpdateAsync(produccion, ct);

            // Generar código de lote:
            //  - Si el usuario especificó uno al registrar, usarlo.
            //  - Si no, autogenerar como ddMMyyyy[-seq] (formato limpio).
            string codigoLote;
            if (!string.IsNullOrWhiteSpace(produccion.CodigoLoteSugerido))
            {
                // Usar el código personalizado del usuario
                codigoLote = produccion.CodigoLoteSugerido.Trim();
            }
            else
            {
                // Autogenerar: ddMMyyyy. Si ya existe ese código exacto para est producto, añadir secuencia.
                var lotesExistentes = await _uow.Lotes.GetByProductoAsync(empresaId, produccion.ProductoId, ct);
                string baseCode = $"{produccion.FechaProduccion:ddMMyyyy}";
                int seq = lotesExistentes.Count(l => l.CodigoLote == baseCode || l.CodigoLote.StartsWith(baseCode + "-")) + 1;
                codigoLote = seq == 1 ? baseCode : $"{baseCode}-{seq:D3}";
            }

            // Obtener vida útil del producto para calcular caducidad
            var producto = await _uow.Productos.GetByIdAsync(produccion.ProductoId, ct)!;

            DateOnly? fechaCaducidad = producto?.VidaUtilDias.HasValue == true
                ? produccion.FechaProduccion.AddDays(producto.VidaUtilDias!.Value)
                : null;

            decimal cantidadNeta = produccion.CantidadNeta;

            // Crear lote
            var lote = new Lote
            {
                EmpresaId = empresaId,
                ProductoId = produccion.ProductoId,
                ProduccionId = produccionId,
                CodigoLote = codigoLote,
                FechaFabricacion = produccion.FechaProduccion,
                FechaCaducidad = fechaCaducidad,
                CantidadInicial = cantidadNeta
            };

            await _uow.Lotes.AddAsync(lote, ct);
            await _uow.SaveChangesAsync(ct);  // Necesitamos el ID del lote

            // Crear stock para el nuevo lote
            var stock = new Stock
            {
                EmpresaId = empresaId,
                ProductoId = produccion.ProductoId,
                LoteId = lote.Id,
                CantidadDisponible = cantidadNeta,
                CantidadReservada = 0
            };

            await _uow.Stock.AddAsync(stock, ct);

            // Movimiento de stock
            await _uow.MovimientosStock.AddAsync(new MovimientoStock
            {
                EmpresaId = empresaId,
                ProductoId = produccion.ProductoId,
                LoteId = lote.Id,
                Tipo = TipoMovimientoStock.EntradaProduccion,
                Cantidad = cantidadNeta,
                CantidadAntes = 0,
                CantidadDespues = cantidadNeta,
                ReferenciaTipo = "produccion",
                ReferenciaId = produccionId,
                UsuarioId = usuarioId
            }, ct);

            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            _logger.LogInformation("Producción {ProduccionId} finalizada. Lote generado: {CodigoLote} ({Cantidad} und.)",
                produccionId, codigoLote, cantidadNeta);
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    public async Task CancelarProduccionAsync(int produccionId, int empresaId, string motivo, CancellationToken ct = default)
    {
        var produccion = await _uow.Producciones.GetByIdAsync(produccionId, ct)
            ?? throw new EntidadNotFoundException(nameof(Produccion), produccionId);

        if (produccion.EmpresaId != empresaId)
            throw new DomainException("Acceso no autorizado");

        if (produccion.Estado == EstadoProduccion.Finalizada)
            throw new EstadoInvalidoException(nameof(Produccion), produccion.Estado.ToString(), "Cancelar");

        produccion.Estado = EstadoProduccion.Cancelada;
        produccion.Notas = $"CANCELADO: {motivo}. " + produccion.Notas;

        await _uow.Producciones.UpdateAsync(produccion, ct);
        await _uow.SaveChangesAsync(ct);
    }
}

/// <summary>
/// Gestiona la numeración de series de facturación con control de concurrencia.
/// </summary>
public class SerieFacturacionService : ISerieFacturacionService
{
    private readonly IUnitOfWork _uow;

    public SerieFacturacionService(IUnitOfWork uow) => _uow = uow;

    public async Task<string> SiguienteNumeroAsync(int empresaId, int serieId, CancellationToken ct = default)
    {
        var series = await _uow.SeriesFacturacion.FindAsync(
            s => s.Id == serieId && s.EmpresaId == empresaId, ct);

        var serie = series.FirstOrDefault()
            ?? throw new EntidadNotFoundException("SerieFacturacion", serieId);

        serie.UltimoNumero++;
        await _uow.SeriesFacturacion.UpdateAsync(serie, ct);

        // No guardamos aquí — se guarda en la transacción del llamador
        string numero = (serie.Prefijo ?? "") + DateTime.Now.Year + serie.UltimoNumero.ToString("D6");
        return numero;
    }

    public async Task<IEnumerable<SerieDto>> GetSeriesAsync(int empresaId, CancellationToken ct = default)
    {
        var series = await _uow.SeriesFacturacion.FindAsync(s => s.EmpresaId == empresaId && s.Activa, ct);
        return series.Select(s => new SerieDto(s.Id, s.Codigo, s.Descripcion, s.Prefijo, s.UltimoNumero, s.Activa));
    }
}
