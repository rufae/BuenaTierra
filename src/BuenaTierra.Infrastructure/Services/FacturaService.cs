using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using OfficeOpenXml;
using OfficeOpenXml.Style;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using DrawingColor = System.Drawing.Color;


namespace BuenaTierra.Infrastructure.Services;

/// <summary>
/// Servicio de facturación con asignación automática de lotes FIFO.
///
/// Flujo de CrearFactura:
/// 1. Validar cliente, serie, productos
/// 2. Por cada item del request → llamar a LoteAsignacionService.AsignarLotesAsync()
/// 3. Crear una FacturaLinea por cada lote asignado (pueden ser varias por producto)
/// 4. Calcular totales
/// 5. Persistir en transacción ACID
/// 6. Descontar stock por cada lote
/// 7. Registrar trazabilidad
/// 8. Generar PDF en background
/// </summary>
public class FacturaService : IFacturaService
{
    private readonly IUnitOfWork _uow;
    private readonly ILoteAsignacionService _loteService;
    private readonly ISerieFacturacionService _serieService;
    private readonly ILogger<FacturaService> _logger;

    public FacturaService(
        IUnitOfWork uow,
        ILoteAsignacionService loteService,
        ISerieFacturacionService serieService,
        ILogger<FacturaService> logger)
    {
        _uow = uow;
        _loteService = loteService;
        _serieService = serieService;
        _logger = logger;
    }

    public async Task<FacturaCreada> CrearFacturaAsync(CrearFacturaRequest request, CancellationToken ct = default)
    {
        _logger.LogInformation("Creando factura: empresa={EmpresaId}, cliente={ClienteId}, items={Items}",
            request.EmpresaId, request.ClienteId, request.Items.Count);

        // Validar cliente
        var cliente = await _uow.Clientes.GetByIdAsync(request.ClienteId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), request.ClienteId);

        // Para cada item, obtener info del producto y asignar lotes FIFO
        var lineasConLotes = new List<(LineaFacturaRequest Item, Producto Producto, List<LoteAsignado> Lotes)>();

        foreach (var item in request.Items)
        {
            var producto = await _uow.Productos.GetByIdAsync(item.ProductoId, ct)
                ?? throw new EntidadNotFoundException(nameof(Producto), item.ProductoId);

            List<LoteAsignado> lotesAsignados;

            if (producto.RequiereLote)
            {
                // FIFO automático — aquí está la magia del sistema
                lotesAsignados = await _loteService.AsignarLotesAsync(
                    request.EmpresaId, item.ProductoId, item.Cantidad, ct);
            }
            else
            {
                // Producto sin lote (ej: servicio, artículo no trazable)
                lotesAsignados = [new LoteAsignado(0, "", item.ProductoId, item.Cantidad, DateOnly.MinValue, null)];
            }

            lineasConLotes.Add((item, producto, lotesAsignados));
        }

        // Iniciar transacción ACID
        await _uow.BeginTransactionAsync(ct);

