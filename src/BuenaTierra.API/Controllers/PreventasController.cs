using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PreventasController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly ILoteAsignacionService _loteService;

    public PreventasController(IUnitOfWork uow, ILoteAsignacionService loteService)
    {
        _uow = uow;
        _loteService = loteService;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<PreventaResumenDto>>>> GetAll(
        [FromQuery] DateOnly? desde = null,
        [FromQuery] DateOnly? hasta = null,
        [FromQuery] int? clienteId = null,
        [FromQuery] string? estado = null,
        CancellationToken ct = default)
    {
        var q = _uow.Preventas.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId)
            .Include(p => p.Cliente)
            .Include(p => p.Lineas)
            .AsQueryable();

        if (desde.HasValue) q = q.Where(p => p.FechaPreventa >= desde.Value);
        if (hasta.HasValue) q = q.Where(p => p.FechaPreventa <= hasta.Value);
        if (clienteId.HasValue) q = q.Where(p => p.ClienteId == clienteId.Value);

        if (!string.IsNullOrWhiteSpace(estado) && Enum.TryParse<EstadoPreventa>(estado, true, out var estadoEnum))
            q = q.Where(p => p.Estado == estadoEnum);

        var preventas = await q
            .OrderByDescending(p => p.FechaPreventa)
            .ThenByDescending(p => p.Id)
            .ToListAsync(ct);

        var resultado = preventas.Select(p => new PreventaResumenDto(
            p.Id,
            p.FechaPreventa.ToString("yyyy-MM-dd"),
            p.Estado.ToString(),
            p.ClienteId,
            p.Cliente.NombreCompleto,
            p.Lineas.Count,
            p.Lineas.Sum(l => l.CantidadFinal ?? l.CantidadPrevista),
            p.AlertaConfirmada,
            p.Lineas.Select(l => l.PedidoId).FirstOrDefault(v => v.HasValue)
        ));

        return Ok(ApiResponse<IEnumerable<PreventaResumenDto>>.Ok(resultado));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<PreventaDetalleDto>>> GetById(int id, CancellationToken ct = default)
    {
        var preventa = await GetPreventaConDetalleAsync(id, ct);
        if (preventa == null)
            return NotFound(ApiResponse<PreventaDetalleDto>.Fail("Preventa no encontrada"));

        return Ok(ApiResponse<PreventaDetalleDto>.Ok(MapDetalle(preventa)));
    }

    [HttpPost("crear")]
    public async Task<ActionResult<ApiResponse<PreventaCreadaDto>>> Crear(
        [FromBody] CrearPreventaRequest request,
        CancellationToken ct = default)
    {
        if (request.Lineas == null || request.Lineas.Count == 0)
            return BadRequest(ApiResponse<PreventaCreadaDto>.Fail("Debe indicar al menos una linea"));

        var cliente = await _uow.Clientes.GetQueryable()
            .FirstOrDefaultAsync(c => c.Id == request.ClienteId && c.EmpresaId == EmpresaId, ct);

        if (cliente == null)
            return BadRequest(ApiResponse<PreventaCreadaDto>.Fail("Cliente no valido para la empresa actual"));

        var lineasNormalizadas = NormalizarLineas(request.Lineas);
        var errorDisponibilidad = await ValidarDisponibilidadAsync(lineasNormalizadas, ct);
        if (errorDisponibilidad != null)
            return BadRequest(ApiResponse<PreventaCreadaDto>.Fail(errorDisponibilidad));

        var preventa = new Preventa
        {
            EmpresaId = EmpresaId,
            ClienteId = request.ClienteId,
            RepartidorId = User.IsInRole("Repartidor") ? UsuarioId : null,
            FechaPreventa = request.FechaPreventa,
            Estado = EstadoPreventa.Borrador,
            AlertaConfirmada = false,
            Notas = request.Notas,
        };

        foreach (var lineaReq in lineasNormalizadas)
        {
            preventa.Lineas.Add(new PreventaLinea
            {
                ProductoId = lineaReq.ProductoId,
                FechaObjetivo = lineaReq.FechaObjetivo,
                CantidadPrevista = lineaReq.CantidadPrevista,
                CantidadFinal = lineaReq.CantidadFinal,
                EstadoLinea = lineaReq.EstadoLinea,
                Editable = true,
                Observaciones = lineaReq.Observaciones,
            });
        }

        await _uow.Preventas.AddAsync(preventa, ct);
        await _uow.SaveChangesAsync(ct);

        foreach (var linea in preventa.Lineas)
        {
            await _uow.PreventaHistorial.AddAsync(new PreventaHistorial
            {
                PreventaLineaId = linea.Id,
                Accion = "Creada",
                CantidadAnterior = null,
                CantidadNueva = linea.CantidadFinal ?? linea.CantidadPrevista,
                UsuarioId = UsuarioId,
                Detalle = "{}",
            }, ct);
        }

        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<PreventaCreadaDto>.Ok(
            new PreventaCreadaDto(preventa.Id, preventa.FechaPreventa.ToString("yyyy-MM-dd"), preventa.Estado.ToString()),
            "Preventa creada"));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<PreventaCabeceraActualizadaDto>>> ActualizarCabecera(
        int id,
        [FromBody] ActualizarPreventaRequest request,
        CancellationToken ct = default)
    {
        var preventa = await _uow.Preventas.GetQueryable()
            .FirstOrDefaultAsync(p => p.Id == id && p.EmpresaId == EmpresaId, ct);

        if (preventa == null)
            return NotFound(ApiResponse<PreventaCabeceraActualizadaDto>.Fail("Preventa no encontrada"));

        if (preventa.Estado == EstadoPreventa.Convertida)
            return BadRequest(ApiResponse<PreventaCabeceraActualizadaDto>.Fail("No se puede editar una preventa convertida"));

        if (request.ClienteId.HasValue && request.ClienteId.Value != preventa.ClienteId)
        {
            var clienteValido = await _uow.Clientes.GetQueryable()
                .AnyAsync(c => c.Id == request.ClienteId.Value && c.EmpresaId == EmpresaId, ct);
            if (!clienteValido)
                return BadRequest(ApiResponse<PreventaCabeceraActualizadaDto>.Fail("Cliente no valido"));
            preventa.ClienteId = request.ClienteId.Value;
        }

        if (request.FechaPreventa.HasValue)
            preventa.FechaPreventa = request.FechaPreventa.Value;

        if (request.Notas != null)
            preventa.Notas = request.Notas;

        if (!string.IsNullOrWhiteSpace(request.Estado))
        {
            if (!Enum.TryParse<EstadoPreventa>(request.Estado, true, out var nuevoEstado))
                return BadRequest(ApiResponse<PreventaCabeceraActualizadaDto>.Fail("Estado de preventa no valido"));
            preventa.Estado = nuevoEstado;
        }

        preventa.Version += 1;
        preventa.AlertaConfirmada = false;

        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<PreventaCabeceraActualizadaDto>.Ok(
            new PreventaCabeceraActualizadaDto(preventa.Id, preventa.Version, preventa.Estado.ToString(), preventa.AlertaConfirmada),
            "Preventa actualizada"));
    }

    [HttpPut("{id:int}/lineas")]
    public async Task<ActionResult<ApiResponse<PreventaLineasActualizadasDto>>> ReemplazarLineas(
        int id,
        [FromBody] ReemplazarPreventaLineasRequest request,
        CancellationToken ct = default)
    {
        var preventa = await _uow.Preventas.GetQueryable()
            .Include(p => p.Lineas)
            .FirstOrDefaultAsync(p => p.Id == id && p.EmpresaId == EmpresaId, ct);

        if (preventa == null)
            return NotFound(ApiResponse<PreventaLineasActualizadasDto>.Fail("Preventa no encontrada"));

        if (preventa.Estado == EstadoPreventa.Convertida || preventa.Estado == EstadoPreventa.Cancelada)
            return BadRequest(ApiResponse<PreventaLineasActualizadasDto>.Fail("No se puede editar una preventa convertida o cancelada"));

        var normalizadas = NormalizarLineas(request.Lineas ?? []);
        var claves = new HashSet<string>();
        foreach (var l in normalizadas)
        {
            var key = $"{l.ProductoId}|{l.FechaObjetivo:yyyyMMdd}";
            if (!claves.Add(key))
                return BadRequest(ApiResponse<PreventaLineasActualizadasDto>.Fail("No se permiten lineas duplicadas por producto y fecha objetivo"));
        }

        var errorDisponibilidad = await ValidarDisponibilidadAsync(normalizadas, ct);
        if (errorDisponibilidad != null)
            return BadRequest(ApiResponse<PreventaLineasActualizadasDto>.Fail(errorDisponibilidad));

        // Estrategia robusta: reemplazo completo de líneas editables.
        // Evita colisiones de UNIQUE(preventa_id, producto_id, fecha_objetivo)
        // cuando una línea pasa de no existir (0 visual) a existir (>0).
        var historialPendiente = new List<(PreventaLinea linea, string accion, decimal? anterior, decimal? nueva, string detalle)>();

        foreach (var existente in preventa.Lineas.ToList())
        {
            if (!existente.Editable)
                return BadRequest(ApiResponse<PreventaLineasActualizadasDto>.Fail("Una linea no editable no puede modificarse"));

            await _uow.PreventaLineas.DeleteAsync(existente, ct);
        }

        try
        {
            await _uow.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return BadRequest(ApiResponse<PreventaLineasActualizadasDto>.Fail(
                "No se pudieron limpiar las lineas actuales de preventa. Intenta de nuevo."));
        }

        foreach (var lineaReq in normalizadas)
        {
            var nuevaLinea = new PreventaLinea
            {
                PreventaId = preventa.Id,
                ProductoId = lineaReq.ProductoId,
                FechaObjetivo = lineaReq.FechaObjetivo,
                CantidadPrevista = lineaReq.CantidadPrevista,
                CantidadFinal = lineaReq.CantidadFinal,
                EstadoLinea = lineaReq.EstadoLinea,
                Editable = true,
                Observaciones = lineaReq.Observaciones,
            };
            await _uow.PreventaLineas.AddAsync(nuevaLinea, ct);
            historialPendiente.Add((nuevaLinea, "LineaCreada", null, nuevaLinea.CantidadFinal ?? nuevaLinea.CantidadPrevista, "{}"));
        }

        preventa.Version += 1;
        preventa.Estado = EstadoPreventa.Borrador;
        preventa.AlertaConfirmada = false;

        try
        {
            await _uow.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return BadRequest(ApiResponse<PreventaLineasActualizadasDto>.Fail(
                "No se pudieron guardar las lineas de preventa. Revisa si hay productos/fechas repetidos y vuelve a intentar."));
        }
        catch
        {
            return StatusCode(500, ApiResponse<PreventaLineasActualizadasDto>.Fail(
                "Error interno guardando lineas de preventa"));
        }

        try
        {
            foreach (var item in historialPendiente)
            {
                await _uow.PreventaHistorial.AddAsync(new PreventaHistorial
                {
                    PreventaLineaId = item.linea.Id,
                    Accion = item.accion,
                    CantidadAnterior = item.anterior,
                    CantidadNueva = item.nueva,
                    UsuarioId = UsuarioId,
                    Detalle = item.detalle,
                }, ct);
            }

            await _uow.SaveChangesAsync(ct);
        }
        catch
        {
            // El historial no debe impedir la operación principal: las líneas ya quedaron persistidas.
        }

        var totalLineas = await _uow.PreventaLineas.CountAsync(l => l.PreventaId == preventa.Id, ct);
        return Ok(ApiResponse<PreventaLineasActualizadasDto>.Ok(
            new PreventaLineasActualizadasDto(preventa.Id, preventa.Version, totalLineas),
            "Lineas de preventa actualizadas"));
    }

    [HttpPost("{id:int}/validar-conversion")]
    public async Task<ActionResult<ApiResponse<ValidacionConversionDto>>> ValidarConversion(int id, CancellationToken ct = default)
    {
        var preventa = await GetPreventaConDetalleAsync(id, ct);
        if (preventa == null)
            return NotFound(ApiResponse<ValidacionConversionDto>.Fail("Preventa no encontrada"));

        if (preventa.Estado == EstadoPreventa.Cancelada)
            return BadRequest(ApiResponse<ValidacionConversionDto>.Fail("No se puede convertir una preventa cancelada"));

        var advertencias = new List<string>();
        decimal totalCantidad = 0;
        int lineasConvertibles = 0;

        foreach (var linea in preventa.Lineas.Where(l => l.EstadoLinea != EstadoPreventaLinea.Cancelada))
        {
            var cantidad = linea.CantidadFinal ?? linea.CantidadPrevista;
            if (cantidad <= 0) continue;

            lineasConvertibles++;
            totalCantidad += cantidad;

            var disponible = await _uow.Stock.GetTotalDisponibleAsync(EmpresaId, linea.ProductoId, ct);
            if (disponible < cantidad)
            {
                advertencias.Add(
                    $"Stock insuficiente para {linea.Producto.Nombre}: previsto {cantidad:0.###}, disponible {disponible:0.###}.");
            }
        }

        if (lineasConvertibles == 0)
            advertencias.Add("La preventa no tiene lineas convertibles con cantidad mayor a cero.");

        var validacion = new ValidacionConversionDto(
            EsValida: advertencias.Count == 0,
            RequiereConfirmacion: true,
            Advertencias: advertencias,
            LineasConvertibles: lineasConvertibles,
            CantidadTotal: totalCantidad
        );

        return Ok(ApiResponse<ValidacionConversionDto>.Ok(validacion));
    }

    [HttpPost("{id:int}/convertir")]
    public async Task<ActionResult<ApiResponse<PreventaConvertidaDto>>> ConvertirAPedido(
        int id,
        [FromBody] ConvertirPreventaRequest request,
        CancellationToken ct = default)
    {
        if (!request.AlertaConfirmada)
            return BadRequest(ApiResponse<PreventaConvertidaDto>.Fail("Debe confirmar la revision de preventa antes de convertir"));

        var preventa = await GetPreventaConDetalleAsync(id, ct);
        if (preventa == null)
            return NotFound(ApiResponse<PreventaConvertidaDto>.Fail("Preventa no encontrada"));

        if (preventa.Estado == EstadoPreventa.Cancelada)
            return BadRequest(ApiResponse<PreventaConvertidaDto>.Fail("No se puede convertir una preventa cancelada"));

        if (preventa.Estado == EstadoPreventa.Convertida)
        {
            var pedidoExistente = preventa.Lineas.Select(l => l.PedidoId).FirstOrDefault(p => p.HasValue);
            if (pedidoExistente.HasValue)
            {
                return Ok(ApiResponse<PreventaConvertidaDto>.Ok(
                    new PreventaConvertidaDto(preventa.Id, pedidoExistente.Value, preventa.Estado.ToString(), true),
                    "Preventa ya convertida"));
            }
        }

        var cliente = await _uow.Clientes.GetByIdAsync(preventa.ClienteId, ct);
        if (cliente == null || cliente.EmpresaId != EmpresaId)
            return BadRequest(ApiResponse<PreventaConvertidaDto>.Fail("Cliente invalido para conversion"));

        var tablaRE = (await _uow.TiposIvaRe.FindAsync(t => t.EmpresaId == EmpresaId && t.Activo, ct))
            .ToDictionary(t => t.IvaPorcentaje, t => t.RecargoEquivalenciaPorcentaje);

        var lineasConvertibles = preventa.Lineas
            .Where(l => l.EstadoLinea != EstadoPreventaLinea.Cancelada)
            .Select(l => new { Linea = l, Cantidad = l.CantidadFinal ?? l.CantidadPrevista })
            .Where(x => x.Cantidad > 0)
            .ToList();

        if (lineasConvertibles.Count == 0)
            return BadRequest(ApiResponse<PreventaConvertidaDto>.Fail("No hay lineas convertibles con cantidad mayor a cero"));

        var pedido = new Pedido
        {
            EmpresaId = EmpresaId,
            ClienteId = cliente.Id,
            UsuarioId = UsuarioId,
            NumeroPedido = $"PREV-{DateTime.UtcNow:yyyyMMddHHmmss}",
            FechaPedido = DateOnly.FromDateTime(DateTime.Today),
            FechaEntrega = preventa.FechaPreventa,
            Estado = EstadoPedido.Confirmado,
            Notas = $"Generado desde preventa #{preventa.Id}" + (string.IsNullOrWhiteSpace(preventa.Notas) ? string.Empty : $". {preventa.Notas}"),
        };

        decimal subtotal = 0;
        decimal descuentoTotal = 0;
        decimal ivaTotal = 0;
        decimal recargoTotal = 0;
        short orden = 0;

        bool aplicaRE = cliente.TipoImpuesto == TipoImpuesto.RecargoEquivalencia || cliente.RecargoEquivalencia;

        foreach (var item in lineasConvertibles)
        {
            var l = item.Linea;
            var cantidad = item.Cantidad;
            var precio = l.Producto.PrecioVenta;
            var descuento = Math.Max(0, cliente.DescuentoGeneral);
            var ivaPorc = GetIvaPorcentaje(cliente, l.Producto);
            var rePorc = aplicaRE ? GetRecargoEquivalenciaPorcentaje(ivaPorc, tablaRE) : 0;

            decimal linBruto = Math.Round(cantidad * precio, 2, MidpointRounding.AwayFromZero);
            decimal linSubtotal = Math.Round(cantidad * precio * (1 - descuento / 100), 2, MidpointRounding.AwayFromZero);
            decimal linIva = Math.Round(linSubtotal * ivaPorc / 100, 2, MidpointRounding.AwayFromZero);
            decimal linRe = Math.Round(linSubtotal * rePorc / 100, 2, MidpointRounding.AwayFromZero);

            pedido.Lineas.Add(new PedidoLinea
            {
                ProductoId = l.ProductoId,
                Descripcion = l.Producto.Nombre,
                Cantidad = cantidad,
                PrecioUnitario = precio,
                Descuento = descuento,
                IvaPorcentaje = ivaPorc,
                RecargoEquivalenciaPorcentaje = rePorc,
                Orden = orden++
            });

            subtotal += linSubtotal;
            descuentoTotal += linBruto - linSubtotal;
            ivaTotal += linIva;
            recargoTotal += linRe;
        }

        decimal retencionPorc = !cliente.NoAplicarRetenciones && cliente.PorcentajeRetencion > 0
            ? cliente.PorcentajeRetencion : 0;
        decimal retencionTotal = Math.Round(subtotal * retencionPorc / 100, 2, MidpointRounding.AwayFromZero);

        pedido.Subtotal = subtotal;
        pedido.DescuentoTotal = descuentoTotal;
        pedido.IvaTotal = ivaTotal;
        pedido.RecargoEquivalenciaTotal = recargoTotal;
        pedido.RetencionTotal = retencionTotal;
        pedido.Total = subtotal + ivaTotal + recargoTotal - retencionTotal;

        await _uow.Pedidos.AddAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);

        preventa.Estado = EstadoPreventa.Convertida;
        preventa.AlertaConfirmada = true;
        preventa.Version += 1;

        foreach (var item in lineasConvertibles)
        {
            var l = item.Linea;
            l.PedidoId = pedido.Id;
            l.Editable = false;
            l.EstadoLinea = EstadoPreventaLinea.Convertida;
            l.CantidadFinal ??= item.Cantidad;

            await _uow.PreventaHistorial.AddAsync(new PreventaHistorial
            {
                PreventaLineaId = l.Id,
                Accion = "ConvertidaAPedido",
                CantidadAnterior = item.Cantidad,
                CantidadNueva = item.Cantidad,
                UsuarioId = UsuarioId,
                Detalle = JsonSerializer.Serialize(new { pedidoId = pedido.Id })
            }, ct);
        }

        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<PreventaConvertidaDto>.Ok(
            new PreventaConvertidaDto(preventa.Id, pedido.Id, preventa.Estado.ToString(), false),
            "Preventa convertida a pedido"));
    }

    [HttpPost("{id:int}/cancelar")]
    public async Task<ActionResult<ApiResponse<string>>> Cancelar(int id, CancellationToken ct = default)
    {
        var preventa = await _uow.Preventas.GetQueryable()
            .FirstOrDefaultAsync(p => p.Id == id && p.EmpresaId == EmpresaId, ct);

        if (preventa == null)
            return NotFound(ApiResponse<string>.Fail("Preventa no encontrada"));

        if (preventa.Estado == EstadoPreventa.Convertida)
            return BadRequest(ApiResponse<string>.Fail("No se puede cancelar una preventa ya convertida"));

        preventa.Estado = EstadoPreventa.Cancelada;
        preventa.Version += 1;
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("OK", "Preventa cancelada"));
    }

    private async Task<Preventa?> GetPreventaConDetalleAsync(int id, CancellationToken ct)
    {
        return await _uow.Preventas.GetQueryable()
            .Where(p => p.Id == id && p.EmpresaId == EmpresaId)
            .Include(p => p.Cliente)
            .Include(p => p.Lineas)
                .ThenInclude(l => l.Producto)
            .FirstOrDefaultAsync(ct);
    }

    private static PreventaDetalleDto MapDetalle(Preventa p)
    {
        var lineas = p.Lineas
            .OrderBy(l => l.FechaObjetivo)
            .ThenBy(l => l.Producto.Nombre)
            .Select(l => new PreventaLineaDto(
                l.Id,
                l.ProductoId,
                l.Producto.Nombre,
                l.FechaObjetivo.ToString("yyyy-MM-dd"),
                l.CantidadPrevista,
                l.CantidadFinal,
                l.EstadoLinea.ToString(),
                l.Editable,
                l.PedidoId,
                l.MotivoBloqueo,
                l.Observaciones
            ))
            .ToList();

        return new PreventaDetalleDto(
            p.Id,
            p.ClienteId,
            p.Cliente.NombreCompleto,
            p.FechaPreventa.ToString("yyyy-MM-dd"),
            p.Estado.ToString(),
            p.Version,
            p.AlertaConfirmada,
            p.Notas,
            lineas
        );
    }

    private static List<LineaEntradaNormalizada> NormalizarLineas(IEnumerable<LineaEntradaRequest> lineas)
    {
        return lineas
            .Where(l => l.ProductoId > 0)
            .Where(l => l.CantidadPrevista >= 0)
            .GroupBy(l => new { l.Id, l.ProductoId, l.FechaObjetivo })
            .Select(g => new LineaEntradaNormalizada(
                g.Key.Id,
                g.Key.ProductoId,
                g.Key.FechaObjetivo,
                g.Sum(x => x.CantidadPrevista),
                g.Any(x => x.CantidadFinal.HasValue) ? g.Sum(x => x.CantidadFinal ?? 0) : null,
                ParseEstadoLinea(g.Last().EstadoLinea),
                g.Last().Observaciones
            ))
            .ToList();
    }

    private static EstadoPreventaLinea ParseEstadoLinea(string? estado)
    {
        if (string.IsNullOrWhiteSpace(estado))
            return EstadoPreventaLinea.Previsto;

        return Enum.TryParse<EstadoPreventaLinea>(estado, true, out var estadoLinea)
            ? estadoLinea
            : EstadoPreventaLinea.Previsto;
    }

    private static decimal GetIvaPorcentaje(Cliente cliente, Producto producto)
        => cliente.TipoImpuesto switch
        {
            TipoImpuesto.Exento => 0m,
            TipoImpuesto.IGIC => 7m,
            _ => cliente.AplicarImpuesto ? producto.IvaPorcentaje : 0m
        };

    private static decimal GetRecargoEquivalenciaPorcentaje(decimal ivaPorcentaje, Dictionary<decimal, decimal> tablaRE)
    {
        if (tablaRE.TryGetValue(ivaPorcentaje, out var reDesdeDB))
            return reDesdeDB;

        return ivaPorcentaje switch { 21m => 5.2m, 10m => 1.4m, 4m => 0.5m, _ => 0m };
    }

    private async Task<string?> ValidarDisponibilidadAsync(IEnumerable<LineaEntradaNormalizada> lineas, CancellationToken ct)
    {
        var cantidadesPorProducto = lineas
            .GroupBy(l => l.ProductoId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.CantidadPrevista));

        if (cantidadesPorProducto.Count == 0)
            return null;

        var productos = await _uow.Productos.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId && cantidadesPorProducto.Keys.Contains(p.Id))
            .Select(p => new { p.Id, p.Nombre })
            .ToDictionaryAsync(p => p.Id, p => p.Nombre, ct);

        foreach (var (productoId, cantidadSolicitada) in cantidadesPorProducto)
        {
            if (!productos.TryGetValue(productoId, out var nombreProducto))
                return $"Producto no valido para la empresa actual: {productoId}";

            var disponible = await _loteService.GetDisponibleAsync(EmpresaId, productoId, ct);
            if (cantidadSolicitada > disponible)
                return $"Stock insuficiente para {nombreProducto}. Disponible: {disponible:0.###}. Preventa solicitada: {cantidadSolicitada:0.###}.";
        }

        return null;
    }
}

