using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
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

        // Si ya existe una producción Planificada/EnProceso para el mismo producto + lote + fecha,
        // acumular la cantidad en ese único registro en lugar de crear uno nuevo.
        // Si la existente está Finalizada, se crea un registro nuevo (Planificada) para que el
        // usuario lo confirme y el sistema haga el merge al stock en FinalizarProduccionAsync.
        if (!string.IsNullOrWhiteSpace(request.CodigoLoteSugerido))
        {
            var existente = await _uow.Producciones.GetPendienteMismoLoteAsync(
                request.EmpresaId, request.ProductoId,
                request.CodigoLoteSugerido.Trim(), request.FechaProduccion, ct);

            if (existente != null)
            {
                existente.CantidadProducida += request.CantidadProducida;
                existente.CantidadMerma     += request.CantidadMerma;
                if (!string.IsNullOrWhiteSpace(request.Notas))
                    existente.Notas = string.IsNullOrWhiteSpace(existente.Notas)
                        ? request.Notas
                        : existente.Notas + " | " + request.Notas;

                await _uow.Producciones.UpdateAsync(existente, ct);
                await _uow.SaveChangesAsync(ct);

                _logger.LogInformation(
                    "Producción ACUMULADA en id={ProduccionId}, +{Cantidad} (total={Total})",
                    existente.Id, request.CantidadProducida, existente.CantidadProducida);

                return new ProduccionCreada(existente.Id, null, null);
            }
        }

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
            FechaCaducidadSugerida = request.FechaCaducidadSugerida,
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

            // Prioridad: fecha manual del usuario > calculada por VidaUtilDias del producto
            DateOnly? fechaCaducidad = produccion.FechaCaducidadSugerida
                ?? (producto?.VidaUtilDias.HasValue == true
                    ? produccion.FechaProduccion.AddDays(producto.VidaUtilDias!.Value)
                    : null);

            decimal cantidadNeta = produccion.CantidadNeta;

            // Comprobar si ya existe un lote con ese código para el mismo producto (caso: segunda tanda del día).
            var lotesProducto = await _uow.Lotes.GetByProductoAsync(empresaId, produccion.ProductoId, ct);
            var loteExistente = lotesProducto.FirstOrDefault(l => l.CodigoLote == codigoLote);

            if (loteExistente != null)
            {
                // ── MODO MERGE: sumar al lote ya existente ──────────────────────
                loteExistente.CantidadInicial += cantidadNeta;
                await _uow.Lotes.UpdateAsync(loteExistente, ct);

                var stockExistente = await _uow.Stock.GetByProductoLoteAsync(
                    empresaId, produccion.ProductoId, loteExistente.Id, ct);

                if (stockExistente != null)
                {
                    decimal cantidadAntes = stockExistente.CantidadDisponible;
                    stockExistente.CantidadDisponible += cantidadNeta;
                    await _uow.Stock.UpdateAsync(stockExistente, ct);

                    await _uow.MovimientosStock.AddAsync(new MovimientoStock
                    {
                        EmpresaId = empresaId,
                        ProductoId = produccion.ProductoId,
                        LoteId = loteExistente.Id,
                        Tipo = TipoMovimientoStock.EntradaProduccion,
                        Cantidad = cantidadNeta,
                        CantidadAntes = cantidadAntes,
                        CantidadDespues = cantidadAntes + cantidadNeta,
                        ReferenciaTipo = "produccion",
                        ReferenciaId = produccionId,
                        UsuarioId = usuarioId
                    }, ct);
                }
                else
                {
                    // Stock no existe para el lote (caso raro); crearlo
                    await _uow.Stock.AddAsync(new Stock
                    {
                        EmpresaId = empresaId,
                        ProductoId = produccion.ProductoId,
                        LoteId = loteExistente.Id,
                        CantidadDisponible = cantidadNeta,
                        CantidadReservada = 0
                    }, ct);

                    await _uow.MovimientosStock.AddAsync(new MovimientoStock
                    {
                        EmpresaId = empresaId,
                        ProductoId = produccion.ProductoId,
                        LoteId = loteExistente.Id,
                        Tipo = TipoMovimientoStock.EntradaProduccion,
                        Cantidad = cantidadNeta,
                        CantidadAntes = 0,
                        CantidadDespues = cantidadNeta,
                        ReferenciaTipo = "produccion",
                        ReferenciaId = produccionId,
                        UsuarioId = usuarioId
                    }, ct);
                }

                // ── Fusionar el registro de Produccion en el original Finalizado ──
                var produccionOriginal = await _uow.Producciones.GetFinalizadaMismoLoteAsync(
                    empresaId, produccion.ProductoId, codigoLote, produccionId, ct);

                if (produccionOriginal != null)
                {
                    produccionOriginal.CantidadProducida += produccion.CantidadProducida;
                    produccionOriginal.CantidadMerma     += produccion.CantidadMerma;
                    if (produccionOriginal.Notas is null && produccion.Notas is not null)
                        produccionOriginal.Notas = produccion.Notas;
                    await _uow.Producciones.UpdateAsync(produccionOriginal, ct);
                    await _uow.Producciones.DeleteAsync(produccion, ct);
                    _logger.LogInformation("Producción {ProduccionId} absorbida en {OriginalId} (MERGE). Lote: {CodigoLote} +{Cantidad} und.",
                        produccionId, produccionOriginal.Id, codigoLote, cantidadNeta);
                }
                else
                {
                    _logger.LogInformation("Producción {ProduccionId} finalizada (MERGE). Lote existente: {CodigoLote} +{Cantidad} und.",
                        produccionId, codigoLote, cantidadNeta);
                }
            }
            else
            {
                // ── MODO CREACIÓN: nuevo lote + stock ───────────────────────────
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

                await _uow.Stock.AddAsync(new Stock
                {
                    EmpresaId = empresaId,
                    ProductoId = produccion.ProductoId,
                    LoteId = lote.Id,
                    CantidadDisponible = cantidadNeta,
                    CantidadReservada = 0
                }, ct);

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

                _logger.LogInformation("Producción {ProduccionId} finalizada. Lote nuevo: {CodigoLote} ({Cantidad} und.)",
                    produccionId, codigoLote, cantidadNeta);
            }

            await _uow.SaveChangesAsync(ct);
            
            // ── CONSUMO AUTOMÁTICO DE INGREDIENTES ──────────────────────────────
            // Si el producto tiene receta (ProductoIngredientes), consumir materias primas
            // del stock proporcionalmente a la cantidad producida.
            await ConsumirIngredientesAsync(empresaId, produccion.ProductoId, cantidadNeta, produccionId, usuarioId, ct);

            await _uow.CommitTransactionAsync(ct);
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>
    /// Registra el consumo teórico de ingredientes basado en la receta del producto.
    /// En el modelo actual, los ingredientes son entidades independientes sin stock propio.
    /// Esta función calcula y registra (log) el consumo para futura auditoría/trazabilidad.
    /// TODO: Cuando ingredientes tengan ProductoEquivalenteId (materia prima como producto),
    ///       implementar consumo real de stock por FIFO.
    /// </summary>
    private async Task ConsumirIngredientesAsync(
        int empresaId, int productoId, decimal cantidadProducida,
        int produccionId, int usuarioId, CancellationToken ct)
    {
        var receta = await _uow.ProductoIngredientes.GetQueryable()
            .Where(pi => pi.ProductoId == productoId)
            .Include(pi => pi.Ingrediente)
            .ToListAsync(ct);

        if (!receta.Any()) return;

        _logger.LogInformation(
            "Registro de consumo de ingredientes: producto={ProductoId}, cantidad={Cantidad}, ingredientes={Count}",
            productoId, cantidadProducida, receta.Count);

        foreach (var ingredienteReceta in receta)
        {
            decimal cantidadConsumir = (ingredienteReceta.CantidadGr ?? 0) * cantidadProducida;
            if (cantidadConsumir <= 0) continue;

            _logger.LogInformation(
                "  Consumo teórico: ingrediente={Nombre} (id={IngredienteId}), cantidad={Cantidad}g",
                ingredienteReceta.Ingrediente?.Nombre ?? "?",
                ingredienteReceta.IngredienteId,
                cantidadConsumir);
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
