using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QuestPDF;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
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

        var desdeUtc = DateTime.SpecifyKind(desdeVal.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
        var hastaUtc = DateTime.SpecifyKind(hastaVal.ToDateTime(TimeOnly.MaxValue), DateTimeKind.Utc);

        var registros = await _uow.Trazabilidades
            .GetQueryable()
            .Where(t => t.EmpresaId == EmpresaId
                     && t.FechaOperacion >= desdeUtc
                     && t.FechaOperacion <= hastaUtc)
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
            .Where(t => loteIds.Contains(t.LoteId) && t.TipoOperacion == "venta_factura")
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

    // ── GET /api/trazabilidad/lote/{loteId} ──────────────────────────────────
    /// Trazabilidad JSON para un lote: qué clientes recibieron producto de este lote.
    [HttpGet("lote/{loteId:int}")]
    public async Task<IActionResult> GetByLote(int loteId, CancellationToken ct)
    {
        var lote = await _uow.Lotes.GetQueryable()
            .Where(l => l.Id == loteId && l.EmpresaId == EmpresaId)
            .Include(l => l.Producto)
            .Include(l => l.Stock)
            .FirstOrDefaultAsync(ct);
        if (lote is null) return NotFound();

        // Trazabilidades de venta + facturas directas con este lote
        var trazas = await _uow.Trazabilidades.GetQueryable()
            .Where(t => t.LoteId == loteId && t.TipoOperacion == "venta_factura")
            .Include(t => t.Cliente)
            .Include(t => t.Factura)
            .OrderBy(t => t.FechaOperacion)
            .ToListAsync(ct);

        // También buscar facturas que contengan líneas de este lote
        // (for direct seeds without trazabilidad records)
        var facturasConLote = await _uow.Facturas.GetQueryable()
            .Where(f => f.EmpresaId == EmpresaId && f.Lineas.Any(l => l.LoteId == loteId))
            .Include(f => f.Lineas.Where(l => l.LoteId == loteId))
            .Include(f => f.Cliente)
            .ToListAsync(ct);

        var facturaClienteData = facturasConLote
            .Where(f => !trazas.Any(t => t.ClienteId == f.ClienteId))
            .Select(f => new { ClienteId = f.ClienteId, Cantidad = f.Lineas.Sum(l => l.Cantidad), ClienteNombre = f.Cliente?.NombreCompleto ?? f.Cliente?.Nombre ?? "—" });

        // Combinar datos de trazabilidades y factura-líneas
        var clienteData = trazas
            .Where(t => t.ClienteId.HasValue)
            .Select(t => new { ClienteId = t.ClienteId!.Value, t.Cantidad, ClienteNombre = t.Cliente?.NombreCompleto ?? t.Cliente?.Nombre ?? "—" })
            .Concat(facturaClienteData)
            .GroupBy(x => x.ClienteId)
            .Select(g => new
            {
                clienteId = g.Key,
                nombreCliente = g.First().ClienteNombre,
                cantidad = g.Sum(x => x.Cantidad),
            }).ToList();

        return Ok(new { success = true, data = clienteData });
    }

    // ── GET /api/trazabilidad/lote/{loteId}/recall-pdf ───────────────────────
    /// PDF de recall: para un lote dado, genera un informe con todos los clientes
    /// que recibieron producto de ese lote, incluyendo cantidades y facturas.
    [HttpGet("lote/{loteId:int}/recall-pdf")]
    public async Task<IActionResult> GetRecallPdf(int loteId, CancellationToken ct)
    {
        var lote = await _uow.Lotes.GetQueryable()
            .Where(l => l.Id == loteId && l.EmpresaId == EmpresaId)
            .Include(l => l.Producto)
            .Include(l => l.Stock)
            .FirstOrDefaultAsync(ct);
        if (lote is null) return NotFound();

        var empresa = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);

        // Todas las trazabilidades de venta para este lote
        var trazas = await _uow.Trazabilidades.GetQueryable()
            .Where(t => t.LoteId == loteId && t.TipoOperacion == "venta_factura")
            .Include(t => t.Cliente)
            .Include(t => t.Factura)
            .OrderBy(t => t.FechaOperacion)
            .ToListAsync(ct);

        // Agrupar por cliente
        var clientesAfectados = trazas
            .Where(t => t.ClienteId.HasValue)
            .GroupBy(t => t.ClienteId)
            .Select(g => new
            {
                Nombre = g.First().Cliente?.NombreCompleto ?? g.First().Cliente?.Nombre ?? "—",
                Nif = g.First().Cliente?.Nif ?? "—",
                Telefono = g.First().Cliente?.Telefono,
                TotalUnidades = g.Sum(t => t.Cantidad),
                Facturas = string.Join(", ", g.Where(t => t.Factura != null).Select(t => t.Factura!.NumeroFactura).Distinct()),
                PrimeraVenta = g.Min(t => t.FechaOperacion),
                UltimaVenta = g.Max(t => t.FechaOperacion),
            }).ToList();

        // Generar PDF con QuestPDF
        Settings.License = LicenseType.Community;

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(1.5f, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Arial"));

                // ─── HEADER ───────────────────────────────────────────
                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text(empresa?.RazonSocial ?? empresa?.Nombre ?? "BuenaTierra")
                                .Bold().FontSize(14);
                            if (empresa != null)
                            {
                                c.Item().Text($"NIF: {empresa.Nif}");
                                if (empresa.Direccion != null)
                                    c.Item().Text(empresa.Direccion);
                                if (empresa.Ciudad != null)
                                    c.Item().Text($"{empresa.CodigoPostal} {empresa.Ciudad} ({empresa.Provincia})");
                            }
                        });

                        row.ConstantItem(220).Column(c =>
                        {
                            c.Item().AlignRight().Text("INFORME RECALL / RETIRADA")
                                .Bold().FontSize(14).FontColor("#C0392B");
                            c.Item().AlignRight().Text($"Fecha: {DateTime.Now:dd/MM/yyyy HH:mm}").FontSize(8);
                        });
                    });

                    col.Item().PaddingTop(5).LineHorizontal(2).LineColor("#C0392B");

                    // Datos del lote
                    col.Item().PaddingTop(10).Background("#FFF3F3").Padding(10).Column(c =>
                    {
                        c.Item().Text("DATOS DEL LOTE AFECTADO").Bold().FontSize(10).FontColor("#C0392B");
                        c.Spacing(3);
                        c.Item().Text($"Producto: {lote.Producto?.Nombre ?? "—"}").FontSize(9);
                        c.Item().Text($"Código producto: {lote.Producto?.Codigo ?? "—"}").FontSize(9);
                        c.Item().Text($"Nº Lote: {lote.CodigoLote}").Bold().FontSize(10);
                        c.Item().Text($"Fecha fabricación: {lote.FechaFabricacion:dd/MM/yyyy}").FontSize(9);
                        c.Item().Text($"Fecha caducidad: {lote.FechaCaducidad?.ToString("dd/MM/yyyy") ?? "N/A"}").FontSize(9);
                        c.Item().Text($"Cantidad producida: {lote.CantidadInicial:N2}").FontSize(9);
                        c.Item().Text($"Stock actual: {lote.Stock?.CantidadDisponible ?? 0:N2}").FontSize(9);
                        c.Item().Text($"Estado: {EstadoLote(lote.Bloqueado, lote.FechaCaducidad, lote.Stock?.CantidadDisponible)}").FontSize(9);
                    });

                    col.Item().PaddingTop(8).LineHorizontal(0.5f).LineColor("#DDDDDD");
                });

                // ─── CONTENT ──────────────────────────────────────────
                page.Content().PaddingTop(10).Column(col =>
                {
                    col.Item().Text($"CLIENTES AFECTADOS ({clientesAfectados.Count})")
                        .Bold().FontSize(11);
                    col.Item().PaddingTop(4);

                    if (clientesAfectados.Count == 0)
                    {
                        col.Item().Text("No se han encontrado ventas registradas para este lote.")
                            .FontSize(9).FontColor("#888888").Italic();
                    }
                    else
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(cols =>
                            {
                                cols.RelativeColumn(3);     // Nombre
                                cols.RelativeColumn(1.5f);  // NIF
                                cols.ConstantColumn(55);    // Cantidad
                                cols.RelativeColumn(2.5f);  // Facturas
                                cols.RelativeColumn(1.5f);  // Primera venta
                                cols.RelativeColumn(1.5f);  // Última venta
                            });

                            static IContainer HeaderCell(IContainer container) =>
                                container.Background("#C0392B").Padding(4).AlignCenter();

                            table.Header(header =>
                            {
                                header.Cell().Element(HeaderCell).Text("Cliente").Bold().FontColor(Colors.White).FontSize(8);
                                header.Cell().Element(HeaderCell).Text("NIF/CIF").Bold().FontColor(Colors.White).FontSize(8);
                                header.Cell().Element(HeaderCell).Text("Cantidad").Bold().FontColor(Colors.White).FontSize(8);
                                header.Cell().Element(HeaderCell).Text("Facturas").Bold().FontColor(Colors.White).FontSize(8);
                                header.Cell().Element(HeaderCell).Text("Primera venta").Bold().FontColor(Colors.White).FontSize(8);
                                header.Cell().Element(HeaderCell).Text("Última venta").Bold().FontColor(Colors.White).FontSize(8);
                            });

                            bool odd = true;
                            foreach (var cli in clientesAfectados.OrderByDescending(c => c.TotalUnidades))
                            {
                                string bg = odd ? "#FFFFFF" : "#FFF8F8";
                                odd = !odd;

                                IContainer BodyCell(IContainer c) => c.Background(bg).Padding(3);
                                IContainer BodyCellRight(IContainer c) => c.Background(bg).Padding(3).AlignRight();

                                table.Cell().Element(BodyCell).Text(cli.Nombre).FontSize(8);
                                table.Cell().Element(BodyCell).Text(cli.Nif).FontSize(8);
                                table.Cell().Element(BodyCellRight).Text($"{cli.TotalUnidades:N2}").FontSize(8).Bold();
                                table.Cell().Element(BodyCell).Text(cli.Facturas).FontSize(7);
                                table.Cell().Element(BodyCell).Text($"{cli.PrimeraVenta:dd/MM/yyyy}").FontSize(8);
                                table.Cell().Element(BodyCell).Text($"{cli.UltimaVenta:dd/MM/yyyy}").FontSize(8);
                            }
                        });

                        // Totales
                        col.Item().PaddingTop(10).Background("#F5F5F5").Padding(8).Row(row =>
                        {
                            row.RelativeItem().Text($"Total unidades distribuidas: {clientesAfectados.Sum(c => c.TotalUnidades):N2}")
                                .Bold().FontSize(9);
                            row.RelativeItem().AlignRight()
                                .Text($"Total clientes afectados: {clientesAfectados.Count}")
                                .Bold().FontSize(9);
                        });
                    }
                });

                // ─── FOOTER ───────────────────────────────────────────
                page.Footer().Column(col =>
                {
                    col.Item().LineHorizontal(0.5f).LineColor("#DDDDDD");
                    col.Item().PaddingTop(4).Row(row =>
                    {
                        row.RelativeItem().Text(
                            "Informe generado conforme al Reglamento (CE) Nº 178/2002 del Parlamento Europeo " +
                            "y al Sistema de Alerta Rápida para Alimentos y Piensos (RASFF). " +
                            "Documento válido para comunicación con autoridades sanitarias.")
                            .FontSize(6).FontColor("#888888").Italic();
                        row.ConstantItem(60).AlignRight().Text(text =>
                        {
                            text.Span("Página ").FontSize(7).FontColor("#888888");
                            text.CurrentPageNumber().FontSize(7).FontColor("#888888");
                            text.Span(" / ").FontSize(7).FontColor("#888888");
                            text.TotalPages().FontSize(7).FontColor("#888888");
                        });
                    });
                });
            });
        });

        var bytes = doc.GeneratePdf();
        return File(bytes, "application/pdf", $"recall_lote_{lote.CodigoLote}.pdf");
    }
}
