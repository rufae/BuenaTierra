using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PedidosController : ControllerBase
{
    private readonly IUnitOfWork _uow;

    public PedidosController(IUnitOfWork uow) => _uow = uow;

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
            p.Total
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

    /// <summary>POST /api/pedidos/crear — Crear nuevo pedido</summary>
    [HttpPost("crear")]
    public async Task<ActionResult<ApiResponse<PedidoCreado>>> Crear(
        [FromBody] CrearPedidoRequest request, CancellationToken ct)
    {
        var cliente = await _uow.Clientes.GetByIdAsync(request.ClienteId, ct)
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

        foreach (var item in request.Items)
        {
            var producto = await _uow.Productos.GetByIdAsync(item.ProductoId, ct)
                ?? throw new EntidadNotFoundException(nameof(Producto), item.ProductoId);

            decimal precio = item.PrecioUnitario ?? producto.PrecioVenta;
            decimal linSubtotal = Math.Round(item.Cantidad * precio * (1 - item.Descuento / 100), 4);
            decimal linIva = Math.Round(linSubtotal * producto.IvaPorcentaje / 100, 4);

            pedido.Lineas.Add(new PedidoLinea
            {
                ProductoId = item.ProductoId,
                Descripcion = producto.Nombre,
                Cantidad = item.Cantidad,
                PrecioUnitario = precio,
                Descuento = item.Descuento,
                IvaPorcentaje = producto.IvaPorcentaje,
                Orden = orden++
            });

            subtotal += linSubtotal;
            ivaTotal += linIva;
        }

        pedido.Subtotal = subtotal;
        pedido.IvaTotal = ivaTotal;
        pedido.Total = subtotal + ivaTotal;

        await _uow.Pedidos.AddAsync(pedido, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<PedidoCreado>.Ok(
            new PedidoCreado(pedido.Id, pedido.NumeroPedido!, pedido.Total),
            $"Pedido {pedido.NumeroPedido} creado correctamente"));
    }

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

    private static PedidoDetalle MapToDetalle(Pedido p) => new(
        p.Id,
        p.NumeroPedido ?? $"PED-{p.Id}",
        p.FechaPedido.ToString("yyyy-MM-dd"),
        p.FechaEntrega?.ToString("yyyy-MM-dd"),
        p.Estado.ToString(),
        new ClienteResumen(p.Cliente?.Id ?? 0, p.Cliente?.NombreCompleto ?? "", p.Cliente?.Nif),
        p.Subtotal, p.IvaTotal, p.Total, p.Notas,
        p.Lineas.OrderBy(l => l.Orden).Select(l => new PedidoLineaDto(
            l.ProductoId,
            l.Producto?.Nombre ?? l.Descripcion ?? "",
            l.Cantidad, l.PrecioUnitario, l.Descuento, l.IvaPorcentaje,
            l.Subtotal, l.IvaImporte
        )).ToList()
    );
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

public record PedidoResumen(
    int Id, string NumeroPedido, string Fecha, string? FechaEntrega,
    string Estado, string ClienteNombre, decimal Total);

public record PedidoCreado(int Id, string NumeroPedido, decimal Total);

public record PedidoDetalle(
    int Id, string NumeroPedido, string Fecha, string? FechaEntrega, string Estado,
    ClienteResumen Cliente, decimal Subtotal, decimal IvaTotal, decimal Total,
    string? Notas, List<PedidoLineaDto> Lineas);

public record PedidoLineaDto(
    int ProductoId, string ProductoNombre,
    decimal Cantidad, decimal PrecioUnitario, decimal Descuento,
    decimal IvaPorcentaje, decimal Subtotal, decimal IvaImporte);

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
