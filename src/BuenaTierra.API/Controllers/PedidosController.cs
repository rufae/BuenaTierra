using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PedidosController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly ILoteAsignacionService _loteService;
    private readonly ISerieFacturacionService _serieService;
    private readonly IFacturaService _facturaService;

    public PedidosController(
        IUnitOfWork uow,
        ILoteAsignacionService loteService,
        ISerieFacturacionService serieService,
        IFacturaService facturaService)
    {
        _uow = uow;
        _loteService = loteService;
        _serieService = serieService;
        _facturaService = facturaService;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>GET /api/pedidos — Listar pedidos de la empresa</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<PedidoResumen>>>> GetAll(CancellationToken ct)
    {
        var pedidos = await _uow.Pedidos.GetByEmpresaAsync(EmpresaId, ct);
        var resultado = pedidos.Select(p => new PedidoResumen(
            p.Id, p.NumeroPedido ?? $"PED-{p.Id}",
            p.FechaPedido.ToString("yyyy-MM-dd"),
            p.FechaEntrega?.ToString("yyyy-MM-dd"),
            p.Estado.ToString(),
            p.Cliente?.NombreCompleto ?? "",
            p.Total,
            p.Cliente?.NoRealizarFacturas ?? false
        ));
        return Ok(ApiResponse<IEnumerable<PedidoResumen>>.Ok(resultado));
    }

    /// <summary>GET /api/pedidos/{id} — Detalle de pedido con líneas</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<PedidoDetalle>>> Get(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<PedidoDetalle>.Fail("Pedido no encontrado"));

        return Ok(ApiResponse<PedidoDetalle>.Ok(MapToDetalle(pedido)));
    }

    /// <summary>POST /api/pedidos/crear — Crear nuevo pedido con lógica fiscal completa</summary>
    [HttpPost("crear")]
    public async Task<ActionResult<ApiResponse<PedidoCreado>>> Crear(
        [FromBody] CrearPedidoRequest request, CancellationToken ct)
    {
        // Cargar cliente con condiciones especiales
        var cliente = await _uow.Clientes.GetQueryable()
            .Include(c => c.CondicionesEspeciales)
            .FirstOrDefaultAsync(c => c.Id == request.ClienteId && c.EmpresaId == EmpresaId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), request.ClienteId);

        var pedido = new Pedido
        {
            EmpresaId = EmpresaId,
            ClienteId = request.ClienteId,
            UsuarioId = UsuarioId,
            NumeroPedido = $"PED-{DateTime.UtcNow:yyyyMMddHHmmss}",
            FechaPedido = request.FechaPedido,
            FechaEntrega = request.FechaEntrega,
            Estado = EstadoPedido.Pendiente,
            Notas = request.Notas
        };

        short orden = 0;
        decimal subtotal = 0m;
        decimal ivaTotal = 0m;
        decimal recargoTotal = 0m;

        foreach (var item in request.Items)
        {
            var producto = await _uow.Productos.GetByIdAsync(item.ProductoId, ct)
                ?? throw new EntidadNotFoundException(nameof(Producto), item.ProductoId);

            // ── Validación de stock ───────────────────────────────────────────
            var stockDisponible = await _uow.Stock.GetTotalDisponibleAsync(EmpresaId, item.ProductoId, ct);
            if (stockDisponible < item.Cantidad)
                return BadRequest(ApiResponse<PedidoCreado>.Fail(
                    $"Stock insuficiente para '{producto.Nombre}': disponible {stockDisponible:0.##}, solicitado {item.Cantidad:0.##}"));

            // ── Precio: condición especial > precio manual > precio producto ──
            var condicion = cliente.CondicionesEspeciales.FirstOrDefault(c =>
                c.ArticuloFamilia == TipoArticuloFamilia.Articulo &&
                !string.IsNullOrEmpty(c.Codigo) &&
                c.Codigo == (producto.Codigo ?? producto.Referencia ?? ""));

            decimal precio = item.PrecioUnitario
                ?? (condicion?.Tipo is TipoCondicionEspecial.Precio or TipoCondicionEspecial.PrecioEspecial
                    ? condicion.Precio
                    : producto.PrecioVenta);

            // ── Descuento: condición especial > línea > descuento general ─────
            decimal descuento = item.Descuento > 0 ? item.Descuento
                : condicion?.Tipo == TipoCondicionEspecial.Descuento ? condicion.Descuento
                : cliente.DescuentoGeneral;

            // ── IVA % según TipoImpuesto del cliente ──────────────────────────
            decimal ivaPorc = cliente.TipoImpuesto switch
            {
                TipoImpuesto.Exento => 0m,
                TipoImpuesto.IGIC   => 7m,
                _ => cliente.AplicarImpuesto ? producto.IvaPorcentaje : 0m
            };

            // ── Recargo de equivalencia ───────────────────────────────────────
            bool aplicaRE = cliente.TipoImpuesto == TipoImpuesto.RecargoEquivalencia
                         || cliente.RecargoEquivalencia;
            decimal rePorc = aplicaRE ? GetRecargoEquivalenciaPorcentaje(producto.IvaPorcentaje) : 0m;

            decimal linSubtotal = Math.Round(item.Cantidad * precio * (1 - descuento / 100), 2, MidpointRounding.AwayFromZero);
            decimal linIva      = Math.Round(linSubtotal * ivaPorc / 100, 2, MidpointRounding.AwayFromZero);
            decimal linRe       = Math.Round(linSubtotal * rePorc / 100, 2, MidpointRounding.AwayFromZero);

            pedido.Lineas.Add(new PedidoLinea
            {
                ProductoId = item.ProductoId,
                Descripcion = producto.Nombre,
                Cantidad = item.Cantidad,
                PrecioUnitario = precio,
                Descuento = descuento,
                IvaPorcentaje = ivaPorc,
                RecargoEquivalenciaPorcentaje = rePorc,
                Orden = orden++
            });

            subtotal      += linSubtotal;
            ivaTotal      += linIva;
            recargoTotal  += linRe;
        }

        // ── Retención (sobre la base, si aplica) ─────────────────────────────
        decimal retencionPorc = !cliente.NoAplicarRetenciones && cliente.PorcentajeRetencion > 0
            ? cliente.PorcentajeRetencion : 0m;
        decimal retencionTotal = Math.Round(subtotal * retencionPorc / 100, 2, MidpointRounding.AwayFromZero);

        pedido.Subtotal                  = subtotal;
        pedido.IvaTotal                  = ivaTotal;
        pedido.RecargoEquivalenciaTotal  = recargoTotal;
        pedido.RetencionTotal            = retencionTotal;
        pedido.Total                     = subtotal + ivaTotal + recargoTotal - retencionTotal;

        await _uow.Pedidos.AddAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<PedidoCreado>.Ok(
            new PedidoCreado(pedido.Id, pedido.NumeroPedido!, pedido.Total),
            $"Pedido {pedido.NumeroPedido} creado correctamente"));
    }

    /// <summary>Tasas legales de recargo de equivalencia según tipo de IVA (España).</summary>
    private static decimal GetRecargoEquivalenciaPorcentaje(decimal ivaPorcentaje) =>
        ivaPorcentaje switch { 21m => 5.2m, 10m => 1.4m, 4m => 0.5m, _ => 0m };

    /// <summary>
    /// POST /api/pedidos/{id}/confirmar — Confirmar pedido (estado → Confirmado)
    /// </summary>
    [HttpPost("{id:int}/confirmar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Confirmar(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetByIdAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado != EstadoPedido.Pendiente)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden confirmar pedidos en estado Pendiente"));

        pedido.Estado = EstadoPedido.Confirmado;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido confirmado"));
    }

    /// <summary>
    /// POST /api/pedidos/{id}/cancelar — Cancelar pedido
    /// </summary>
    [HttpPost("{id:int}/cancelar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Cancelar(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetByIdAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado == EstadoPedido.Cancelado)
            return BadRequest(ApiResponse<string>.Fail("El pedido ya está cancelado"));

        pedido.Estado = EstadoPedido.Cancelado;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido cancelado"));
    }

    /// <summary>
    /// POST /api/pedidos/{id}/preparado — Marcar pedido como Preparado
    /// </summary>
    [HttpPost("{id:int}/preparado")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> MarcarPreparado(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetByIdAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado != EstadoPedido.EnPreparacion)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden marcar como preparados pedidos en estado EnPreparacion"));

        pedido.Estado = EstadoPedido.Preparado;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido preparado"));
    }

    /// <summary>
    /// POST /api/pedidos/{id}/en-reparto — Marcar pedido como EnReparto
    /// </summary>
    [HttpPost("{id:int}/en-reparto")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> MarcarEnReparto(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetByIdAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado != EstadoPedido.Preparado)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden enviar a reparto pedidos en estado Preparado"));

        pedido.Estado = EstadoPedido.EnReparto;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido en reparto"));
    }

    /// <summary>
    /// POST /api/pedidos/{id}/entregado — Marcar pedido como Entregado
    /// </summary>
    [HttpPost("{id:int}/entregado")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> MarcarEntregado(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetByIdAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Pedido no encontrado"));
        if (pedido.Estado != EstadoPedido.EnReparto)
            return BadRequest(ApiResponse<string>.Fail("Solo se pueden marcar como entregados pedidos en estado EnReparto"));

        pedido.Estado = EstadoPedido.Entregado;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Pedido entregado"));
    }

    /// <summary>
    /// POST /api/pedidos/{id}/crear-albaran
    /// Crea un albarán con FIFO automático a partir de un pedido confirmado.
    /// </summary>
    [HttpPost("{id:int}/crear-albaran")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<AlbaranCreado>>> CrearAlbaran(int id, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<AlbaranCreado>.Fail("Pedido no encontrado"));

        if (pedido.Estado != EstadoPedido.Confirmado)
            return BadRequest(ApiResponse<AlbaranCreado>.Fail("Solo se puede crear albarán de pedidos confirmados"));

        // Asignar lotes FIFO por cada línea del pedido
        var lineasConLotes = new List<(PedidoLinea Linea, Producto Producto, List<LoteAsignado> Lotes)>();

        foreach (var linea in pedido.Lineas)
        {
            var producto = linea.Producto
                ?? await _uow.Productos.GetByIdAsync(linea.ProductoId, ct)
                ?? throw new EntidadNotFoundException(nameof(Producto), linea.ProductoId);

            List<LoteAsignado> lotes;
            if (producto.RequiereLote)
                lotes = await _loteService.AsignarLotesAsync(EmpresaId, linea.ProductoId, linea.Cantidad, ct);
            else
                lotes = [new LoteAsignado(0, "", linea.ProductoId, linea.Cantidad, DateOnly.MinValue, null)];

            lineasConLotes.Add((linea, producto, lotes));
        }

        await _uow.BeginTransactionAsync(ct);
        try
        {
            string numeroAlbaran = $"ALB-{DateTime.UtcNow:yyyyMMddHHmmss}";

            var albaran = new Albaran
            {
                EmpresaId = EmpresaId,
                ClienteId = pedido.ClienteId,
                UsuarioId = UsuarioId,
                PedidoId = pedido.Id,
                NumeroAlbaran = numeroAlbaran,
                FechaAlbaran = DateOnly.FromDateTime(DateTime.Today),
                Estado = EstadoAlbaran.Pendiente,
                Notas = pedido.Notas
            };

            short orden = 0;
            foreach (var (linea, producto, lotes) in lineasConLotes)
            {
                foreach (var lote in lotes)
                {
                    albaran.Lineas.Add(new AlbaranLinea
                    {
                        ProductoId = linea.ProductoId,
                        LoteId = lote.LoteId > 0 ? lote.LoteId : null,
                        Descripcion = producto.Nombre + (lote.LoteId > 0 ? $" (Lote: {lote.CodigoLote})" : ""),
                        Cantidad = lote.Cantidad,
                        PrecioUnitario = linea.PrecioUnitario,
                        Descuento = linea.Descuento,
                        IvaPorcentaje = producto.IvaPorcentaje,
                        Orden = orden++
                    });
                }
            }

            albaran.Subtotal = albaran.Lineas.Sum(l => l.Subtotal);
            albaran.IvaTotal = albaran.Lineas.Sum(l => l.IvaImporte);
            albaran.Total = albaran.Subtotal + albaran.IvaTotal;

            await _uow.Albaranes.AddAsync(albaran, ct);

            pedido.Estado = EstadoPedido.EnPreparacion;
            await _uow.Pedidos.UpdateAsync(pedido, ct);

            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            return Ok(ApiResponse<AlbaranCreado>.Ok(
                new AlbaranCreado(albaran.Id, albaran.NumeroAlbaran!, albaran.Total),
                $"Albarán {albaran.NumeroAlbaran} creado desde pedido {pedido.NumeroPedido}"));
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>
    /// POST /api/pedidos/{id}/crear-factura
    /// Genera una factura directamente desde un pedido confirmado (sin albarán previo).
    /// Solo si el cliente permite facturación (noRealizarFacturas = false).
    /// </summary>
    [HttpPost("{id:int}/crear-factura")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<FacturaCreada>>> CrearFactura(
        int id, [FromBody] CrearFacturaDesdePedidoRequest request, CancellationToken ct)
    {
        var pedido = await _uow.Pedidos.GetConLineasAsync(id, ct);
        if (pedido == null || pedido.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<FacturaCreada>.Fail("Pedido no encontrado"));

        if (pedido.Estado != EstadoPedido.Confirmado)
            return BadRequest(ApiResponse<FacturaCreada>.Fail("Solo se puede facturar pedidos confirmados"));

        var cliente = await _uow.Clientes.GetByIdAsync(pedido.ClienteId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), pedido.ClienteId);

        if (cliente.NoRealizarFacturas)
            return BadRequest(ApiResponse<FacturaCreada>.Fail("Este cliente no permite la generación de facturas"));

        var facturaRequest = new CrearFacturaRequest
        {
            EmpresaId = EmpresaId,
            ClienteId = pedido.ClienteId,
            SerieId = request.SerieId,
            FechaFactura = request.FechaFactura ?? DateOnly.FromDateTime(DateTime.Today),
            EsSimplificada = request.EsSimplificada,
            UsuarioId = UsuarioId,
            Notas = pedido.Notas,
            Items = pedido.Lineas.Select(l => new LineaFacturaRequest
            {
                ProductoId = l.ProductoId,
                Cantidad = l.Cantidad,
                PrecioUnitario = l.PrecioUnitario,
                Descuento = l.Descuento
            }).ToList()
        };

        var factura = await _facturaService.CrearFacturaAsync(facturaRequest, ct);

        pedido.Estado = EstadoPedido.EnPreparacion;
        await _uow.Pedidos.UpdateAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<FacturaCreada>.Ok(factura, $"Factura {factura.NumeroFactura} generada desde pedido {pedido.NumeroPedido}"));
    }

    private static PedidoDetalle MapToDetalle(Pedido p) => new(
        p.Id,
        p.NumeroPedido ?? $"PED-{p.Id}",
        p.FechaPedido.ToString("yyyy-MM-dd"),
        p.FechaEntrega?.ToString("yyyy-MM-dd"),
        p.Estado.ToString(),
        new ClienteResumen(p.Cliente?.Id ?? 0, p.Cliente?.NombreCompleto ?? "", p.Cliente?.Nif),
        p.Subtotal, p.IvaTotal, p.RecargoEquivalenciaTotal, p.RetencionTotal, p.Total, p.Notas,
        p.Lineas.OrderBy(l => l.Orden).Select(l => new PedidoLineaDto(
            l.ProductoId,
            l.Producto?.Nombre ?? l.Descripcion ?? "",
            l.Cantidad, l.PrecioUnitario, l.Descuento,
            l.IvaPorcentaje, l.RecargoEquivalenciaPorcentaje,
            l.Subtotal, l.IvaImporte, l.RecargoEquivalenciaImporte
        )).ToList(),
        p.Cliente?.NoRealizarFacturas ?? false
    );
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

public record PedidoResumen(
    int Id, string NumeroPedido, string Fecha, string? FechaEntrega,
    string Estado, string ClienteNombre, decimal Total,
    bool NoRealizarFacturas = false);

public record PedidoCreado(int Id, string NumeroPedido, decimal Total);

public record PedidoDetalle(
    int Id, string NumeroPedido, string Fecha, string? FechaEntrega, string Estado,
    ClienteResumen Cliente,
    decimal Subtotal, decimal IvaTotal, decimal RecargoEquivalenciaTotal,
    decimal RetencionTotal, decimal Total,
    string? Notas, List<PedidoLineaDto> Lineas,
    bool NoRealizarFacturas = false);

public record PedidoLineaDto(
    int ProductoId, string ProductoNombre,
    decimal Cantidad, decimal PrecioUnitario, decimal Descuento,
    decimal IvaPorcentaje, decimal RecargoEquivalenciaPorcentaje,
    decimal Subtotal, decimal IvaImporte, decimal RecargoEquivalenciaImporte);

public class CrearPedidoRequest
{
    public int ClienteId { get; set; }
    public DateOnly FechaPedido { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public DateOnly? FechaEntrega { get; set; }
    public string? Notas { get; set; }
    public List<LineaPedidoRequest> Items { get; set; } = new();
}

public class LineaPedidoRequest
{
    public int ProductoId { get; set; }
    public decimal Cantidad { get; set; }
    public decimal? PrecioUnitario { get; set; }
    public decimal Descuento { get; set; } = 0;
}

public class CrearFacturaDesdePedidoRequest
{
    public int SerieId { get; set; }
    public DateOnly? FechaFactura { get; set; }
    public bool EsSimplificada { get; set; } = false;
}
