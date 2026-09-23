using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Domain.Services;
using ClosedXML;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;


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
/// 6. Descontar stock por cada lote cuando la factura no nace de un pedido ya confirmado
/// 7. Registrar trazabilidad
/// 8. Generar PDF en background
/// </summary>
public class FacturaService : IFacturaService
{
    private const string DiscountOriginToken = "|DTO_ORIGEN:";

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

        // Validar cliente y cargar sus condiciones especiales comerciales
        var cliente = await _uow.Clientes.GetQueryable()
            .Include(c => c.CondicionesEspeciales)
            .FirstOrDefaultAsync(c => c.Id == request.ClienteId && c.EmpresaId == request.EmpresaId, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), request.ClienteId);

        if (cliente.NoRealizarFacturas)
            throw new InvalidOperationException("Este cliente tiene marcado 'No realizar facturas'. No se puede crear una factura.");

        // Resolver origen de la venta: explícito o heredado del pedido
        OrigenStock origen;
        if (request.OrigenStock.HasValue)
        {
            origen = request.OrigenStock.Value;
        }
        else if (request.PedidoId.HasValue)
        {
            var pedidoOrigen = await _uow.Pedidos.GetByIdAsync(request.PedidoId.Value, ct)
                ?? throw new EntidadNotFoundException(nameof(Pedido), request.PedidoId.Value);
            origen = pedidoOrigen.OrigenStock;
        }
        else
        {
            throw new DomainException("Debe indicar el origen de la venta (Fábrica o Furgoneta)");
        }

        // Para cada item, obtener info del producto y asignar lotes FIFO en el origen indicado
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
                    request.EmpresaId, item.ProductoId, item.Cantidad, origen, ct);
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
                PedidoId      = request.PedidoId,
                SerieId       = request.SerieId,
                UsuarioId     = request.UsuarioId,
                NumeroFactura = numeroFactura,
                FechaFactura  = request.FechaFactura,
                FechaVencimiento = fechaVencimiento,
                Estado        = EstadoFactura.Emitida,
                EsSimplificada = request.EsSimplificada,
                Notas         = request.Notas,
                OrigenStock   = origen
            };

            short orden = 0;

            // Crear líneas de factura — una línea por LOTE asignado
            foreach (var (item, producto, lotes) in lineasConLotes)
            {
                var pricing = ComercialPricingPolicy.Resolve(cliente, producto, item.PrecioUnitario, item.Descuento);
                decimal precioUnitario = pricing.PrecioUnitario;

                // B2: preferir el IVA/RE congelado de la línea (pedido/albarán) si viene informado
                decimal ivaPorc = item.IvaPorcentaje ?? GetIvaPorcentaje(cliente, producto);
                decimal rePorc = item.RecargoEquivalenciaPorcentaje
                    ?? (aplicaRE ? GetRecargoEquivalenciaPorcentaje(ivaPorc, tablaRE) : 0m);

                // Precedencia comercial: línea > condición especial > descuento cliente > descuento producto.
                var descuentoEfectivo = pricing.Descuento;
                var origenDescuento = pricing.OrigenDescuento;

                foreach (var lote in lotes)
                {
                    var descripcionLinea = $"{producto.Nombre}" + (lote.LoteId > 0 ? $" (Lote: {lote.CodigoLote})" : "");
                    factura.Lineas.Add(new FacturaLinea
                    {
                        ProductoId  = item.ProductoId,
                        LoteId      = lote.LoteId > 0 ? lote.LoteId : null,
                        Descripcion = $"{descripcionLinea} {BuildDiscountOriginToken(origenDescuento)}".Trim(),
                        Cantidad    = lote.Cantidad,
                        PrecioUnitario = precioUnitario,
                        Descuento   = descuentoEfectivo,
                        IvaPorcentaje = ivaPorc,
                        RecargoEquivalenciaPorcentaje = rePorc,
                        Orden       = orden++
                    });
                }
            }

            // Cabeceras = Σ de los valores de línea redondeados a 2dp (Money.R2)
            // para que pedido, albarán y factura cuadren exactamente al céntimo.
            factura.Subtotal = factura.Lineas.Sum(l => BuenaTierra.Domain.Common.Money.R2(l.Subtotal));
            factura.BaseImponible = factura.Subtotal - factura.DescuentoTotal;
            factura.IvaTotal = factura.Lineas.Sum(l => BuenaTierra.Domain.Common.Money.R2(l.IvaImporte));
            factura.RecargoEquivalenciaTotal = aplicaRE
                ? factura.Lineas.Sum(l => BuenaTierra.Domain.Common.Money.R2(l.RecargoEquivalenciaImporte))
                : 0m;
            factura.RetencionTotal = Math.Round(factura.BaseImponible * retencionPorc / 100, 2);
            factura.Total = factura.BaseImponible + factura.IvaTotal + factura.RecargoEquivalenciaTotal - factura.RetencionTotal;

            // Persistir factura
            await _uow.Facturas.AddAsync(factura, ct);
            await _uow.SaveChangesAsync(ct);

            // Si la factura nace de un pedido confirmado, el stock ya se consumió al confirmar.
            // Aquí solo se libera una posible reserva legacy y se documenta la factura en trazabilidad.
            foreach (var (item, producto, lotes) in lineasConLotes)
            {
                foreach (var lote in lotes.Where(l => l.LoteId > 0))
                {
                    var stock = await _uow.Stock.GetByProductoLoteAsync(
                        request.EmpresaId, item.ProductoId, lote.LoteId, ct)
                        ?? throw new DomainException($"Stock no encontrado: empresa={request.EmpresaId}, producto={item.ProductoId}, lote={lote.LoteId}");

                    if (request.ConsumirStock)
                    {
                        decimal cantidadAntes = stock.CantidadDisponible;
                        stock.Consumir(origen, lote.Cantidad);
                        stock.CantidadReservada = Math.Max(0, stock.CantidadReservada - lote.Cantidad);
                        stock.UpdatedAt = DateTime.UtcNow;
                        await _uow.Stock.UpdateAsync(stock, ct);

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
                    }
                    else if (stock.CantidadReservada > 0)
                    {
                        stock.CantidadReservada = Math.Max(0, stock.CantidadReservada - lote.Cantidad);
                        stock.UpdatedAt = DateTime.UtcNow;
                        await _uow.Stock.UpdateAsync(stock, ct);
                    }

                    // Trazabilidad
                    await _uow.Trazabilidades.AddAsync(new Trazabilidad
                    {
                        EmpresaId = request.EmpresaId,
                        LoteId = lote.LoteId,
                        ProductoId = item.ProductoId,
                        ClienteId = request.ClienteId,
                        FacturaId = factura.Id,
                        Cantidad = lote.Cantidad,
                        TipoOperacion = request.ConsumirStock ? "venta_factura" : "factura_desde_pedido",
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

    private static decimal GetIvaPorcentaje(Cliente cliente, Producto producto)
        => cliente.TipoImpuesto switch
        {
            TipoImpuesto.Exento => 0m,
            TipoImpuesto.IGIC => 7m,
            _ => cliente.AplicarImpuesto ? producto.IvaPorcentaje : 0m
        };

    /// <summary>
    /// Obtiene el porcentaje de RE desde la tabla tipos_iva_re de la empresa.
    /// Si la empresa tiene configuración explícita, no aplica fallback hardcodeado.
    /// Solo usa tasas legales por defecto cuando no existe ninguna tabla configurada.
    /// </summary>
    private static decimal GetRecargoEquivalenciaPorcentaje(
        decimal ivaPorcentaje, Dictionary<decimal, decimal> tablaRE)
    {
        if (tablaRE.TryGetValue(ivaPorcentaje, out var reDesdeDB))
            return reDesdeDB;

        if (tablaRE.Count > 0)
            return 0m;

        // Fallback legal por defecto solo si la empresa no ha configurado tipos_iva_re.
        return ivaPorcentaje switch { 21m => 5.2m, 10m => 1.4m, 4m => 0.5m, _ => 0m };
    }

    private static string BuildDiscountOriginToken(string origin)
        => $"{DiscountOriginToken}{origin}";

    private static string GetDiscountOriginText(FacturaLinea linea, Cliente? cliente, Producto? producto)
    {
        var fromDescription = GetDiscountOriginFromDescription(linea.Descripcion);
        if (fromDescription is not null)
            return fromDescription;

        if (linea.Descuento <= 0)
            return "Sin descuento";

        if (cliente?.DescuentoGeneral > 0 && NearlyEqual(linea.Descuento, cliente.DescuentoGeneral))
            return "Cliente (general)";

        if ((producto?.DescuentoPorDefecto ?? 0m) > 0
            && NearlyEqual(linea.Descuento, producto!.DescuentoPorDefecto!.Value))
            return "Producto (defecto)";

        return "No registrado";
    }

    private static string? GetDiscountOriginFromDescription(string? descripcion)
    {
        if (string.IsNullOrWhiteSpace(descripcion)) return null;

        int idx = descripcion.LastIndexOf(DiscountOriginToken, StringComparison.Ordinal);
        if (idx < 0) return null;

        var token = descripcion[(idx + DiscountOriginToken.Length)..].Trim();
        return token switch
        {
            "linea_manual" => "Línea manual",
            "condicion_especial" => "Condición especial",
            "cliente_general" => "Cliente (general)",
            "producto_defecto" => "Producto (defecto)",
            "sin_descuento" => "Sin descuento",
            _ => "No registrado"
        };
    }

    private static bool NearlyEqual(decimal a, decimal b)
        => Math.Abs(a - b) <= 0.001m;

    public async Task<FacturaDto> GetFacturaAsync(int id, int empresaId, CancellationToken ct = default)    {
        var factura = await _uow.Facturas.GetConLineasAsync(empresaId, id, ct)
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

        var factura = await _uow.Facturas.GetConLineasAsync(empresaId, facturaId, ct)
            ?? throw new EntidadNotFoundException(nameof(Factura), facturaId);

        if (factura.EmpresaId != empresaId)
            throw new DomainException("Acceso no autorizado a esta factura");

        var empresa = await _uow.Empresas.GetByIdAsync(empresaId, ct);
        var cli = factura.Cliente;
        var importeBruto = Math.Round(factura.Lineas.Sum(l => l.Cantidad * l.PrecioUnitario), 2);
        var baseNeta = Math.Round(factura.Lineas.Sum(l => l.Subtotal), 2);
        var descuentoCalculado = Math.Max(0, Math.Round(importeBruto - baseNeta, 2));

        // ── helpers locales ──────────────────────────────────────────────
        static IContainer CellBorder(IContainer c) => c
            .Border(0.5f, Unit.Point).BorderColor("#AAAAAA").Padding(3);

        static IContainer CellBorderRight(IContainer c) => c
            .Border(0.5f, Unit.Point).BorderColor("#AAAAAA").Padding(3).AlignRight();

        static IContainer CellBorderCenter(IContainer c) => c
            .Border(0.5f, Unit.Point).BorderColor("#AAAAAA").Padding(3).AlignCenter();

        static IContainer HeaderCell(IContainer c) => c
            .Background("#EEEEEE").Border(0.5f, Unit.Point).BorderColor("#AAAAAA")
            .Padding(3).AlignCenter();

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(1.2f, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(8).FontFamily("Arial"));

                page.Content().Column(main =>
                {
                    // ═══════════════════════════════════════════════
                    // BLOQUE SUPERIOR: Emisor (derecha) + Datos doc (centro)
                    // ═══════════════════════════════════════════════
                    main.Item().PaddingBottom(4).Row(topRow =>
                    {
                        // Columna vacía izquierda (para el cliente más abajo)
                        topRow.RelativeItem(2);

                        // Datos del cliente — derecha
                        topRow.RelativeItem(3).Border(0.5f, Unit.Point).BorderColor("#AAAAAA")
                            .Padding(6).Column(c =>
                        {
                            c.Item().Text(cli?.RazonSocial ?? cli?.NombreCompleto ?? cli?.Nombre ?? "—")
                                .Bold().FontSize(10);
                            if (!string.IsNullOrWhiteSpace(cli?.Nombre) && cli.Nombre != (cli.RazonSocial ?? cli.Nombre))
                                c.Item().Text(cli.Nombre);
                            if (!string.IsNullOrWhiteSpace(cli?.Direccion))
                                c.Item().Text(cli!.Direccion!);
                            var cpCiudad = string.Join(" ", new[] { cli?.CodigoPostal, cli?.Ciudad }.Where(s => !string.IsNullOrWhiteSpace(s)));
                            if (!string.IsNullOrWhiteSpace(cpCiudad))
                                c.Item().Text(cpCiudad);
                            if (!string.IsNullOrWhiteSpace(cli?.Provincia))
                                c.Item().Text(cli!.Provincia!.ToUpper());
                            if (!string.IsNullOrWhiteSpace(cli?.Nif))
                                c.Item().Text($"NIF/CIF: {cli!.Nif!}");
                            if (!string.IsNullOrWhiteSpace(cli?.Telefono))
                                c.Item().Text($"Tel: {cli!.Telefono!}");
                        });
                    });

                    // ═══════════════════════════════════════════════
                    // BLOQUE MEDIO: Cliente (izq) + Número factura (der)
                    // ═══════════════════════════════════════════════
                    main.Item().PaddingBottom(4).Row(midRow =>
                    {
                        // Datos del emisor — izquierda
                        midRow.RelativeItem(2).Border(0.5f, Unit.Point).BorderColor("#AAAAAA")
                            .Padding(6).Column(c =>
                        {
                            c.Item().Text(empresa?.RazonSocial ?? empresa?.Nombre ?? "")
                                .Bold();
                            if (!string.IsNullOrWhiteSpace(empresa?.RazonSocial)
                                && !string.Equals(empresa.RazonSocial, empresa.Nombre, StringComparison.OrdinalIgnoreCase))
                                c.Item().Text(empresa!.Nombre);
                            if (!string.IsNullOrWhiteSpace(empresa?.Direccion))
                                c.Item().Text(empresa!.Direccion!);
                            var cpCiudad = string.Join(" ", new[] { empresa?.CodigoPostal, empresa?.Ciudad }.Where(s => !string.IsNullOrWhiteSpace(s)));
                            if (!string.IsNullOrWhiteSpace(cpCiudad))
                                c.Item().Text(cpCiudad);
                            if (!string.IsNullOrWhiteSpace(empresa?.Provincia))
                                c.Item().Text(empresa!.Provincia!.ToUpper());
                            if (!string.IsNullOrWhiteSpace(empresa?.Pais))
                                c.Item().Text(empresa!.Pais!);
                            if (!string.IsNullOrWhiteSpace(empresa?.Nif))
                                c.Item().Text($"NIF/CIF: {empresa!.Nif!}");
                            if (!string.IsNullOrWhiteSpace(empresa?.Telefono))
                                c.Item().Text($"Tel: {empresa!.Telefono!}");
                            if (!string.IsNullOrWhiteSpace(empresa?.Email))
                                c.Item().Text($"Email: {empresa!.Email!}");
                            if (!string.IsNullOrWhiteSpace(empresa?.Web))
                                c.Item().Text($"Web: {empresa!.Web!}");
                            if (!string.IsNullOrWhiteSpace(empresa?.NumeroRgseaa))
                                c.Item().Text($"RGSEAA: {empresa!.NumeroRgseaa!}");
                        });

                        midRow.ConstantItem(6);

                        // Número / fecha factura — derecha
                        midRow.RelativeItem(3).Column(c =>
                        {
                            // Fila tipo documento
                            c.Item().Table(t =>
                            {
                                t.ColumnsDefinition(cols =>
                                {
                                    cols.RelativeColumn(2);
                                    cols.RelativeColumn(1);
                                    cols.RelativeColumn(3);
                                    cols.RelativeColumn(1);
                                    cols.RelativeColumn(3);
                                });
                                t.Cell().Element(CellBorder).Text(factura.EsSimplificada ? "Factura Simplificada" : "Factura").Bold();
                                t.Cell().Element(CellBorderCenter).Text(factura.Serie?.Codigo ?? "1");
                                t.Cell().Element(CellBorder).Text(factura.NumeroFactura).Bold();
                                t.Cell().Element(CellBorderCenter).Text("1");
                                t.Cell().Element(CellBorder).Text(factura.FechaFactura.ToString("dd/MM/yyyy"));
                            });

                            c.Item().PaddingTop(2).Table(t =>
                            {
                                t.ColumnsDefinition(cols => { cols.RelativeColumn(2); cols.RelativeColumn(3); });
                                t.Cell().Element(CellBorder).Text("NIF Cliente").Bold();
                                t.Cell().Element(CellBorder).Text(cli?.Nif ?? "—");
                                if (!string.IsNullOrWhiteSpace(cli?.Telefono))
                                {
                                    t.Cell().Element(CellBorder).Text("Teléfono").Bold();
                                    t.Cell().Element(CellBorder).Text(cli!.Telefono!);
                                }
                                if (factura.FechaVencimiento.HasValue)
                                {
                                    t.Cell().Element(CellBorder).Text("Vencimiento").Bold();
                                    t.Cell().Element(CellBorder).Text(factura.FechaVencimiento.Value.ToString("dd/MM/yyyy"));
                                }
                            });
                        });
                    });

                    // ═══════════════════════════════════════════════
                    // TABLA DE LÍNEAS
                    // ═══════════════════════════════════════════════
                    main.Item().PaddingBottom(4).Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.ConstantColumn(35);   // ARTÍCULO
                            cols.RelativeColumn(3);    // NOMBRE
                            cols.ConstantColumn(65);   // LOTE
                            cols.ConstantColumn(70);   // CADUCIDAD
                            cols.ConstantColumn(40);   // CANTIDAD
                            cols.ConstantColumn(55);   // PRECIO UNIDAD
                            cols.ConstantColumn(55);   // SUBTOTAL
                            cols.ConstantColumn(55);   // TOTAL
                        });

                        table.Header(h =>
                        {
                            h.Cell().Element(HeaderCell).Text("ARTÍCULO").Bold().FontSize(7);
                            h.Cell().Element(HeaderCell).Text("NOMBRE").Bold().FontSize(7);
                            h.Cell().Element(HeaderCell).Text("LOTE").Bold().FontSize(7);
                            h.Cell().Element(HeaderCell).Text("CADUCIDAD").Bold().FontSize(7);
                            h.Cell().Element(HeaderCell).Text("CANTIDAD").Bold().FontSize(7);
                            h.Cell().Element(HeaderCell).Text("PRECIO UNIDAD").Bold().FontSize(7);
                            h.Cell().Element(HeaderCell).Text("SUBTOTAL").Bold().FontSize(7);
                            h.Cell().Element(HeaderCell).Text("TOTAL").Bold().FontSize(7);
                        });

                        int lineNum = 1;
                        foreach (var linea in factura.Lineas.OrderBy(l => l.Orden))
                        {
                            string bg = (lineNum % 2 == 0) ? "#F9F9F9" : "#FFFFFF";
                            IContainer Cell(IContainer c) => c.Background(bg).Border(0.5f, Unit.Point).BorderColor("#CCCCCC").Padding(3);
                            IContainer CellR(IContainer c) => c.Background(bg).Border(0.5f, Unit.Point).BorderColor("#CCCCCC").Padding(3).AlignRight();

                            decimal subtotal = Math.Round(linea.Cantidad * linea.PrecioUnitario * (1 - linea.Descuento / 100), 2);

                            string nombre = linea.Producto?.Nombre ?? linea.Descripcion ?? "—";
                            if (linea.Descuento > 0)
                                nombre += $"\nDto: {linea.Descuento:N2}%";

                            string lote = linea.Lote?.CodigoLote ?? "—";
                            string caducidad = linea.Lote?.FechaCaducidad?.ToString("dd/MM/yyyy") ?? "—";

                            table.Cell().Element(Cell).Text(linea.Producto?.Codigo ?? lineNum.ToString()).FontSize(7);
                            table.Cell().Element(Cell).Text(nombre).FontSize(7);
                            table.Cell().Element(Cell).Text(lote).FontSize(7);
                            table.Cell().Element(Cell).Text(caducidad).FontSize(7);
                            table.Cell().Element(CellR).Text($"{linea.Cantidad:N2}").FontSize(7);
                            table.Cell().Element(CellR).Text($"{linea.PrecioUnitario:N2}").FontSize(7);
                            table.Cell().Element(CellR).Text($"{subtotal:N2}").FontSize(7);
                            table.Cell().Element(CellR).Text($"{subtotal:N2}").Bold().FontSize(7);
                            lineNum++;
                        }

                        // Filas vacías para relleno visual (al menos 5 líneas visibles)
                        int emptyRows = Math.Max(0, 5 - factura.Lineas.Count);
                        for (int i = 0; i < emptyRows; i++)
                        {
                            IContainer CellEm(IContainer c) => c.Background("#FFFFFF").Border(0.5f, Unit.Point).BorderColor("#CCCCCC").Padding(6);
                            table.Cell().Element(CellEm).Text(" ");
                            table.Cell().Element(CellEm).Text(" ");
                            table.Cell().Element(CellEm).Text(" ");
                            table.Cell().Element(CellEm).Text(" ");
                            table.Cell().Element(CellEm).Text(" ");
                            table.Cell().Element(CellEm).Text(" ");
                            table.Cell().Element(CellEm).Text(" ");
                            table.Cell().Element(CellEm).Text(" ");
                        }
                    });

                    // ═══════════════════════════════════════════════
                    // PIE DE FACTURA: Totales + Observaciones + Recibí
                    // ═══════════════════════════════════════════════
                    main.Item().Table(footer =>
                    {
                        footer.ColumnsDefinition(cols =>
                        {
                            cols.ConstantColumn(35);  // TIPO IVA
                            cols.ConstantColumn(55);  // IMPORTE
                            cols.ConstantColumn(50);  // DESCUENTO
                            cols.ConstantColumn(50);  // PRONTO PAGO
                            cols.ConstantColumn(40);  // PORTES
                            cols.RelativeColumn();    // espacio
                            cols.ConstantColumn(60);  // BASE
                            cols.ConstantColumn(50);  // I.V.A.
                            cols.ConstantColumn(45);  // R.E.
                        });

                        // Cabecera
                        footer.Cell().Element(HeaderCell).Text("TIPO").Bold().FontSize(7);
                        footer.Cell().Element(HeaderCell).Text("IMPORTE").Bold().FontSize(7);
                        footer.Cell().Element(HeaderCell).Text("DESCUENTO").Bold().FontSize(7);
                        footer.Cell().Element(HeaderCell).Text("PRONTO PAGO").Bold().FontSize(7);
                        footer.Cell().Element(HeaderCell).Text("PORTES").Bold().FontSize(7);
                        footer.Cell().Element(HeaderCell).Text(" ").FontSize(7);
                        footer.Cell().Element(HeaderCell).Text("BASE").Bold().FontSize(7);
                        footer.Cell().Element(HeaderCell).Text("I.V.A.").Bold().FontSize(7);
                        footer.Cell().Element(HeaderCell).Text("R.E.").Bold().FontSize(7);

                        // Fila de totales
                        // Tipos IVA aplicados
                        var tiposIva = factura.Lineas
                            .GroupBy(l => l.IvaPorcentaje)
                            .OrderBy(g => g.Key)
                            .Select(g => $"{g.Key:N0}%")
                            .ToList();
                        string tiposStr = string.Join("\n", tiposIva);

                        footer.Cell().Element(CellBorderCenter).Text(tiposStr).FontSize(7);
                        footer.Cell().Element(CellBorderRight).Text($"{importeBruto:N2}").FontSize(7);
                        footer.Cell().Element(CellBorder).Text(descuentoCalculado > 0 ? $"{descuentoCalculado:N2}" : "").FontSize(7);
                        footer.Cell().Element(CellBorder).Text("").FontSize(7);
                        footer.Cell().Element(CellBorder).Text("").FontSize(7);
                        footer.Cell().Element(CellBorder).Text("").FontSize(7);
                        footer.Cell().Element(CellBorderRight).Text($"{factura.BaseImponible:N2}").FontSize(7).Bold();
                        footer.Cell().Element(CellBorderRight).Text($"{factura.IvaTotal:N2}").FontSize(7);
                        footer.Cell().Element(CellBorderRight).Text(factura.RecargoEquivalenciaTotal > 0 ? $"{factura.RecargoEquivalenciaTotal:N2}" : "").FontSize(7);
                    });

                    // TOTAL + OBSERVACIONES
                    main.Item().PaddingTop(2).Row(totalRow =>
                    {
                        totalRow.RelativeItem(3).Column(c =>
                        {
                            c.Item().Border(0.5f, Unit.Point).BorderColor("#AAAAAA").Padding(4).Column(obs =>
                            {
                                obs.Item().Text("OBSERVACIONES:").FontSize(7).Bold();
                                obs.Item().MinHeight(30).Text(factura.Notas ?? "").FontSize(7);
                            });
                        });
                        totalRow.ConstantItem(8);
                        totalRow.RelativeItem(2).Column(c =>
                        {
                            c.Item().Table(t =>
                            {
                                t.ColumnsDefinition(cols => { cols.RelativeColumn(2); cols.RelativeColumn(2); });
                                t.Cell().Element(HeaderCell).Text("TOTAL:").Bold().FontSize(10);
                                t.Cell().Background("#DDDDDD").Border(0.5f, Unit.Point).BorderColor("#AAAAAA")
                                    .Padding(4).AlignRight()
                                    .Text($"{factura.Total:N2} €").Bold().FontSize(10);
                            });
                        });
                    });

                    // RECIBÍ
                    main.Item().PaddingTop(16).Row(recibiRow =>
                    {
                        recibiRow.RelativeItem().Column(c =>
                        {
                            c.Item().Text(empresa?.RazonSocial ?? empresa?.Nombre ?? "").FontSize(8).Bold().Italic();
                            if (!string.IsNullOrWhiteSpace(empresa?.Nif))
                                c.Item().Text($"C.I.F. {empresa.Nif}").FontSize(7).Italic();
                            c.Item().PaddingTop(4).Text("RECIBI.\u00a0\u00a0\u00a0FECHA _____ / _____ / _____").FontSize(8);
                        });
                        recibiRow.RelativeItem().Column(c =>
                        {
                            c.Item().AlignRight().Text(text =>
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
        });

        return doc.GeneratePdf();
    }

    public async Task<byte[]> GetExcelBytesAsync(int facturaId, int empresaId, CancellationToken ct = default)
    {
        var factura = await _uow.Facturas.GetConLineasAsync(empresaId, facturaId, ct)
            ?? throw new EntidadNotFoundException(nameof(Factura), facturaId);

        if (factura.EmpresaId != empresaId)
            throw new DomainException("Acceso no autorizado a esta factura");

        var empresa = await _uow.Empresas.GetByIdAsync(empresaId, ct);

        using var wb = new XLWorkbook();

        // ── Hoja 1: Resumen Factura ──────────────────────────────────────
        var wsFactura = wb.Worksheets.Add("Factura");
        wsFactura.Cell("A1").Value = "FACTURA";
        wsFactura.Cell("A1").Style.Font.FontSize = 16;
        wsFactura.Cell("A1").Style.Font.Bold = true;

        wsFactura.Cell("A3").Value = "Empresa:";
        wsFactura.Cell("B3").Value = empresa?.RazonSocial ?? empresa?.Nombre;
        wsFactura.Cell("A4").Value = "NIF Empresa:";
        wsFactura.Cell("B4").Value = empresa?.Nif;
        wsFactura.Cell("A5").Value = "Dirección:";
        wsFactura.Cell("B5").Value = $"{empresa?.Direccion}, {empresa?.CodigoPostal} {empresa?.Ciudad}";

        wsFactura.Cell("A7").Value = "Nº Factura:";
        wsFactura.Cell("B7").Value = factura.NumeroFactura;
        wsFactura.Cell("A8").Value = "Fecha:";
        wsFactura.Cell("B8").Value = factura.FechaFactura.ToDateTime(TimeOnly.MinValue);
        wsFactura.Cell("B8").Style.DateFormat.Format = "dd/mm/yyyy";
        wsFactura.Cell("A9").Value = "Estado:";
        wsFactura.Cell("B9").Value = factura.Estado.ToString();
        wsFactura.Cell("A10").Value = "Tipo:";
        wsFactura.Cell("B10").Value = factura.EsSimplificada ? "Factura Simplificada" : "Factura Ordinaria";

        wsFactura.Cell("A12").Value = "Cliente:";
        wsFactura.Cell("B12").Value = factura.Cliente?.NombreCompleto;
        wsFactura.Cell("A13").Value = "NIF Cliente:";
        wsFactura.Cell("B13").Value = factura.Cliente?.Nif;
        wsFactura.Cell("A14").Value = "Dirección Cliente:";
        wsFactura.Cell("B14").Value = $"{factura.Cliente?.Direccion}, {factura.Cliente?.CodigoPostal} {factura.Cliente?.Ciudad}";

        wsFactura.Cell("A16").Value = "Base Imponible:";
        wsFactura.Cell("B16").Value = factura.BaseImponible;
        wsFactura.Cell("B16").Style.NumberFormat.Format = "#,##0.00 €";
        wsFactura.Cell("A17").Value = "IVA Total:";
        wsFactura.Cell("B17").Value = factura.IvaTotal;
        wsFactura.Cell("B17").Style.NumberFormat.Format = "#,##0.00 €";
        wsFactura.Cell("A18").Value = "Recargo Equivalencia:";
        wsFactura.Cell("B18").Value = factura.RecargoEquivalenciaTotal;
        wsFactura.Cell("B18").Style.NumberFormat.Format = "#,##0.00 €";
        wsFactura.Cell("A19").Value = "Retención (-):";
        wsFactura.Cell("B19").Value = factura.RetencionTotal;
        wsFactura.Cell("B19").Style.NumberFormat.Format = "#,##0.00 €";
        wsFactura.Cell("A20").Value = "TOTAL FACTURA:";
        wsFactura.Cell("B20").Value = factura.Total;
        wsFactura.Cell("B20").Style.NumberFormat.Format = "#,##0.00 €";
        wsFactura.Range("A20:B20").Style.Font.Bold = true;

        wsFactura.Column(1).Width = 20;
        wsFactura.Column(2).Width = 35;

        // ── Hoja 2: Líneas con Trazabilidad ─────────────────────────────
        var wsLineas = wb.Worksheets.Add("Trazabilidad Lotes");

        // Título Ministerio de Sanidad
        wsLineas.Cell("A1").Value = "REGISTRO DE TRAZABILIDAD - LÍNEAS DE FACTURA";
        wsLineas.Cell("A1").Style.Font.FontSize = 12;
        wsLineas.Cell("A1").Style.Font.Bold = true;
        wsLineas.Cell("A2").Value = $"Conforme al Reglamento (CE) Nº 178/2002 | Empresa: {empresa?.Nif} | Factura: {factura.NumeroFactura} | Fecha: {factura.FechaFactura:dd/MM/yyyy}";
        wsLineas.Cell("A2").Style.Font.FontSize = 8;
        wsLineas.Cell("A2").Style.Font.Italic = true;

        string[] headers = new[]
        {
            "Nº Línea", "Producto", "Codigo Lote", "Fecha Fabricación", "Fecha Caducidad",
            "Cantidad", "Precio Unitario", "Descuento %", "Origen Descuento", "IVA %", "RE %", "Subtotal s/IVA", "IVA Importe", "RE Importe", "Total Línea",
            "Empresa Vendedora", "NIF Vendedor", "Cliente", "NIF Cliente", "Nº Factura", "Fecha Factura"
        };

        int col = 1;
        foreach (var h in headers)
        {
            wsLineas.Cell(4, col).Value = h;
            wsLineas.Cell(4, col).Style.Font.Bold = true;
            wsLineas.Cell(4, col).Style.Fill.BackgroundColor = XLColor.FromHtml("#E67E22");
            wsLineas.Cell(4, col).Style.Font.FontColor = XLColor.White;
            wsLineas.Cell(4, col).Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            col++;
        }

        int row = 5;
        int lineaNum = 1;
        foreach (var linea in factura.Lineas.OrderBy(l => l.Orden))
        {
            decimal subtotal = Math.Round(linea.Cantidad * linea.PrecioUnitario * (1 - linea.Descuento / 100), 4);
            decimal ivaImporte = Math.Round(subtotal * linea.IvaPorcentaje / 100, 4);
            decimal reImporte = Math.Round(subtotal * linea.RecargoEquivalenciaPorcentaje / 100, 4);

            wsLineas.Cell(row, 1).Value = lineaNum++;
            wsLineas.Cell(row, 2).Value = linea.Producto?.Nombre ?? linea.Descripcion;
            wsLineas.Cell(row, 3).Value = linea.Lote?.CodigoLote ?? "";
            if (linea.Lote != null)
            {
                wsLineas.Cell(row, 4).Value = linea.Lote.FechaFabricacion.ToDateTime(TimeOnly.MinValue);
                if (linea.Lote.FechaCaducidad.HasValue)
                    wsLineas.Cell(row, 5).Value = linea.Lote.FechaCaducidad.Value.ToDateTime(TimeOnly.MinValue);
            }
            wsLineas.Cell(row, 4).Style.DateFormat.Format = "dd/mm/yyyy";
            wsLineas.Cell(row, 5).Style.DateFormat.Format = "dd/mm/yyyy";
            wsLineas.Cell(row, 6).Value = linea.Cantidad;
            wsLineas.Cell(row, 6).Style.NumberFormat.Format = "#,##0.00";
            wsLineas.Cell(row, 7).Value = linea.PrecioUnitario;
            wsLineas.Cell(row, 7).Style.NumberFormat.Format = "#,##0.0000 €";
            wsLineas.Cell(row, 8).Value = linea.Descuento / 100;
            wsLineas.Cell(row, 8).Style.NumberFormat.Format = "0.00%";
            wsLineas.Cell(row, 9).Value = GetDiscountOriginText(linea, factura.Cliente, linea.Producto);
            wsLineas.Cell(row, 10).Value = linea.IvaPorcentaje / 100;
            wsLineas.Cell(row, 10).Style.NumberFormat.Format = "0.00%";
            wsLineas.Cell(row, 11).Value = linea.RecargoEquivalenciaPorcentaje / 100;
            wsLineas.Cell(row, 11).Style.NumberFormat.Format = "0.00%";
            wsLineas.Cell(row, 12).Value = subtotal;
            wsLineas.Cell(row, 12).Style.NumberFormat.Format = "#,##0.0000 €";
            wsLineas.Cell(row, 13).Value = ivaImporte;
            wsLineas.Cell(row, 13).Style.NumberFormat.Format = "#,##0.0000 €";
            wsLineas.Cell(row, 14).Value = reImporte;
            wsLineas.Cell(row, 14).Style.NumberFormat.Format = "#,##0.0000 €";
            wsLineas.Cell(row, 15).Value = subtotal + ivaImporte + reImporte;
            wsLineas.Cell(row, 15).Style.NumberFormat.Format = "#,##0.0000 €";
            wsLineas.Cell(row, 16).Value = empresa?.RazonSocial ?? empresa?.Nombre;
            wsLineas.Cell(row, 17).Value = empresa?.Nif;
            wsLineas.Cell(row, 18).Value = factura.Cliente?.NombreCompleto;
            wsLineas.Cell(row, 19).Value = factura.Cliente?.Nif;
            wsLineas.Cell(row, 20).Value = factura.NumeroFactura;
            wsLineas.Cell(row, 21).Value = factura.FechaFactura.ToDateTime(TimeOnly.MinValue);
            wsLineas.Cell(row, 21).Style.DateFormat.Format = "dd/mm/yyyy";

            // Alternar color fila
            if (row % 2 == 0)
            {
                var range = wsLineas.Range(row, 1, row, headers.Length);
                range.Style.Fill.BackgroundColor = XLColor.FromHtml("#FCF3E9");
            }

            row++;
        }

        // Autofit
        wsLineas.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    public async Task<byte[]> GetExcelTrazabilidadAsync(int empresaId, DateOnly desde, DateOnly hasta, CancellationToken ct = default)
    {
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

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Trazabilidad");

        ws.Cell("A1").Value = "INFORME DE TRAZABILIDAD ALIMENTARIA";
        ws.Cell("A1").Style.Font.FontSize = 14;
        ws.Cell("A1").Style.Font.Bold = true;
        ws.Cell("A2").Value = $"Empresa: {empresa?.RazonSocial ?? empresa?.Nombre} | NIF: {empresa?.Nif} | Período: {desde:dd/MM/yyyy} - {hasta:dd/MM/yyyy}";
        ws.Cell("A2").Style.Font.FontSize = 9;
        ws.Cell("A2").Style.Font.Italic = true;
        ws.Cell("A3").Value = "Conforme al Reglamento (CE) Nº 178/2002 del Parlamento Europeo y del Consejo";
        ws.Cell("A3").Style.Font.FontSize = 8;
        ws.Cell("A3").Style.Font.Italic = true;
        ws.Cell("A3").Style.Font.FontColor = XLColor.Gray;

        string[] headers = new[]
        {
            "Fecha Operación", "Tipo Operación", "Producto", "Nº Lote", "Fecha Fabricación",
            "Fecha Caducidad", "Cantidad", "Cliente", "NIF Cliente", "Nº Factura", "Fecha Factura", "Datos Adicionales"
        };

        int col = 1;
        foreach (var h in headers)
        {
            ws.Cell(5, col).Value = h;
            ws.Cell(5, col).Style.Font.Bold = true;
            ws.Cell(5, col).Style.Fill.BackgroundColor = XLColor.FromHtml("#E67E22");
            ws.Cell(5, col).Style.Font.FontColor = XLColor.White;
            ws.Cell(5, col).Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            col++;
        }

        int row = 6;
        foreach (var t in trazabilidades)
        {
            ws.Cell(row, 1).Value = t.FechaOperacion.ToLocalTime();
            ws.Cell(row, 1).Style.DateFormat.Format = "dd/mm/yyyy hh:mm";
            ws.Cell(row, 2).Value = t.TipoOperacion;
            ws.Cell(row, 3).Value = t.Producto?.Nombre;
            ws.Cell(row, 4).Value = t.Lote?.CodigoLote;
            if (t.Lote != null)
            {
                ws.Cell(row, 5).Value = t.Lote.FechaFabricacion.ToDateTime(TimeOnly.MinValue);
                if (t.Lote.FechaCaducidad.HasValue)
                    ws.Cell(row, 6).Value = t.Lote.FechaCaducidad.Value.ToDateTime(TimeOnly.MinValue);
            }
            ws.Cell(row, 5).Style.DateFormat.Format = "dd/mm/yyyy";
            ws.Cell(row, 6).Style.DateFormat.Format = "dd/mm/yyyy";
            ws.Cell(row, 7).Value = t.Cantidad;
            ws.Cell(row, 7).Style.NumberFormat.Format = "#,##0.00";
            ws.Cell(row, 8).Value = t.Cliente?.NombreCompleto;
            ws.Cell(row, 9).Value = t.Cliente?.Nif;
            ws.Cell(row, 10).Value = t.Factura?.NumeroFactura;
            if (t.Factura != null)
            {
                ws.Cell(row, 11).Value = t.Factura.FechaFactura.ToDateTime(TimeOnly.MinValue);
                ws.Cell(row, 11).Style.DateFormat.Format = "dd/mm/yyyy";
            }
            ws.Cell(row, 12).Value = t.DatosAdicionales;

            if (row % 2 == 0)
            {
                var range = ws.Range(row, 1, row, headers.Length);
                range.Style.Fill.BackgroundColor = XLColor.FromHtml("#FCF3E9");
            }

            row++;
        }

        ws.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
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
        RecargoEquivalenciaTotal = f.RecargoEquivalenciaTotal,
        RetencionTotal = f.RetencionTotal,
        Total = f.Total,
        FechaVencimiento = f.FechaVencimiento,
        PdfUrl = f.PdfUrl,
        OrigenStock = f.OrigenStock.ToString(),
        Lineas = f.Lineas.OrderBy(l => l.Orden).Select(l => new FacturaLineaDto
        {
            ProductoId = l.ProductoId,
            ProductoNombre = l.Producto?.Nombre ?? StripDiscountOriginToken(l.Descripcion) ?? "",
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

    private static string? StripDiscountOriginToken(string? descripcion)
    {
        if (string.IsNullOrWhiteSpace(descripcion)) return descripcion;
        int idx = descripcion.LastIndexOf(DiscountOriginToken, StringComparison.Ordinal);
        return idx >= 0 ? descripcion[..idx].Trim() : descripcion;
    }
}
