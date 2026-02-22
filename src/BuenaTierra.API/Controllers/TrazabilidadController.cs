using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/trazabilidad")]
[Authorize]
public class TrazabilidadController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    // ── Helpers ──────────────────────────────────────────────────────────────
    private static string EstadoLote(
        bool bloqueado, DateOnly? caducidad, decimal? disponible) =>
        bloqueado ? "Bloqueado" :
        caducidad.HasValue && caducidad.Value < DateOnly.FromDateTime(DateTime.Today) ? "Caducado" :
        disponible <= 0 ? "Agotado" : "Activo";

    public TrazabilidadController(IUnitOfWork uow) => _uow = uow;

    /// GET /api/trazabilidad?desde=2025-01-01&hasta=2025-12-31
    /// Devuelve registros de trazabilidad en JSON para visualización en tabla
    [HttpGet]
    public async Task<IActionResult> GetTrazabilidad(
        [FromQuery] string? desde = null,
        [FromQuery] string? hasta = null,
        CancellationToken ct = default)
    {
        var desdeVal = DateOnly.TryParse(desde, out var d) ? d : DateOnly.FromDateTime(DateTime.Today.AddDays(-30));
        var hastaVal = DateOnly.TryParse(hasta, out var h) ? h : DateOnly.FromDateTime(DateTime.Today);

        var registros = await _uow.Trazabilidades
            .GetQueryable()
            .Where(t => t.EmpresaId == EmpresaId
                     && t.FechaOperacion.Date >= desdeVal.ToDateTime(TimeOnly.MinValue).Date
                     && t.FechaOperacion.Date <= hastaVal.ToDateTime(TimeOnly.MinValue).Date)
            .Include(t => t.Lote).ThenInclude(l => l.Stock)
            .Include(t => t.Producto)
            .Include(t => t.Cliente)
            .Include(t => t.Factura)
            .OrderByDescending(t => t.FechaOperacion)
            .ToListAsync(ct);

        var result = registros.Select(t =>
        {
            string estadoLote;
            if (t.Lote.Bloqueado) estadoLote = "Bloqueado";
            else if (t.Lote.FechaCaducidad.HasValue && t.Lote.FechaCaducidad.Value < DateOnly.FromDateTime(DateTime.Today)) estadoLote = "Caducado";
            else if (t.Lote.Stock?.CantidadDisponible <= 0) estadoLote = "Agotado";
            else estadoLote = "Activo";

            return new
            {
                t.Id,
                fecha = t.FechaOperacion,
                tipoOperacion = t.TipoOperacion,
                productoNombre = t.Producto?.Nombre ?? "—",
                lote = t.Lote?.CodigoLote ?? "—",
                fechaFabricacion = t.Lote?.FechaFabricacion,
                fechaCaducidad = t.Lote?.FechaCaducidad,
                cantidad = t.Cantidad,
                estadoLote,
                clienteNombre = t.Cliente?.NombreCompleto ?? t.Cliente?.Nombre,
                clienteNif = t.Cliente?.Nif,
                facturaNumero = t.Factura?.NumeroFactura,
                facturaFecha = t.Factura?.FechaFactura,
                datosAdicionales = t.DatosAdicionales,
            };
        }).ToList();

        return Ok(new { success = true, data = result, total = result.Count });
    }

    // ── GET /api/trazabilidad/producto/{productoId} ───────────────────────────
    /// Traza completa de un producto: todos sus lotes + movimientos (quién compró, cuándo)
    [HttpGet("producto/{productoId:int}")]
    public async Task<IActionResult> GetByProducto(int productoId, CancellationToken ct)
    {
        var producto = await _uow.Productos.GetQueryable()
            .Where(p => p.Id == productoId && p.EmpresaId == EmpresaId)
            .FirstOrDefaultAsync(ct);
        if (producto is null) return NotFound();

        var lotes = await _uow.Lotes.GetQueryable()
            .Where(l => l.ProductoId == productoId && l.EmpresaId == EmpresaId)
            .Include(l => l.Stock)
            .OrderByDescending(l => l.FechaFabricacion)
            .ToListAsync(ct);

        var loteIds = lotes.Select(l => l.Id).ToList();
        var trazas = await _uow.Trazabilidades.GetQueryable()
            .Where(t => loteIds.Contains(t.LoteId))
            .Include(t => t.Cliente)
            .Include(t => t.Factura)
            .OrderByDescending(t => t.FechaOperacion)
            .ToListAsync(ct);

        var result = new
        {
            producto = new { producto.Id, producto.Nombre, producto.Codigo },
            totalLotes = lotes.Count,
            lotes = lotes.Select(l => new
            {
                l.Id,
                l.CodigoLote,
                l.FechaFabricacion,
                l.FechaCaducidad,
                l.CantidadInicial,
                stockActual = l.Stock?.CantidadDisponible ?? 0,
                estado = EstadoLote(l.Bloqueado, l.FechaCaducidad, l.Stock?.CantidadDisponible),
                movimientos = trazas
                    .Where(t => t.LoteId == l.Id)
                    .Select(t => new
                    {
                        t.Id,
                        fecha = t.FechaOperacion,
                        t.TipoOperacion,
                        t.Cantidad,
                        clienteNombre = t.Cliente?.NombreCompleto ?? t.Cliente?.Nombre,
                        clienteNif = t.Cliente?.Nif,
                        facturaNumero = t.Factura?.NumeroFactura,
                    }).ToList(),
            }).ToList(),
        };

        return Ok(new { success = true, data = result });
    }

    // ── GET /api/trazabilidad/ingrediente/{ingredienteId} ────────────────────
    /// Trazabilidad directa: ingrediente → productos que lo contienen
    ///   → lotes de esos productos → clientes que los recibieron
    [HttpGet("ingrediente/{ingredienteId:int}")]
    public async Task<IActionResult> GetByIngrediente(int ingredienteId, CancellationToken ct)
    {
        // Ingrediente + alérgenos
        var ingrediente = await _uow.Ingredientes.GetQueryable()
            .Where(i => i.Id == ingredienteId && i.EmpresaId == EmpresaId)
            .Include(i => i.IngredienteAlergenos).ThenInclude(ia => ia.Alergeno)
            .FirstOrDefaultAsync(ct);
        if (ingrediente is null) return NotFound();

        // Productos que contienen este ingrediente
        var productoIngredientes = await _uow.ProductoIngredientes.GetQueryable()
            .Where(pi => pi.IngredienteId == ingredienteId)
            .Include(pi => pi.Producto)
            .ToListAsync(ct);

        var productoIds = productoIngredientes.Select(pi => pi.ProductoId).Distinct().ToList();

        // Filtrar que sean de esta empresa
        var productos = await _uow.Productos.GetQueryable()
            .Where(p => productoIds.Contains(p.Id) && p.EmpresaId == EmpresaId)
            .ToListAsync(ct);
        var productosEmpresa = productos.Select(p => p.Id).ToHashSet();

        // Lotes de esos productos
        var lotes = await _uow.Lotes.GetQueryable()
            .Where(l => productosEmpresa.Contains(l.ProductoId) && l.EmpresaId == EmpresaId)
            .Include(l => l.Stock)
            .OrderByDescending(l => l.FechaFabricacion)
            .ToListAsync(ct);

        var loteIds = lotes.Select(l => l.Id).ToList();

        // Trazabilidades (movimientos de salida hacia clientes)
        var trazas = await _uow.Trazabilidades.GetQueryable()
            .Where(t => loteIds.Contains(t.LoteId) && t.TipoOperacion == "VENTA")
            .Include(t => t.Cliente)
            .Include(t => t.Factura)
            .OrderByDescending(t => t.FechaOperacion)
            .ToListAsync(ct);

        // Clientes únicos afectados (para alerta o recall)
        var clientesAfectados = trazas
            .Where(t => t.ClienteId.HasValue)
            .GroupBy(t => t.ClienteId)
            .Select(g => new
            {
                clienteId = g.Key,
                nombre = g.First().Cliente?.NombreCompleto ?? g.First().Cliente?.Nombre ?? "—",
                nif = g.First().Cliente?.Nif,
                totalUnidades = g.Sum(t => t.Cantidad),
                primeraVenta = g.Min(t => t.FechaOperacion),
                ultimaVenta = g.Max(t => t.FechaOperacion),
            }).ToList();

        var result = new
        {
            ingrediente = new
            {
                ingrediente.Id,
                ingrediente.Nombre,
                ingrediente.Proveedor,
                alergenos = ingrediente.IngredienteAlergenos
                    .Select(ia => new { ia.Alergeno.Codigo, ia.Alergeno.Nombre }).ToList(),
            },
            productos = productos.Select(p =>
            {
                var piData = productoIngredientes.FirstOrDefault(pi => pi.ProductoId == p.Id);
                var lotesProducto = lotes.Where(l => l.ProductoId == p.Id).ToList();
                return new
                {
                    p.Id, p.Nombre, p.Codigo,
                    cantidadGr = piData?.CantidadGr,
                    esPrincipal = piData?.EsPrincipal ?? false,
                    totalLotes = lotesProducto.Count,
                    lotes = lotesProducto.Select(l => new
                    {
                        l.CodigoLote,
                        l.FechaFabricacion,
                        l.FechaCaducidad,
                        l.CantidadInicial,
                        stockActual = l.Stock?.CantidadDisponible ?? 0,
                        estado = EstadoLote(l.Bloqueado, l.FechaCaducidad, l.Stock?.CantidadDisponible),
                    }).ToList(),
                };
            }).ToList(),
            clientesAfectados,
            totalMovimientos = trazas.Count,
            totalClientesAfectados = clientesAfectados.Count,
        };

        return Ok(new { success = true, data = result });
    }
}
