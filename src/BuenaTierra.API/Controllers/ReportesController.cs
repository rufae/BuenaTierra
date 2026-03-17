using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Interfaces;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/reportes")]
[Authorize]
public class ReportesController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    public ReportesController(IUnitOfWork uow) => _uow = uow;

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/reportes/ventas?desde=2026-01-01&hasta=2026-01-31
    // Ventas diarias en el rango. Útil para gráfica de área/línea.
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("ventas")]
    public async Task<IActionResult> GetVentas(
        [FromQuery] DateOnly? desde,
        [FromQuery] DateOnly? hasta,
        CancellationToken ct = default)
    {
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var d = desde ?? hoy.AddDays(-29);
        var h = hasta ?? hoy;

        var facturas = await _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId
                     && f.FechaFactura >= d
                     && f.FechaFactura <= h
                     && f.Estado != EstadoFactura.Cancelada)
            .Select(f => new { f.FechaFactura, f.Total, f.BaseImponible })
            .ToListAsync(ct);

        // Agrupar por día
        var puntos = facturas
            .GroupBy(f => f.FechaFactura)
            .OrderBy(g => g.Key)
            .Select(g => new
            {
                fecha = g.Key.ToString("yyyy-MM-dd"),
                fechaLabel = g.Key.ToString("dd/MM"),
                importe = Math.Round(g.Sum(x => x.Total), 2),
                base_ = Math.Round(g.Sum(x => x.BaseImponible), 2),
                count = g.Count(),
            })
            .ToList();

        // Rellenar días sin ventas con 0 para gráfica continua
        var puntosCompletos = new List<object>();
        for (var dia = d; dia <= h; dia = dia.AddDays(1))
        {
            var p = puntos.FirstOrDefault(x => x.fecha == dia.ToString("yyyy-MM-dd"));
            puntosCompletos.Add(new
            {
                fecha = dia.ToString("yyyy-MM-dd"),
                fechaLabel = dia.ToString("dd/MM"),
                importe = p?.importe ?? 0m,
                base_ = p?.base_ ?? 0m,
                count = p?.count ?? 0,
            });
        }

        return Ok(new
        {
            puntos = puntosCompletos,
            totalImporte = Math.Round(facturas.Sum(f => f.Total), 2),
            totalBase = Math.Round(facturas.Sum(f => f.BaseImponible), 2),
            totalFacturas = facturas.Count,
            desde = d.ToString("yyyy-MM-dd"),
            hasta = h.ToString("yyyy-MM-dd"),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/reportes/stock
    // Estado del stock agrupado por producto.
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("stock")]
    public async Task<IActionResult> GetStock(CancellationToken ct = default)
    {
        var stockItems = await _uow.Stock.GetQueryable()
            .Where(s => s.EmpresaId == EmpresaId)
            .Include(s => s.Producto)
            .Include(s => s.Lote)
            .Select(s => new
            {
                s.ProductoId,
                productoNombre = s.Producto.Nombre,
                productoUnidad = s.Producto.UnidadMedida,
                s.LoteId,
                codigoLote = s.Lote.CodigoLote,
                s.CantidadDisponible,
                s.CantidadReservada,
                s.StockMinimo,
                tieneAlerta = s.CantidadDisponible <= s.StockMinimo,
                bloqueado = s.Lote.Bloqueado,
            })
            .ToListAsync(ct);

        // Agrupar por producto
        var porProducto = stockItems
            .GroupBy(s => new { s.ProductoId, s.productoNombre, s.productoUnidad })
            .OrderBy(g => g.Key.productoNombre)
            .Select(g => new
            {
                productoId = g.Key.ProductoId,
                productoNombre = g.Key.productoNombre,
                unidad = g.Key.productoUnidad,
                stockTotal = Math.Round(g.Sum(x => x.CantidadDisponible), 3),
                stockReservado = Math.Round(g.Sum(x => x.CantidadReservada), 3),
                stockDisponible = Math.Round(g.Sum(x => x.CantidadDisponible - x.CantidadReservada), 3),
                numLotes = g.Count(),
                conAlertas = g.Any(x => x.tieneAlerta),
                lotes = g.OrderBy(x => x.codigoLote).Select(x => new
                {
                    x.LoteId,
                    x.codigoLote,
                    x.CantidadDisponible,
                    x.CantidadReservada,
                    disponible = x.CantidadDisponible - x.CantidadReservada,
                    x.tieneAlerta,
                    x.bloqueado,
                }).ToList(),
            })
            .ToList();

        return Ok(new
        {
            items = porProducto,
            totalProductos = porProducto.Count,
            productosConAlerta = porProducto.Count(p => p.conAlertas),
            stockTotalUnidades = Math.Round(porProducto.Sum(p => p.stockTotal), 2),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/reportes/produccion?desde=&hasta=
    // Producción por producto en el rango. Útil para gráfica de barras.
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("produccion")]
    public async Task<IActionResult> GetProduccion(
        [FromQuery] DateOnly? desde,
        [FromQuery] DateOnly? hasta,
        CancellationToken ct = default)
    {
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var d = desde ?? hoy.AddDays(-29);
        var h = hasta ?? hoy;

        var producciones = await _uow.Producciones.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId
                     && p.FechaProduccion >= d
                     && p.FechaProduccion <= h
                     && p.Estado != EstadoProduccion.Cancelada)
            .Include(p => p.Producto)
            .Select(p => new
            {
                p.FechaProduccion,
                productoNombre = p.Producto.Nombre,
                p.ProductoId,
                p.CantidadProducida,
                p.CantidadMerma,
                cantidadNeta = p.CantidadProducida - p.CantidadMerma,
            })
            .ToListAsync(ct);

        // Agrupación por día para la gráfica temporal
        var porDia = producciones
            .GroupBy(p => p.FechaProduccion)
            .OrderBy(g => g.Key)
            .Select(g => new
            {
                fecha = g.Key.ToString("yyyy-MM-dd"),
                fechaLabel = g.Key.ToString("dd/MM"),
                cantidadProducida = Math.Round(g.Sum(x => x.CantidadProducida), 3),
                cantidadMerma = Math.Round(g.Sum(x => x.CantidadMerma), 3),
                cantidadNeta = Math.Round(g.Sum(x => x.cantidadNeta), 3),
                numProducciones = g.Count(),
            })
            .ToList();

        // Top productos en el período
        var topProductos = producciones
            .GroupBy(p => new { p.ProductoId, p.productoNombre })
            .OrderByDescending(g => g.Sum(x => x.cantidadNeta))
            .Take(10)
            .Select(g => new
            {
                productoId = g.Key.ProductoId,
                nombre = g.Key.productoNombre,
                totalProducido = Math.Round(g.Sum(x => x.CantidadProducida), 3),
                totalMerma = Math.Round(g.Sum(x => x.CantidadMerma), 3),
                totalNeto = Math.Round(g.Sum(x => x.cantidadNeta), 3),
                numProducciones = g.Count(),
            })
            .ToList();

        return Ok(new
        {
            porDia,
            topProductos,
            totalProducido = Math.Round(producciones.Sum(p => p.CantidadProducida), 2),
            totalMerma = Math.Round(producciones.Sum(p => p.CantidadMerma), 2),
            totalNeto = Math.Round(producciones.Sum(p => p.cantidadNeta), 2),
            numProducciones = producciones.Count,
            desde = d.ToString("yyyy-MM-dd"),
            hasta = h.ToString("yyyy-MM-dd"),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/reportes/clientes?desde=&hasta=
    // Ranking de clientes por volumen facturado en el rango.
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("clientes")]
    public async Task<IActionResult> GetRankingClientes(
        [FromQuery] DateOnly? desde,
        [FromQuery] DateOnly? hasta,
        CancellationToken ct = default)
    {
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var d = desde ?? hoy.AddDays(-29);
        var h = hasta ?? hoy;

        var facturas = await _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId
                     && f.FechaFactura >= d
                     && f.FechaFactura <= h
                     && f.Estado != EstadoFactura.Cancelada)
            .Include(f => f.Cliente)
            .Select(f => new
            {
                f.ClienteId,
                clienteNombre = f.Cliente != null
                    ? (f.Cliente.RazonSocial ?? (f.Cliente.Nombre + " " + f.Cliente.Apellidos).Trim())
                    : "Sin cliente",
                f.Total,
                f.FechaFactura,
            })
            .ToListAsync(ct);

        var ranking = facturas
            .GroupBy(f => new { f.ClienteId, f.clienteNombre })
            .OrderByDescending(g => g.Sum(x => x.Total))
            .Take(20)
            .Select((g, i) => new
            {
                posicion = i + 1,
                clienteId = g.Key.ClienteId,
                nombre = g.Key.clienteNombre,
                totalFacturado = Math.Round(g.Sum(x => x.Total), 2),
                numFacturas = g.Count(),
                ticketMedio = Math.Round(g.Average(x => x.Total), 2),
                ultimaCompra = g.Max(x => x.FechaFactura).ToString("dd/MM/yyyy"),
            })
            .ToList();

        // Distribución por tipo de cliente (para gráfica de barras por nombre)
        var distribucion = ranking.Take(10).Select(r => new
        {
            r.nombre,
            r.totalFacturado,
            r.numFacturas,
        }).ToList();

        return Ok(new
        {
            ranking,
            distribucion,
            totalClientes = ranking.Count,
            totalFacturado = Math.Round(facturas.Sum(f => f.Total), 2),
            desde = d.ToString("yyyy-MM-dd"),
            hasta = h.ToString("yyyy-MM-dd"),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/reportes/export?tipo=ventas|stock|produccion|clientes
    // Exporta el informe correspondiente en formato Excel (.xlsx)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string tipo = "ventas",
        [FromQuery] DateOnly? desde = null,
        [FromQuery] DateOnly? hasta = null,
        CancellationToken ct = default)
    {
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var d = desde ?? hoy.AddDays(-29);
        var h = hasta ?? hoy;

        using var wb = new XLWorkbook();

        switch (tipo.ToLower())
        {
            case "ventas":
                await ExportVentas(wb, d, h, ct);
                break;
            case "stock":
                await ExportStock(wb, ct);
                break;
            case "produccion":
                await ExportProduccion(wb, d, h, ct);
                break;
            case "clientes":
                await ExportClientes(wb, d, h, ct);
                break;
            case "rotacion":
                await ExportRotacion(wb, d, h, ct);
                break;
            default:
                return BadRequest("tipo no válido. Usa: ventas, stock, produccion, clientes, rotacion");
        }

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        ms.Position = 0;

        var fileName = $"informe_{tipo}_{hoy:yyyyMMdd}.xlsx";
        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
    }

    // ── Export helpers ────────────────────────────────────────────────────────

    private async Task ExportVentas(IXLWorkbook wb, DateOnly desde, DateOnly hasta, CancellationToken ct)
    {
        var facturas = await _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId
                     && f.FechaFactura >= desde && f.FechaFactura <= hasta
                     && f.Estado != EstadoFactura.Cancelada)
            .Include(f => f.Cliente)
            .OrderByDescending(f => f.FechaFactura)
            .ToListAsync(ct);

        var ws = wb.Worksheets.Add("Ventas");

        var headers = new[] { "Fecha", "Nº Factura", "Cliente", "NIF", "Base", "IVA", "Total" };
        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cell(1, i + 1).Value = headers[i];
            ws.Cell(1, i + 1).Style.Font.Bold = true;
            ws.Cell(1, i + 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#1e40af");
            ws.Cell(1, i + 1).Style.Font.FontColor = XLColor.White;
        }

        int row = 2;
        foreach (var f in facturas)
        {
            ws.Cell(row, 1).Value = f.FechaFactura.ToString("dd/MM/yyyy");
            ws.Cell(row, 2).Value = f.NumeroFactura ?? "—";
            ws.Cell(row, 3).Value = f.Cliente?.NombreCompleto ?? f.Cliente?.Nombre ?? "—";
            ws.Cell(row, 4).Value = f.Cliente?.Nif ?? "—";
            ws.Cell(row, 5).Value = (double)f.BaseImponible;
            ws.Cell(row, 6).Value = (double)(f.Total - f.BaseImponible);
            ws.Cell(row, 7).Value = (double)f.Total;
            ws.Cell(row, 5).Style.NumberFormat.Format = "#,##0.00 €";
            ws.Cell(row, 6).Style.NumberFormat.Format = "#,##0.00 €";
            ws.Cell(row, 7).Style.NumberFormat.Format = "#,##0.00 €";
            row++;
        }

        ws.Columns().AdjustToContents();
        ws.Cell(row + 1, 5).Value = "TOTAL";
        ws.Cell(row + 1, 5).Style.Font.Bold = true;
        ws.Cell(row + 1, 7).FormulaA1 = $"=SUM(G2:G{row - 1})";
        ws.Cell(row + 1, 7).Style.Font.Bold = true;
        ws.Cell(row + 1, 7).Style.NumberFormat.Format = "#,##0.00 €";
    }

    private async Task ExportStock(IXLWorkbook wb, CancellationToken ct)
    {
        var stocks = await _uow.Stock.GetQueryable()
            .Where(s => s.EmpresaId == EmpresaId)
            .Include(s => s.Producto)
            .Include(s => s.Lote)
            .OrderBy(s => s.Producto.Nombre).ThenByDescending(s => s.Lote.FechaFabricacion)
            .ToListAsync(ct);

        var ws = wb.Worksheets.Add("Stock");
        var headers = new[] { "Producto", "Código", "Lote", "Fecha fabricación", "Caducidad", "Disponible", "Reservado", "Estado" };
        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cell(1, i + 1).Value = headers[i];
            ws.Cell(1, i + 1).Style.Font.Bold = true;
            ws.Cell(1, i + 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#1e40af");
            ws.Cell(1, i + 1).Style.Font.FontColor = XLColor.White;
        }

        int row = 2;
        foreach (var s in stocks)
        {
            var estado = s.Lote.Bloqueado ? "Bloqueado" :
                s.Lote.FechaCaducidad.HasValue && s.Lote.FechaCaducidad.Value < DateOnly.FromDateTime(DateTime.Today) ? "Caducado" :
                s.CantidadDisponible <= 0 ? "Agotado" : "Activo";

            ws.Cell(row, 1).Value = s.Producto.Nombre;
            ws.Cell(row, 2).Value = s.Producto.Codigo ?? "—";
            ws.Cell(row, 3).Value = s.Lote.CodigoLote;
            ws.Cell(row, 4).Value = s.Lote.FechaFabricacion.ToString("dd/MM/yyyy");
            ws.Cell(row, 5).Value = s.Lote.FechaCaducidad?.ToString("dd/MM/yyyy") ?? "—";
            ws.Cell(row, 6).Value = (double)s.CantidadDisponible;
            ws.Cell(row, 7).Value = (double)s.CantidadReservada;
            ws.Cell(row, 8).Value = estado;

            if (estado == "Caducado")
                ws.Row(row).Style.Fill.BackgroundColor = XLColor.FromHtml("#fef2f2");
            else if (s.CantidadDisponible <= 5 && estado == "Activo")
                ws.Row(row).Style.Fill.BackgroundColor = XLColor.FromHtml("#fffbeb");

            row++;
        }

        ws.Columns().AdjustToContents();
    }

    private async Task ExportProduccion(IXLWorkbook wb, DateOnly desde, DateOnly hasta, CancellationToken ct)
    {
        var producciones = await _uow.Producciones.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId
                     && p.FechaProduccion >= desde && p.FechaProduccion <= hasta
                     && p.Estado != EstadoProduccion.Cancelada)
            .Include(p => p.Producto)
            .OrderByDescending(p => p.FechaProduccion)
            .ToListAsync(ct);

        var ws = wb.Worksheets.Add("Producción");
        var headers = new[] { "Fecha", "Producto", "Producido (ud)", "Merma (ud)", "Neto (ud)", "Estado" };
        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cell(1, i + 1).Value = headers[i];
            ws.Cell(1, i + 1).Style.Font.Bold = true;
            ws.Cell(1, i + 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#1e40af");
            ws.Cell(1, i + 1).Style.Font.FontColor = XLColor.White;
        }

        int row = 2;
        foreach (var p in producciones)
        {
            ws.Cell(row, 1).Value = p.FechaProduccion.ToString("dd/MM/yyyy");
            ws.Cell(row, 2).Value = p.Producto.Nombre;
            ws.Cell(row, 3).Value = (double)p.CantidadProducida;
            ws.Cell(row, 4).Value = (double)p.CantidadMerma;
            ws.Cell(row, 5).Value = (double)p.CantidadNeta;
            ws.Cell(row, 6).Value = p.Estado.ToString();
            row++;
        }

        ws.Columns().AdjustToContents();
    }

    private async Task ExportClientes(IXLWorkbook wb, DateOnly desde, DateOnly hasta, CancellationToken ct)
    {
        var facturas = await _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId
                     && f.FechaFactura >= desde && f.FechaFactura <= hasta
                     && f.Estado != EstadoFactura.Cancelada)
            .Include(f => f.Cliente)
            .ToListAsync(ct);

        var ranking = facturas
            .GroupBy(f => f.ClienteId)
            .Select(g => new
            {
                nombre = g.First().Cliente?.NombreCompleto ?? g.First().Cliente?.Nombre ?? "—",
                nif = g.First().Cliente?.Nif ?? "—",
                totalFacturado = Math.Round(g.Sum(f => f.Total), 2),
                numFacturas = g.Count(),
                ticketMedio = Math.Round(g.Average(f => f.Total), 2),
                ultimaCompra = g.Max(f => f.FechaFactura).ToString("dd/MM/yyyy"),
            })
            .OrderByDescending(r => r.totalFacturado)
            .ToList();

        var ws = wb.Worksheets.Add("Clientes");
        var headers = new[] { "Cliente", "NIF", "Total facturado", "Nº facturas", "Ticket medio", "Última compra" };
        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cell(1, i + 1).Value = headers[i];
            ws.Cell(1, i + 1).Style.Font.Bold = true;
            ws.Cell(1, i + 1).Style.Fill.BackgroundColor = XLColor.FromHtml("#1e40af");
            ws.Cell(1, i + 1).Style.Font.FontColor = XLColor.White;
        }

        int row = 2;
        foreach (var r in ranking)
        {
            ws.Cell(row, 1).Value = r.nombre;
            ws.Cell(row, 2).Value = r.nif;
            ws.Cell(row, 3).Value = (double)r.totalFacturado;
            ws.Cell(row, 4).Value = r.numFacturas;
            ws.Cell(row, 5).Value = (double)r.ticketMedio;
            ws.Cell(row, 6).Value = r.ultimaCompra;
            ws.Cell(row, 3).Style.NumberFormat.Format = "#,##0.00 €";
            ws.Cell(row, 5).Style.NumberFormat.Format = "#,##0.00 €";
            row++;
        }

        ws.Columns().AdjustToContents();
    }

    private async Task ExportRotacion(IXLWorkbook wb, DateOnly desde, DateOnly hasta, CancellationToken ct)
    {
        var ws = wb.Worksheets.Add("Rotación");
        var headers = new[] { "Producto", "Stock actual", "Vendido", "Rotación", "Días cobertura", "Clasificación" };
        for (int i = 0; i < headers.Length; i++)
        {
            ws.Cell(1, i + 1).Value = headers[i];
            ws.Cell(1, i + 1).Style.Font.Bold = true;
            ws.Cell(1, i + 1).Style.Fill.BackgroundColor = XLColor.FromArgb(0xE8, 0xDE, 0xF8);
        }

        var diasPeriodo = (hasta.ToDateTime(TimeOnly.MinValue) - desde.ToDateTime(TimeOnly.MinValue)).TotalDays;
        if (diasPeriodo <= 0) diasPeriodo = 1;

        var productos = await _uow.Productos.GetQueryable()
            .Where(p => p.EmpresaId == EmpresaId && p.Activo)
            .Select(p => new { p.Id, p.Nombre })
            .ToListAsync(ct);

        var stocks = await _uow.Stock.GetQueryable()
            .Where(s => s.EmpresaId == EmpresaId && s.CantidadDisponible > 0)
            .GroupBy(s => s.ProductoId)
            .Select(g => new { ProductoId = g.Key, Disp = g.Sum(s => s.CantidadDisponible) })
            .ToDictionaryAsync(x => x.ProductoId, x => x.Disp, ct);

        var ventas = await _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId && f.FechaFactura >= desde && f.FechaFactura <= hasta)
            .SelectMany(f => f.Lineas)
            .GroupBy(l => l.ProductoId)
            .Select(g => new { ProductoId = g.Key, Vendido = g.Sum(l => l.Cantidad) })
            .ToDictionaryAsync(x => x.ProductoId, x => x.Vendido, ct);

        int row = 2;
        foreach (var p in productos.OrderByDescending(p => ventas.GetValueOrDefault(p.Id, 0)))
        {
            var stockDisp = (double)(stocks.GetValueOrDefault(p.Id, 0));
            var vendido = (double)(ventas.GetValueOrDefault(p.Id, 0));
            var rot = stockDisp > 0 && vendido > 0 ? Math.Round(vendido / stockDisp, 2) : 0;
            var dias = vendido > 0 ? Math.Round(diasPeriodo * stockDisp / vendido, 0) : 0;
            var clasif = vendido == 0 ? "Sin movimiento" : rot >= 2 ? "Alta" : rot >= 1 ? "Media" : "Baja";

            ws.Cell(row, 1).Value = p.Nombre;
            ws.Cell(row, 2).Value = stockDisp;
            ws.Cell(row, 3).Value = vendido;
            ws.Cell(row, 4).Value = rot;
            ws.Cell(row, 5).Value = dias;
            ws.Cell(row, 6).Value = clasif;
            row++;
        }

        ws.Columns().AdjustToContents();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/reportes/rotacion?desde=&hasta=
    // Análisis de rotación de productos: ventas del período vs stock actual.
    //   rotacion       = totalVendido / stockActual  (veces que rota el stock)
    //   diasCobertura  = diasPeriodo * stockActual / totalVendido
    //   clasificacion  = Alta (>2) | Media (1-2) | Baja (<1) | Sin movimiento
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("rotacion")]
    public async Task<IActionResult> GetRotacion(
        [FromQuery] DateOnly? desde,
        [FromQuery] DateOnly? hasta,
        CancellationToken ct = default)
    {
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var d = desde ?? hoy.AddDays(-29);
        var h = hasta ?? hoy;
        var diasPeriodo = (h.ToDateTime(TimeOnly.MinValue) - d.ToDateTime(TimeOnly.MinValue)).TotalDays + 1;

        // Ventas del período (sólo líneas de venta en trazabilidad)
        // NOTA: DateTime debe ser UTC para Npgsql con columna timestamptz
        var desdeUtc = DateTime.SpecifyKind(d.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
        var hastaUtc = DateTime.SpecifyKind(h.ToDateTime(TimeOnly.MaxValue), DateTimeKind.Utc);

        var ventas = await _uow.Trazabilidades.GetQueryable()
            .Where(t => t.EmpresaId == EmpresaId
                     && t.TipoOperacion == "venta_factura"
                     && t.FechaOperacion >= desdeUtc
                     && t.FechaOperacion <= hastaUtc)
            .Include(t => t.Producto)
            .Select(t => new { t.ProductoId, productoNombre = t.Producto.Nombre, t.Cantidad })
            .ToListAsync(ct);

        // Stock actual por producto
        var stockActual = await _uow.Stock.GetQueryable()
            .Where(s => s.EmpresaId == EmpresaId)
            .Include(s => s.Producto)
            .Select(s => new
            {
                s.ProductoId,
                productoNombre = s.Producto.Nombre,
                unidad = s.Producto.UnidadMedida,
                s.CantidadDisponible,
                s.CantidadReservada,
            })
            .ToListAsync(ct);

        // Stock por producto
        var stockPorProducto = stockActual
            .GroupBy(s => new { s.ProductoId, s.productoNombre, s.unidad })
            .ToDictionary(
                g => g.Key.ProductoId,
                g => new
                {
                    nombre = g.Key.productoNombre,
                    unidad = g.Key.unidad,
                    stockDisponible = Math.Round(g.Sum(x => x.CantidadDisponible - x.CantidadReservada), 3),
                });

        // Ventas por producto en el período
        var ventasPorProducto = ventas
            .GroupBy(v => new { v.ProductoId, v.productoNombre })
            .ToDictionary(
                g => g.Key.ProductoId,
                g => new { nombre = g.Key.productoNombre, totalVendido = Math.Round(g.Sum(x => x.Cantidad), 3) });

        // Unir: todos los productos que aparecen en stock o en ventas
        var todosIds = stockPorProducto.Keys.Union(ventasPorProducto.Keys).Distinct();

        var resultado = todosIds.Select(productoId =>
        {
            stockPorProducto.TryGetValue(productoId, out var s);
            ventasPorProducto.TryGetValue(productoId, out var v);

            var nombre     = s?.nombre ?? v?.nombre ?? "—";
            var unidad     = s?.unidad ?? "ud";
            var stockDisp  = s?.stockDisponible ?? 0m;
            var vendido    = v?.totalVendido ?? 0m;

            double rotacion = stockDisp > 0 && vendido > 0
                ? Math.Round((double)(vendido / stockDisp), 2)
                : 0;

            double diasCobertura = vendido > 0
                ? Math.Round(diasPeriodo * (double)stockDisp / (double)vendido, 1)
                : (stockDisp > 0 ? 999.0 : 0.0);

            string clasificacion = vendido == 0
                ? "Sin movimiento"
                : rotacion >= 2 ? "Alta"
                : rotacion >= 1 ? "Media"
                : "Baja";

            return new
            {
                productoId,
                nombre,
                unidad,
                stockActual = (double)stockDisp,
                ventasPeriodo = (double)vendido,
                rotacion,
                diasCobertura = diasCobertura > 900 ? (double?)null : diasCobertura,
                clasificacion,
            };
        })
        .OrderByDescending(r => r.rotacion)
        .ToList();

        var conMovimiento = resultado.Where(r => r.ventasPeriodo > 0).ToList();

        return Ok(new
        {
            items = resultado,
            totalProductos = resultado.Count,
            productosConMovimiento = conMovimiento.Count,
            rotacionMedia = conMovimiento.Count > 0
                ? Math.Round(conMovimiento.Average(r => r.rotacion), 2)
                : 0,
            desde = d.ToString("yyyy-MM-dd"),
            hasta = h.ToString("yyyy-MM-dd"),
            diasPeriodo = (int)diasPeriodo,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/reportes/sanidad?desde=&hasta=&productoId=
    // Informe de trazabilidad para Sanidad (CE 178/2002) — JSON preview
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("sanidad")]
    public async Task<IActionResult> GetSanidad(
        [FromQuery] DateOnly? desde = null,
        [FromQuery] DateOnly? hasta = null,
        [FromQuery] int? productoId = null,
        CancellationToken ct = default)
    {
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var d = desde ?? hoy.AddDays(-29);
        var h = hasta ?? hoy;

        var query = _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId
                     && f.FechaFactura >= d && f.FechaFactura <= h
                     && f.Estado != Domain.Enums.EstadoFactura.Anulada)
            .Include(f => f.Cliente)
            .Include(f => f.Lineas).ThenInclude(l => l.Producto)
            .Include(f => f.Lineas).ThenInclude(l => l.Lote)
            .AsNoTracking();

        var facturas = await query.OrderBy(f => f.FechaFactura).ToListAsync(ct);

        var rows = facturas
            .SelectMany(f => f.Lineas.Where(l => l.LoteId != null && (productoId == null || l.ProductoId == productoId))
                .Select(l => new
                {
                    lote = l.Lote?.CodigoLote ?? "—",
                    producto = l.Producto?.Nombre ?? "—",
                    fechaFabricacion = l.Lote?.FechaFabricacion.ToString("dd/MM/yy") ?? "—",
                    fechaCaducidad = l.Lote?.FechaCaducidad?.ToString("dd/MM/yy") ?? "—",
                    cantidadProducida = l.Lote?.CantidadInicial ?? 0,
                    vendidoA = f.Cliente != null ? (f.Cliente.RazonSocial ?? f.Cliente.Nombre ?? "—") : "—",
                    facturaNumero = f.NumeroFactura ?? $"FAC-{f.Id}",
                    fechaVenta = f.FechaFactura.ToString("dd/MM/yy"),
                    cantidadVendida = l.Cantidad,
                }))
            .ToList();

        return Ok(new
        {
            rows,
            total = rows.Count,
            desde = d.ToString("yyyy-MM-dd"),
            hasta = h.ToString("yyyy-MM-dd"),
        });
    }
}
