using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    public DashboardController(IUnitOfWork uow) => _uow = uow;

    /// GET /api/dashboard/stats
    /// Estadísticas consolidadas para el panel de control principal.
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken ct = default)
    {
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var inicioMes = new DateOnly(hoy.Year, hoy.Month, 1);
        var hace7 = hoy.AddDays(-7);

        // ── Facturas ────────────────────────────────────────────────────────────
        var facturasQuery = _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId);

        var facturasHoy = await facturasQuery
            .Where(f => f.FechaFactura == hoy)
            .Select(f => new { f.Total })
            .ToListAsync(ct);

        var facturasMes = await facturasQuery
            .Where(f => f.FechaFactura >= inicioMes)
            .Select(f => new { f.Total })
            .ToListAsync(ct);

        var ultimasFacturas = await facturasQuery
            .Where(f => f.FechaFactura >= hace7)
            .OrderByDescending(f => f.FechaFactura)
            .ThenByDescending(f => f.Id)
            .Take(8)
            .Include(f => f.Cliente)
            .Select(f => new
            {
                f.Id,
                f.NumeroFactura,
                fecha = f.FechaFactura.ToString("dd/MM/yyyy"),
                clienteNombre = f.Cliente != null
                    ? (f.Cliente.RazonSocial ?? (f.Cliente.Nombre + " " + f.Cliente.Apellidos).Trim())
                    : "—",
                f.Total,
                estado = f.Estado.ToString(),
            })
            .ToListAsync(ct);

        // ── Pedidos ─────────────────────────────────────────────────────────────
        var pedidosQuery = _uow.Pedidos.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId);

        var pedidosPendientes = await pedidosQuery
            .CountAsync(p => p.Estado == EstadoPedido.Pendiente || p.Estado == EstadoPedido.Confirmado, ct);

        var ultimosPedidos = await pedidosQuery
            .Where(p => p.Estado != EstadoPedido.Cancelado)
            .OrderByDescending(p => p.FechaPedido)
            .Take(5)
            .Include(p => p.Cliente)
            .Select(p => new
            {
                p.Id,
                p.NumeroPedido,
                fecha = p.FechaPedido.ToString("dd/MM/yyyy"),
                clienteNombre = p.Cliente != null
                    ? (p.Cliente.RazonSocial ?? (p.Cliente.Nombre + " " + p.Cliente.Apellidos).Trim())
                    : "—",
                p.Total,
                estado = p.Estado.ToString(),
            })
            .ToListAsync(ct);

        // ── Stock alertas ────────────────────────────────────────────────────────
        var stockAlertas = await _uow.Stock.GetQueryable()
            .Where(s => s.EmpresaId == EmpresaId && s.CantidadDisponible <= s.StockMinimo)
            .CountAsync(ct);

        int lotesProximoCaducar;
        try
        {
            var limite = DateOnly.FromDateTime(DateTime.Today.AddDays(5));
            lotesProximoCaducar = await _uow.Lotes.GetQueryable()
                .Where(l => l.EmpresaId == EmpresaId
                         && !l.Bloqueado
                         && l.FechaCaducidad != null
                         && l.FechaCaducidad <= limite
                         && l.FechaCaducidad >= hoy)
                .CountAsync(ct);
        }
        catch { lotesProximoCaducar = 0; }

        // ── Producción ───────────────────────────────────────────────────────────
        var produccionHoy = await _uow.Producciones.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId && p.FechaProduccion == hoy)
            .CountAsync(ct);

        // ── Clientes ─────────────────────────────────────────────────────────────
        var totalClientes = await _uow.Clientes.GetQueryable()
            .CountAsync(c => c.EmpresaId == EmpresaId && c.Activo, ct);

        return Ok(new
        {
            success = true,
            data = new
            {
                facturasHoyCount = facturasHoy.Count,
                facturasHoyImporte = facturasHoy.Sum(f => f.Total),
                facturasMesCount = facturasMes.Count,
                facturasMesImporte = facturasMes.Sum(f => f.Total),
                pedidosPendientes,
                stockAlertas,
                lotesProximoCaducar,
                produccionHoy,
                totalClientes,
                ultimasFacturas,
                ultimosPedidos,
            }
        });
    }
}
