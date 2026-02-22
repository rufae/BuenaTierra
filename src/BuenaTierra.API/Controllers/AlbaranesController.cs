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
public class AlbaranesController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly ILoteAsignacionService _loteService;
    private readonly ISerieFacturacionService _serieService;
    private readonly IFacturaService _facturaService;

    public AlbaranesController(
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

    /// <summary>GET /api/albaranes — Listar albaranes con filtros opcionales de fecha</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<AlbaranResumen>>>> GetAll(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, CancellationToken ct)
    {
        var albaranes = await _uow.Albaranes.GetByEmpresaAsync(EmpresaId, desde, hasta, ct);
        var resultado = albaranes.Select(a => new AlbaranResumen(
            a.Id, a.NumeroAlbaran ?? $"ALB-{a.Id}",
            a.FechaAlbaran.ToString("yyyy-MM-dd"),
            a.Estado.ToString(),
            a.Cliente?.NombreCompleto ?? "",
            a.Cliente?.Nif,
            a.Total,
            a.PedidoId
        ));
        return Ok(ApiResponse<IEnumerable<AlbaranResumen>>.Ok(resultado));
    }

    /// <summary>GET /api/albaranes/{id} — Detalle de albarán con todas sus líneas y lotes</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<AlbaranDetalle>>> Get(int id, CancellationToken ct)
    {
        var albaran = await _uow.Albaranes.GetConLineasAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<AlbaranDetalle>.Fail("Albarán no encontrado"));

        return Ok(ApiResponse<AlbaranDetalle>.Ok(MapToDetalle(albaran)));
    }

    /// <summary>
    /// POST /api/albaranes/crear
    /// Crea un albarán con asignación FIFO automática de lotes (igual que factura).
    /// </summary>
    [HttpPost("crear")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<AlbaranCreado>>> Crear(
        [FromBody] CrearAlbaranRequest request, CancellationToken ct)
    {
        request.EmpresaId = EmpresaId;
        request.UsuarioId = UsuarioId;

        // Validar cliente
        var cliente = await _uow.Clientes.GetByIdAsync(request.ClienteId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), request.ClienteId);

        // Por cada item, asignar lotes FIFO
        var lineasConLotes = new List<(LineaAlbaranRequest Item, Producto Producto, List<LoteAsignado> Lotes)>();

        foreach (var item in request.Items)
        {
            var producto = await _uow.Productos.GetByIdAsync(item.ProductoId, ct)
                ?? throw new EntidadNotFoundException(nameof(Producto), item.ProductoId);

            List<LoteAsignado> lotesAsignados;
            if (producto.RequiereLote)
                lotesAsignados = await _loteService.AsignarLotesAsync(EmpresaId, item.ProductoId, item.Cantidad, ct);
            else
                lotesAsignados = [new LoteAsignado(0, "", item.ProductoId, item.Cantidad, DateOnly.MinValue, null)];

            lineasConLotes.Add((item, producto, lotesAsignados));
        }

        await _uow.BeginTransactionAsync(ct);
        try
        {
            // Número de albarán (usa misma serie que facturas o serie propia)
            string numeroAlbaran;
            if (request.SerieId.HasValue)
                numeroAlbaran = $"ALB-{await _serieService.SiguienteNumeroAsync(EmpresaId, request.SerieId.Value, ct)}";
            else
                numeroAlbaran = $"ALB-{DateTime.UtcNow:yyyyMMddHHmmss}";

            var albaran = new Albaran
            {
                EmpresaId = EmpresaId,
                ClienteId = request.ClienteId,
                UsuarioId = UsuarioId,
                PedidoId = request.PedidoId,
                SerieId = request.SerieId,
                NumeroAlbaran = numeroAlbaran,
                FechaAlbaran = request.FechaAlbaran,
                Estado = EstadoAlbaran.Pendiente,
                Notas = request.Notas
            };

            short orden = 0;
            foreach (var (item, producto, lotes) in lineasConLotes)
            {
                decimal precio = item.PrecioUnitario ?? producto.PrecioVenta;
                foreach (var lote in lotes)
                {
                    albaran.Lineas.Add(new AlbaranLinea
                    {
                        ProductoId = item.ProductoId,
                        LoteId = lote.LoteId > 0 ? lote.LoteId : null,
                        Descripcion = producto.Nombre + (lote.LoteId > 0 ? $" (Lote: {lote.CodigoLote})" : ""),
                        Cantidad = lote.Cantidad,
                        PrecioUnitario = precio,
                        Descuento = item.Descuento,
                        IvaPorcentaje = producto.IvaPorcentaje,
                        Orden = orden++
                    });
                }
            }

            // Calcular totales
            albaran.Subtotal = albaran.Lineas.Sum(l => l.Subtotal);
            albaran.IvaTotal = albaran.Lineas.Sum(l => l.IvaImporte);
            albaran.Total = albaran.Subtotal + albaran.IvaTotal;

            await _uow.Albaranes.AddAsync(albaran, ct);
            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            return Ok(ApiResponse<AlbaranCreado>.Ok(
                new AlbaranCreado(albaran.Id, albaran.NumeroAlbaran!, albaran.Total),
                $"Albarán {albaran.NumeroAlbaran} creado correctamente"));
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>
    /// POST /api/albaranes/{id}/convertir-factura
    /// Convierte un albarán en factura con FIFO. Reutiliza FacturaService.
    /// </summary>
    [HttpPost("{id:int}/convertir-factura")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<FacturaCreada>>> ConvertirAFactura(
        int id, [FromBody] ConvertirAlbaranRequest request, CancellationToken ct)
    {
        var albaran = await _uow.Albaranes.GetConLineasAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<FacturaCreada>.Fail("Albarán no encontrado"));

        if (albaran.Estado == EstadoAlbaran.Facturado)
            return BadRequest(ApiResponse<FacturaCreada>.Fail("El albarán ya ha sido facturado"));

        // Reagrupar líneas por producto+precio para reconstruir los items originales
        var items = albaran.Lineas
            .GroupBy(l => new { l.ProductoId, l.PrecioUnitario, l.Descuento })
            .Select(g => new LineaFacturaRequest
            {
                ProductoId = g.Key.ProductoId,
                Cantidad = g.Sum(l => l.Cantidad),
                PrecioUnitario = g.Key.PrecioUnitario,
                Descuento = g.Key.Descuento
            }).ToList();

        var facturaRequest = new CrearFacturaRequest
        {
            EmpresaId = EmpresaId,
            ClienteId = albaran.ClienteId,
            SerieId = request.SerieId,
            FechaFactura = request.FechaFactura ?? DateOnly.FromDateTime(DateTime.Today),
            EsSimplificada = request.EsSimplificada,
            UsuarioId = UsuarioId,
            Notas = albaran.Notas,
            Items = items
        };

        var factura = await _facturaService.CrearFacturaAsync(facturaRequest, ct);

        // Marcar albarán como facturado
        albaran.Estado = EstadoAlbaran.Facturado;
        await _uow.Albaranes.UpdateAsync(albaran, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<FacturaCreada>.Ok(factura, $"Factura {factura.NumeroFactura} generada desde albarán {albaran.NumeroAlbaran}"));
    }

    /// <summary>POST /api/albaranes/{id}/entregar — Marcar albarán como entregado</summary>
    [HttpPost("{id:int}/entregar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<string>>> Entregar(int id, CancellationToken ct)
    {
        var albaran = await _uow.Albaranes.GetByIdAsync(id, ct);
        if (albaran == null || albaran.EmpresaId != EmpresaId)
            return NotFound(ApiResponse<string>.Fail("Albarán no encontrado"));

        albaran.Estado = EstadoAlbaran.Entregado;
        await _uow.Albaranes.UpdateAsync(albaran, ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<string>.Ok("OK", "Albarán marcado como entregado"));
    }

    private static AlbaranDetalle MapToDetalle(Albaran a) => new(
        a.Id,
        a.NumeroAlbaran ?? $"ALB-{a.Id}",
        a.FechaAlbaran.ToString("yyyy-MM-dd"),
        a.Estado.ToString(),
        new ClienteResumen(a.Cliente?.Id ?? 0, a.Cliente?.NombreCompleto ?? "", a.Cliente?.Nif),
        a.Subtotal, a.IvaTotal, a.Total, a.PedidoId, a.Notas,
        a.Lineas.OrderBy(l => l.Orden).Select(l => new AlbaranLineaDto(
            l.ProductoId,
            l.Producto?.Nombre ?? l.Descripcion ?? "",
            l.Lote?.CodigoLote,
            l.Lote?.FechaFabricacion,
            l.Lote?.FechaCaducidad,
            l.Cantidad, l.PrecioUnitario, l.Descuento, l.IvaPorcentaje,
            Math.Round(l.Cantidad * l.PrecioUnitario * (1 - l.Descuento / 100), 4),
            Math.Round(l.Cantidad * l.PrecioUnitario * (1 - l.Descuento / 100) * l.IvaPorcentaje / 100, 4)
        )).ToList()
    );
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

public record AlbaranResumen(
    int Id, string NumeroAlbaran, string Fecha, string Estado,
    string ClienteNombre, string? ClienteNif, decimal Total, int? PedidoId);

public record AlbaranCreado(int Id, string NumeroAlbaran, decimal Total);

public record AlbaranDetalle(
    int Id, string NumeroAlbaran, string Fecha, string Estado,
    ClienteResumen Cliente, decimal Subtotal, decimal IvaTotal, decimal Total,
    int? PedidoId, string? Notas, List<AlbaranLineaDto> Lineas);

public record AlbaranLineaDto(
    int ProductoId, string ProductoNombre, string? CodigoLote,
    DateOnly? FechaFabricacion, DateOnly? FechaCaducidad,
    decimal Cantidad, decimal PrecioUnitario, decimal Descuento,
    decimal IvaPorcentaje, decimal Subtotal, decimal IvaImporte);

public class CrearAlbaranRequest
{
    public int EmpresaId { get; set; }
    public int ClienteId { get; set; }
    public int? PedidoId { get; set; }
    public int? SerieId { get; set; }
    public int UsuarioId { get; set; }
    public DateOnly FechaAlbaran { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public string? Notas { get; set; }
    public List<LineaAlbaranRequest> Items { get; set; } = new();
}

public class LineaAlbaranRequest
{
    public int ProductoId { get; set; }
    public decimal Cantidad { get; set; }
    public decimal? PrecioUnitario { get; set; }
    public decimal Descuento { get; set; } = 0;
}

public class ConvertirAlbaranRequest
{
    public int SerieId { get; set; }
    public DateOnly? FechaFactura { get; set; }
    public bool EsSimplificada { get; set; } = false;
}