        try
        {
            // RE y retención del cliente
            bool aplicaRE = cliente.TipoImpuesto == TipoImpuesto.RecargoEquivalencia
                         || cliente.RecargoEquivalencia;
            decimal retencionPorc = !cliente.NoAplicarRetenciones && cliente.PorcentajeRetencion > 0
                ? cliente.PorcentajeRetencion : 0m;

            // Cargar tabla de RE desde BD para la empresa (en vez de hardcoded)
            var tablaRE = aplicaRE
                ? (await _uow.TiposIvaRe.FindAsync(t => t.EmpresaId == request.EmpresaId && t.Activo, ct))
                    .ToDictionary(t => t.IvaPorcentaje, t => t.RecargoEquivalenciaPorcentaje)
                : new Dictionary<decimal, decimal>();

            // Obtener número de factura
            string numeroFactura = await _serieService.SiguienteNumeroAsync(
                request.EmpresaId, request.SerieId, ct);

            // Calcular fecha de vencimiento automática desde DiasPago del cliente
            DateOnly? fechaVencimiento = cliente.DiasPago > 0
                ? request.FechaFactura.AddDays(cliente.DiasPago)
                : null;

            // Crear cabecera de factura
            var factura = new Factura
            {
                EmpresaId     = request.EmpresaId,
                ClienteId     = request.ClienteId,
                SerieId       = request.SerieId,
                UsuarioId     = request.UsuarioId,
                NumeroFactura = numeroFactura,
                FechaFactura  = request.FechaFactura,
                FechaVencimiento = fechaVencimiento,
                Estado        = EstadoFactura.Emitida,
                EsSimplificada = request.EsSimplificada,
                Notas         = request.Notas
            };

            short orden = 0;

            // Crear líneas de factura — una línea por LOTE asignado
            foreach (var (item, producto, lotes) in lineasConLotes)
            {
                decimal precioUnitario = item.PrecioUnitario ?? producto.PrecioVenta;
                decimal rePorc = aplicaRE ? GetRecargoEquivalenciaPorcentaje(producto.IvaPorcentaje, tablaRE) : 0m;
                // Aplicar descuento de la línea; fallback al descuento general del cliente
                decimal descuentoEfectivo = item.Descuento > 0 ? item.Descuento : cliente.DescuentoGeneral;

                foreach (var lote in lotes)
                {
                    factura.Lineas.Add(new FacturaLinea
                    {
                        ProductoId  = item.ProductoId,
                        LoteId      = lote.LoteId > 0 ? lote.LoteId : null,
                        Descripcion = $"{producto.Nombre}" + (lote.LoteId > 0 ? $" (Lote: {lote.CodigoLote})" : ""),
                        Cantidad    = lote.Cantidad,
                        PrecioUnitario = precioUnitario,
                        Descuento   = descuentoEfectivo,
                        IvaPorcentaje = producto.IvaPorcentaje,
                        RecargoEquivalenciaPorcentaje = rePorc,
                        Orden       = orden++
                    });
                }
            }

            // Calcular totales desde las líneas (que ya llevan el descuento efectivo)
            factura.Subtotal = factura.Lineas.Sum(l => l.Subtotal);
            factura.BaseImponible = factura.Subtotal - factura.DescuentoTotal;
            factura.IvaTotal = factura.Lineas.Sum(l => l.IvaImporte);
            factura.RecargoEquivalenciaTotal = aplicaRE
                ? Math.Round(factura.Lineas.Sum(l => l.Subtotal * l.RecargoEquivalenciaPorcentaje / 100), 2)
                : 0m;
            factura.RetencionTotal = Math.Round(factura.BaseImponible * retencionPorc / 100, 2);
            factura.Total = factura.BaseImponible + factura.IvaTotal + factura.RecargoEquivalenciaTotal - factura.RetencionTotal;

            // Persistir factura
            await _uow.Facturas.AddAsync(factura, ct);
            await _uow.SaveChangesAsync(ct);

            // Descontar stock y registrar trazabilidad para cada línea con lote
            foreach (var (item, producto, lotes) in lineasConLotes)
            {
                foreach (var lote in lotes.Where(l => l.LoteId > 0))
                {
                    // Descontar stock
                    var stock = await _uow.Stock.GetByProductoLoteAsync(
                        request.EmpresaId, item.ProductoId, lote.LoteId, ct)
                        ?? throw new DomainException($"Stock no encontrado: empresa={request.EmpresaId}, producto={item.ProductoId}, lote={lote.LoteId}");

                    decimal cantidadAntes = stock.CantidadDisponible;
                    stock.CantidadDisponible -= lote.Cantidad;
                    stock.UpdatedAt = DateTime.UtcNow;
                    await _uow.Stock.UpdateAsync(stock, ct);

                    // Movimiento de stock
                    await _uow.MovimientosStock.AddAsync(new MovimientoStock
                    {
                        EmpresaId = request.EmpresaId,
                        ProductoId = item.ProductoId,
                        LoteId = lote.LoteId,
                        Tipo = TipoMovimientoStock.Venta,
                        Cantidad = lote.Cantidad,
                        CantidadAntes = cantidadAntes,
                        CantidadDespues = stock.CantidadDisponible,
                        ReferenciaTipo = "factura",
                        ReferenciaId = factura.Id,
                        UsuarioId = request.UsuarioId
                    }, ct);

                    // Trazabilidad
                    await _uow.Trazabilidades.AddAsync(new Trazabilidad
                    {
                        EmpresaId = request.EmpresaId,
                        LoteId = lote.LoteId,
                        ProductoId = item.ProductoId,
                        ClienteId = request.ClienteId,
                        FacturaId = factura.Id,
                        Cantidad = lote.Cantidad,
                        TipoOperacion = "venta_factura",
                        FechaOperacion = DateTime.UtcNow,
                        UsuarioId = request.UsuarioId
                    }, ct);
                }
            }

            await _uow.SaveChangesAsync(ct);
            await _uow.CommitTransactionAsync(ct);

            _logger.LogInformation("Factura {NumeroFactura} creada correctamente (id={FacturaId}, total={Total})",
                numeroFactura, factura.Id, factura.Total);

            return new FacturaCreada(factura.Id, numeroFactura, factura.Total);
        }
        catch
        {
            await _uow.RollbackTransactionAsync(ct);
            throw;
        }
    }

    /// <summary>
    /// Obtiene el porcentaje de RE desde la tabla tipos_iva_re de la empresa.
    /// Si no hay match en BD, aplica las tasas legales por defecto (España).
    /// </summary>
    private static decimal GetRecargoEquivalenciaPorcentaje(
        decimal ivaPorcentaje, Dictionary<decimal, decimal> tablaRE)
    {
        if (tablaRE.TryGetValue(ivaPorcentaje, out var reDesdeDB))
            return reDesdeDB;
        // Fallback hardcoded (tasas legales España vigentes)
        return ivaPorcentaje switch { 21m => 5.2m, 10m => 1.4m, 4m => 0.5m, _ => 0m };
    }

    public async Task<FacturaDto> GetFacturaAsync(int id, int empresaId, CancellationToken ct = default)    {
        var factura = await _uow.Facturas.GetConLineasAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Factura), id);

        if (factura.EmpresaId != empresaId)
            throw new DomainException("Acceso no autorizado a esta factura");

        var empresa = await _uow.Empresas.GetByIdAsync(empresaId, ct);
        return MapToDto(factura, empresa);
    }

    public async Task<IEnumerable<FacturaDto>> GetListAsync(int empresaId, DateOnly? desde, DateOnly? hasta, CancellationToken ct = default)
    {
        var facturas = await _uow.Facturas.GetByEmpresaAsync(empresaId, desde, hasta, ct);
        return facturas.Select(f => MapToDto(f, null));
    }

    public Task<string> GenerarPdfAsync(int facturaId, CancellationToken ct = default)
        => Task.FromResult($"/api/facturas/{facturaId}/pdf");

    public async Task<byte[]> GetPdfBytesAsync(int facturaId, int empresaId, CancellationToken ct = default)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var factura = await _uow.Facturas.GetConLineasAsync(facturaId, ct)
            ?? throw new EntidadNotFoundException(nameof(Factura), facturaId);

        if (factura.EmpresaId != empresaId)
            throw new DomainException("Acceso no autorizado a esta factura");

        var empresa = await _uow.Empresas.GetByIdAsync(empresaId, ct);

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(1.5f, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Arial"));

                // ─── HEADER ───────────────────────────────────────────────
                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        // Empresa info (izquierda)
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
                                if (empresa.Telefono != null)
                                    c.Item().Text($"Tel: {empresa.Telefono}");
                                if (empresa.Email != null)
                                    c.Item().Text(empresa.Email);
                            }
                        });

                        // Título FACTURA (derecha)
                        row.ConstantItem(200).Column(c =>
                        {
                            c.Item().AlignRight().Text(factura.EsSimplificada ? "FACTURA SIMPLIFICADA" : "FACTURA")
                                .Bold().FontSize(18).FontColor("#E67E22");
                            c.Item().AlignRight().Text($"Nº: {factura.NumeroFactura}").Bold().FontSize(11);
                            c.Item().AlignRight().Text($"Fecha: {factura.FechaFactura:dd/MM/yyyy}");
                            if (factura.FechaVencimiento.HasValue)
                                c.Item().AlignRight().Text($"Vencimiento: {factura.FechaVencimiento.Value:dd/MM/yyyy}")
                                    .FontColor("#C0392B");
                            c.Item().AlignRight().Text($"Forma de pago: {factura.Cliente?.FormaPago.ToString() ?? "Contado"}");
                            c.Item().AlignRight().Text($"Estado: {factura.Estado}");
                        });
                    });

                    col.Item().PaddingTop(5).LineHorizontal(1).LineColor("#E67E22");

                    // Cliente
                    col.Item().PaddingTop(8).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("CLIENTE").Bold().FontSize(8).FontColor("#888888");
                            c.Item().Text(factura.Cliente?.NombreCompleto ?? "—").Bold();
                            if (factura.Cliente?.Nif != null)
                                c.Item().Text($"NIF/CIF: {factura.Cliente.Nif}");
                            if (factura.Cliente?.Direccion != null)
                                c.Item().Text(factura.Cliente.Direccion);
                            if (factura.Cliente?.Ciudad != null)
                                c.Item().Text($"{factura.Cliente.CodigoPostal} {factura.Cliente.Ciudad}");
                        });
                    });

                    col.Item().PaddingTop(8).LineHorizontal(0.5f).LineColor("#DDDDDD");
                });

                // ─── CONTENT ──────────────────────────────────────────────
                page.Content().PaddingTop(10).Column(col =>
                {
                    // Tabla de líneas
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(3);   // Producto
                            cols.RelativeColumn(2);   // Nº Lote
                            cols.RelativeColumn(1.5f); // F. Fabricación
                            cols.RelativeColumn(1.5f); // F. Caducidad
                            cols.ConstantColumn(45);  // Cantidad
                            cols.ConstantColumn(55);  // Precio
                            cols.ConstantColumn(35);  // Dto%
                            cols.ConstantColumn(35);  // IVA%
                            cols.ConstantColumn(60);  // Total
                        });

                        // Cabecera tabla
                        static IContainer HeaderCell(IContainer container) =>
                            container.Background("#E67E22").Padding(4).AlignCenter();

                        table.Header(header =>
                        {
                            header.Cell().Element(HeaderCell).Text("Producto").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Nº Lote").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("F. Fabricación").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("F. Caducidad").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Cant.").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Precio").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Dto%").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("IVA%").Bold().FontColor(Colors.White).FontSize(8);
                            header.Cell().Element(HeaderCell).Text("Total").Bold().FontColor(Colors.White).FontSize(8);
                        });

                        // Filas
                        bool odd = true;
                        foreach (var linea in factura.Lineas.OrderBy(l => l.Orden))
                        {
                            string bg = odd ? "#FFFFFF" : "#F9F9F9";
                            odd = !odd;

                            IContainer BodyCell(IContainer c) => c.Background(bg).Padding(3);
                            IContainer BodyCellRight(IContainer c) => c.Background(bg).Padding(3).AlignRight();

                            decimal subtotal = Math.Round(linea.Cantidad * linea.PrecioUnitario * (1 - linea.Descuento / 100), 2);

                            table.Cell().Element(BodyCell).Text(linea.Producto?.Nombre ?? linea.Descripcion ?? "").FontSize(8);
                            table.Cell().Element(BodyCell).Text(linea.Lote?.CodigoLote ?? "—").FontSize(8);
                            table.Cell().Element(BodyCell).Text(linea.Lote?.FechaFabricacion.ToString("dd/MM/yyyy") ?? "—").FontSize(8);
                            table.Cell().Element(BodyCell).Text(linea.Lote?.FechaCaducidad?.ToString("dd/MM/yyyy") ?? "—").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.Cantidad:N2}").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.PrecioUnitario:N4} €").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.Descuento:N1}%").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{linea.IvaPorcentaje:N0}%").FontSize(8);
                            table.Cell().Element(BodyCellRight).Text($"{subtotal:N2} €").FontSize(8).Bold();
                        }
                    });

                    // Totales
                    col.Item().PaddingTop(12).AlignRight().Table(totales =>
                    {
                        totales.ColumnsDefinition(c =>
                        {
                            c.ConstantColumn(130);
                            c.ConstantColumn(80);
                        });

                        IContainer TotalLabel(IContainer c) => c.Background("#F5F5F5").Padding(4).AlignRight();
                        IContainer TotalValue(IContainer c) => c.Background("#FFFFFF").Padding(4).AlignRight().BorderLeft(0.5f, Unit.Point).BorderColor("#DDDDDD");
                        IContainer TotalLabelBold(IContainer c) => c.Background("#E67E22").Padding(4).AlignRight();
                        IContainer TotalValueBold(IContainer c) => c.Background("#E67E22").Padding(4).AlignRight();

                        totales.Cell().Element(TotalLabel).Text("Base Imponible:").FontSize(9);
                        totales.Cell().Element(TotalValue).Text($"{factura.BaseImponible:N2} €").FontSize(9);

                        totales.Cell().Element(TotalLabel).Text("IVA:").FontSize(9);
                        totales.Cell().Element(TotalValue).Text($"{factura.IvaTotal:N2} €").FontSize(9);

                        if (factura.RecargoEquivalenciaTotal > 0)
                        {
                            totales.Cell().Element(TotalLabel).Text("Recargo Equivalencia:").FontSize(9);
                            totales.Cell().Element(TotalValue).Text($"{factura.RecargoEquivalenciaTotal:N2} €").FontSize(9);
                        }

                        if (factura.RetencionTotal > 0)
                        {
                            totales.Cell().Element(TotalLabel).Text("Retención (-):").FontSize(9);
                            totales.Cell().Element(TotalValue).Text($"-{factura.RetencionTotal:N2} €").FontSize(9).FontColor("#C0392B");
                        }

                        totales.Cell().Element(TotalLabelBold).Text("TOTAL:").Bold().FontSize(11).FontColor(Colors.White);
                        totales.Cell().Element(TotalValueBold).Text($"{factura.Total:N2} €").Bold().FontSize(11).FontColor(Colors.White);
                    });

                    // Notas
                    if (!string.IsNullOrWhiteSpace(factura.Notas))
                    {
                        col.Item().PaddingTop(12).Column(c =>
                        {
                            c.Item().Text("Notas:").Bold().FontSize(8).FontColor("#888888");
                            c.Item().Text(factura.Notas).FontSize(8);
                        });
                    }
                });

                // ─── FOOTER ───────────────────────────────────────────────
                page.Footer().Column(col =>
                {
                    col.Item().LineHorizontal(0.5f).LineColor("#DDDDDD");
                    col.Item().PaddingTop(4).Row(row =>
                    {
                        row.RelativeItem().Text(
                            "Trazabilidad conforme al Reglamento (CE) Nº 178/2002 del Parlamento Europeo. " +
                            "Los lotes indicados permiten la trazabilidad completa del producto.")
                            .FontSize(7).FontColor("#888888").Italic();
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

        return doc.GeneratePdf();
    }

    public async Task<byte[]> GetExcelBytesAsync(int facturaId, int empresaId, CancellationToken ct = default)
    {
        ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");

        var factura = await _uow.Facturas.GetConLineasAsync(facturaId, ct)
            ?? throw new EntidadNotFoundException(nameof(Factura), facturaId);

        if (factura.EmpresaId != empresaId)
            throw new DomainException("Acceso no autorizado a esta factura");

        var empresa = await _uow.Empresas.GetByIdAsync(empresaId, ct);

        using var package = new ExcelPackage();

        // ── Hoja 1: Resumen Factura ──────────────────────────────────────
        var wsFactura = package.Workbook.Worksheets.Add("Factura");
        wsFactura.Cells["A1"].Value = "FACTURA";
        wsFactura.Cells["A1"].Style.Font.Size = 16;
        wsFactura.Cells["A1"].Style.Font.Bold = true;

        wsFactura.Cells["A3"].Value = "Empresa:";
        wsFactura.Cells["B3"].Value = empresa?.RazonSocial ?? empresa?.Nombre;
        wsFactura.Cells["A4"].Value = "NIF Empresa:";
        wsFactura.Cells["B4"].Value = empresa?.Nif;
        wsFactura.Cells["A5"].Value = "Dirección:";
        wsFactura.Cells["B5"].Value = $"{empresa?.Direccion}, {empresa?.CodigoPostal} {empresa?.Ciudad}";

        wsFactura.Cells["A7"].Value = "Nº Factura:";
        wsFactura.Cells["B7"].Value = factura.NumeroFactura;
        wsFactura.Cells["A8"].Value = "Fecha:";
        wsFactura.Cells["B8"].Value = factura.FechaFactura.ToDateTime(TimeOnly.MinValue);
        wsFactura.Cells["B8"].Style.Numberformat.Format = "dd/mm/yyyy";
        wsFactura.Cells["A9"].Value = "Estado:";
        wsFactura.Cells["B9"].Value = factura.Estado.ToString();
        wsFactura.Cells["A10"].Value = "Tipo:";
        wsFactura.Cells["B10"].Value = factura.EsSimplificada ? "Factura Simplificada" : "Factura Ordinaria";

        wsFactura.Cells["A12"].Value = "Cliente:";
        wsFactura.Cells["B12"].Value = factura.Cliente?.NombreCompleto;
        wsFactura.Cells["A13"].Value = "NIF Cliente:";
        wsFactura.Cells["B13"].Value = factura.Cliente?.Nif;
        wsFactura.Cells["A14"].Value = "Dirección Cliente:";
        wsFactura.Cells["B14"].Value = $"{factura.Cliente?.Direccion}, {factura.Cliente?.CodigoPostal} {factura.Cliente?.Ciudad}";

        wsFactura.Cells["A16"].Value = "Base Imponible:";
        wsFactura.Cells["B16"].Value = factura.BaseImponible;
        wsFactura.Cells["B16"].Style.Numberformat.Format = "#,##0.00 €";
        wsFactura.Cells["A17"].Value = "IVA Total:";
        wsFactura.Cells["B17"].Value = factura.IvaTotal;
        wsFactura.Cells["B17"].Style.Numberformat.Format = "#,##0.00 €";
        wsFactura.Cells["A18"].Value = "TOTAL FACTURA:";
        wsFactura.Cells["B18"].Value = factura.Total;
        wsFactura.Cells["B18"].Style.Numberformat.Format = "#,##0.00 €";
        wsFactura.Cells["A18:B18"].Style.Font.Bold = true;

        wsFactura.Column(1).Width = 20;
        wsFactura.Column(2).Width = 35;

        // ── Hoja 2: Líneas con Trazabilidad ─────────────────────────────
        var wsLineas = package.Workbook.Worksheets.Add("Trazabilidad Lotes");

        // Título Ministerio de Sanidad
        wsLineas.Cells["A1"].Value = "REGISTRO DE TRAZABILIDAD - LÍNEAS DE FACTURA";
        wsLineas.Cells["A1"].Style.Font.Size = 12;
        wsLineas.Cells["A1"].Style.Font.Bold = true;
        wsLineas.Cells["A2"].Value = $"Conforme al Reglamento (CE) Nº 178/2002 | Empresa: {empresa?.Nif} | Factura: {factura.NumeroFactura} | Fecha: {factura.FechaFactura:dd/MM/yyyy}";
        wsLineas.Cells["A2"].Style.Font.Size = 8;
        wsLineas.Cells["A2"].Style.Font.Italic = true;

        string[] headers = new[]
        {
            "Nº Línea", "Producto", "Codigo Lote", "Fecha Fabricación", "Fecha Caducidad",
            "Cantidad", "Precio Unitario", "Descuento %", "IVA %", "Subtotal s/IVA", "IVA Importe", "Total Línea",
            "Empresa Vendedora", "NIF Vendedor", "Cliente", "NIF Cliente", "Nº Factura", "Fecha Factura"
        };

        int col = 1;
        foreach (var h in headers)
        {
            wsLineas.Cells[4, col].Value = h;
            wsLineas.Cells[4, col].Style.Font.Bold = true;
            wsLineas.Cells[4, col].Style.Fill.PatternType = ExcelFillStyle.Solid;
            wsLineas.Cells[4, col].Style.Fill.BackgroundColor.SetColor(DrawingColor.FromArgb(230, 126, 34));
            wsLineas.Cells[4, col].Style.Font.Color.SetColor(DrawingColor.White);
            wsLineas.Cells[4, col].Style.Border.BorderAround(ExcelBorderStyle.Thin);
            col++;
        }

        int row = 5;
        int lineaNum = 1;
        foreach (var linea in factura.Lineas.OrderBy(l => l.Orden))
        {
            decimal subtotal = Math.Round(linea.Cantidad * linea.PrecioUnitario * (1 - linea.Descuento / 100), 4);
            decimal ivaImporte = Math.Round(subtotal * linea.IvaPorcentaje / 100, 4);

            wsLineas.Cells[row, 1].Value = lineaNum++;
            wsLineas.Cells[row, 2].Value = linea.Producto?.Nombre ?? linea.Descripcion;
            wsLineas.Cells[row, 3].Value = linea.Lote?.CodigoLote ?? "";
            wsLineas.Cells[row, 4].Value = linea.Lote != null ? linea.Lote.FechaFabricacion.ToDateTime(TimeOnly.MinValue) : (object)"";
            wsLineas.Cells[row, 4].Style.Numberformat.Format = "dd/mm/yyyy";
            wsLineas.Cells[row, 5].Value = linea.Lote?.FechaCaducidad.HasValue == true
                ? linea.Lote.FechaCaducidad.Value.ToDateTime(TimeOnly.MinValue) : (object)"";
            wsLineas.Cells[row, 5].Style.Numberformat.Format = "dd/mm/yyyy";
            wsLineas.Cells[row, 6].Value = linea.Cantidad;
            wsLineas.Cells[row, 6].Style.Numberformat.Format = "#,##0.00";
            wsLineas.Cells[row, 7].Value = linea.PrecioUnitario;
            wsLineas.Cells[row, 7].Style.Numberformat.Format = "#,##0.0000 €";
            wsLineas.Cells[row, 8].Value = linea.Descuento;
            wsLineas.Cells[row, 8].Style.Numberformat.Format = "0.00%";
            wsLineas.Cells[row, 9].Value = linea.IvaPorcentaje / 100;
            wsLineas.Cells[row, 9].Style.Numberformat.Format = "0%";
            wsLineas.Cells[row, 10].Value = subtotal;
            wsLineas.Cells[row, 10].Style.Numberformat.Format = "#,##0.0000 €";
            wsLineas.Cells[row, 11].Value = ivaImporte;
            wsLineas.Cells[row, 11].Style.Numberformat.Format = "#,##0.0000 €";
            wsLineas.Cells[row, 12].Value = subtotal + ivaImporte;
            wsLineas.Cells[row, 12].Style.Numberformat.Format = "#,##0.0000 €";
            wsLineas.Cells[row, 13].Value = empresa?.RazonSocial ?? empresa?.Nombre;
            wsLineas.Cells[row, 14].Value = empresa?.Nif;
            wsLineas.Cells[row, 15].Value = factura.Cliente?.NombreCompleto;
            wsLineas.Cells[row, 16].Value = factura.Cliente?.Nif;
            wsLineas.Cells[row, 17].Value = factura.NumeroFactura;
            wsLineas.Cells[row, 18].Value = factura.FechaFactura.ToDateTime(TimeOnly.MinValue);
            wsLineas.Cells[row, 18].Style.Numberformat.Format = "dd/mm/yyyy";

            // Alternar color fila
            if (row % 2 == 0)
            {
                var range = wsLineas.Cells[row, 1, row, headers.Length];
                range.Style.Fill.PatternType = ExcelFillStyle.Solid;
                range.Style.Fill.BackgroundColor.SetColor(DrawingColor.FromArgb(252, 243, 233));
            }

            row++;
        }

        // Autofit
        for (int c = 1; c <= headers.Length; c++)
            wsLineas.Column(c).AutoFit();

        return package.GetAsByteArray();
    }

    public async Task<byte[]> GetExcelTrazabilidadAsync(int empresaId, DateOnly desde, DateOnly hasta, CancellationToken ct = default)
    {
        ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");

        var empresa = await _uow.Empresas.GetByIdAsync(empresaId, ct);

        // Cargar registros de trazabilidad con nav props
        var desdeUtc = DateTime.SpecifyKind(desde.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
        var hastaUtc = DateTime.SpecifyKind(hasta.ToDateTime(TimeOnly.MaxValue), DateTimeKind.Utc);

        var trazabilidades = await _uow.Trazabilidades
            .GetQueryable()
            .Where(t => t.EmpresaId == empresaId
                     && t.FechaOperacion >= desdeUtc
                     && t.FechaOperacion <= hastaUtc)
            .Include(t => t.Lote)
            .Include(t => t.Producto)
            .Include(t => t.Cliente)
            .Include(t => t.Factura)
            .OrderByDescending(t => t.FechaOperacion)
            .ToListAsync(ct);

        using var package = new ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Trazabilidad");

        ws.Cells["A1"].Value = "INFORME DE TRAZABILIDAD ALIMENTARIA";
        ws.Cells["A1"].Style.Font.Size = 14;
        ws.Cells["A1"].Style.Font.Bold = true;
        ws.Cells["A2"].Value = $"Empresa: {empresa?.RazonSocial ?? empresa?.Nombre} | NIF: {empresa?.Nif} | Período: {desde:dd/MM/yyyy} - {hasta:dd/MM/yyyy}";
        ws.Cells["A2"].Style.Font.Size = 9;
        ws.Cells["A2"].Style.Font.Italic = true;
        ws.Cells["A3"].Value = "Conforme al Reglamento (CE) Nº 178/2002 del Parlamento Europeo y del Consejo";
        ws.Cells["A3"].Style.Font.Size = 8;
        ws.Cells["A3"].Style.Font.Italic = true;
        ws.Cells["A3"].Style.Font.Color.SetColor(DrawingColor.Gray);

        string[] headers = new[]
        {
            "Fecha Operación", "Tipo Operación", "Producto", "Nº Lote", "Fecha Fabricación",
            "Fecha Caducidad", "Cantidad", "Cliente", "NIF Cliente", "Nº Factura", "Fecha Factura", "Datos Adicionales"
        };

        int col = 1;
        foreach (var h in headers)
        {
            ws.Cells[5, col].Value = h;
            ws.Cells[5, col].Style.Font.Bold = true;
            ws.Cells[5, col].Style.Fill.PatternType = ExcelFillStyle.Solid;
            ws.Cells[5, col].Style.Fill.BackgroundColor.SetColor(DrawingColor.FromArgb(230, 126, 34));
            ws.Cells[5, col].Style.Font.Color.SetColor(DrawingColor.White);
            ws.Cells[5, col].Style.Border.BorderAround(ExcelBorderStyle.Thin);
            col++;
        }

        int row = 6;
        foreach (var t in trazabilidades)
        {
            ws.Cells[row, 1].Value = t.FechaOperacion.ToLocalTime();
            ws.Cells[row, 1].Style.Numberformat.Format = "dd/mm/yyyy hh:mm";
            ws.Cells[row, 2].Value = t.TipoOperacion;
            ws.Cells[row, 3].Value = t.Producto?.Nombre;
            ws.Cells[row, 4].Value = t.Lote?.CodigoLote;
            ws.Cells[row, 5].Value = t.Lote != null ? t.Lote.FechaFabricacion.ToDateTime(TimeOnly.MinValue) : (object)"";
            ws.Cells[row, 5].Style.Numberformat.Format = "dd/mm/yyyy";
            ws.Cells[row, 6].Value = t.Lote?.FechaCaducidad.HasValue == true
                ? t.Lote.FechaCaducidad.Value.ToDateTime(TimeOnly.MinValue) : (object)"";
            ws.Cells[row, 6].Style.Numberformat.Format = "dd/mm/yyyy";
            ws.Cells[row, 7].Value = t.Cantidad;
            ws.Cells[row, 7].Style.Numberformat.Format = "#,##0.00";
            ws.Cells[row, 8].Value = t.Cliente?.NombreCompleto;
            ws.Cells[row, 9].Value = t.Cliente?.Nif;
            ws.Cells[row, 10].Value = t.Factura?.NumeroFactura;
            ws.Cells[row, 11].Value = t.Factura != null ? t.Factura.FechaFactura.ToDateTime(TimeOnly.MinValue) : (object)"";
            ws.Cells[row, 11].Style.Numberformat.Format = "dd/mm/yyyy";
            ws.Cells[row, 12].Value = t.DatosAdicionales;

            if (row % 2 == 0)
            {
                var range = ws.Cells[row, 1, row, headers.Length];
                range.Style.Fill.PatternType = ExcelFillStyle.Solid;
                range.Style.Fill.BackgroundColor.SetColor(DrawingColor.FromArgb(252, 243, 233));
            }

            row++;
        }

        for (int c = 1; c <= headers.Length; c++)
            ws.Column(c).AutoFit();

        return package.GetAsByteArray();
    }

    private static FacturaDto MapToDto(Factura f, Empresa? empresa) => new()
    {
        Id = f.Id,
        NumeroFactura = f.NumeroFactura,
        FechaFactura = f.FechaFactura,
        Estado = f.Estado.ToString(),
        EsSimplificada = f.EsSimplificada,
        Empresa = empresa != null ? new EmpresaInfo(
            empresa.Nombre, empresa.Nif, empresa.RazonSocial,
            empresa.Direccion, empresa.CodigoPostal, empresa.Ciudad,
            empresa.Telefono, empresa.Email) : null,
        Cliente = new ClienteResumen(f.Cliente?.Id ?? 0, f.Cliente?.NombreCompleto ?? "", f.Cliente?.Nif),
        BaseImponible = f.BaseImponible,
        IvaTotal = f.IvaTotal,
        Total = f.Total,
        FechaVencimiento = f.FechaVencimiento,
        PdfUrl = f.PdfUrl,
        Lineas = f.Lineas.OrderBy(l => l.Orden).Select(l => new FacturaLineaDto
        {
            ProductoId = l.ProductoId,
            ProductoNombre = l.Producto?.Nombre ?? l.Descripcion ?? "",
            CodigoLote = l.Lote?.CodigoLote,
            FechaFabricacion = l.Lote?.FechaFabricacion,
            FechaCaducidad = l.Lote?.FechaCaducidad,
            Cantidad = l.Cantidad,
            PrecioUnitario = l.PrecioUnitario,
            Descuento = l.Descuento,
            IvaPorcentaje = l.IvaPorcentaje,
            Subtotal = Math.Round(l.Cantidad * l.PrecioUnitario * (1 - l.Descuento / 100), 4),
            IvaImporte = Math.Round(l.Cantidad * l.PrecioUnitario * (1 - l.Descuento / 100) * l.IvaPorcentaje / 100, 4)
        }).ToList()
    };
}