public record PreventaResumenDto(
    int Id,
    string FechaPreventa,
    string Estado,
    int ClienteId,
    string ClienteNombre,
    int TotalLineas,
    decimal TotalCantidad,
    bool AlertaConfirmada,
    int? PedidoId
);

public record PreventaLineaDto(
    int Id,
    int ProductoId,
    string ProductoNombre,
    string FechaObjetivo,
    decimal CantidadPrevista,
    decimal? CantidadFinal,
    string EstadoLinea,
    bool Editable,
    int? PedidoId,
    string? MotivoBloqueo,
    string? Observaciones
);

public record PreventaDetalleDto(
    int Id,
    int ClienteId,
    string ClienteNombre,
    string FechaPreventa,
    string Estado,
    int Version,
    bool AlertaConfirmada,
    string? Notas,
    List<PreventaLineaDto> Lineas
);

public record CrearPreventaRequest(
    int ClienteId,
    DateOnly FechaPreventa,
    string? Notas,
    List<LineaEntradaRequest> Lineas
);

public record ActualizarPreventaRequest(
    int? ClienteId,
    DateOnly? FechaPreventa,
    string? Estado,
    string? Notas
);

public record ReemplazarPreventaLineasRequest(List<LineaEntradaRequest> Lineas);

public record LineaEntradaRequest(
    int? Id,
    int ProductoId,
    DateOnly FechaObjetivo,
    decimal CantidadPrevista,
    decimal? CantidadFinal,
    string? EstadoLinea,
    string? Observaciones
);

public record ConvertirPreventaRequest(bool AlertaConfirmada);

public record PreventaCreadaDto(int Id, string FechaPreventa, string Estado);
public record PreventaCabeceraActualizadaDto(int Id, int Version, string Estado, bool AlertaConfirmada);
public record PreventaLineasActualizadasDto(int Id, int Version, int TotalLineas);
public record PreventaConvertidaDto(int PreventaId, int PedidoId, string Estado, bool YaConvertida);

public record ValidacionConversionDto(
    bool EsValida,
    bool RequiereConfirmacion,
    List<string> Advertencias,
    int LineasConvertibles,
    decimal CantidadTotal
);

internal record LineaEntradaNormalizada(
    int? Id,
    int ProductoId,
    DateOnly FechaObjetivo,
    decimal CantidadPrevista,
    decimal? CantidadFinal,
    EstadoPreventaLinea EstadoLinea,
    string? Observaciones
);
