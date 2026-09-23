using BuenaTierra.IntegrationTests.Infrastructure;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Text;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Tests de runtime de los 4 botones de Facturación (LOOP 4):
/// plantilla, exportar listado (sin fechas = TODAS, incluye facturas antiguas),
/// PDF individual y Excel individual con trazabilidad.
/// Verifican que la migración EPPlus → ClosedXML funciona de verdad.
/// </summary>
public class FacturaExportIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public FacturaExportIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    private (int ProductoId, int ClienteId, int SerieId) SeedData()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var empresaId = ctx.Empresas.First().Id;
        var userId = ctx.Usuarios.First().Id;

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId = empresaId,
            Nombre = $"Producto Export {Guid.NewGuid():N}",
            PrecioVenta = 3.00m,
            IvaPorcentaje = 10,
            Activo = true,
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            CodigoLote = $"EXP-{Guid.NewGuid():N}".Substring(0, 10),
            FechaFabricacion = hoy.AddDays(-2),
            FechaCaducidad = hoy.AddDays(60),
            CantidadInicial = 50,
        };
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            LoteId = lote.Id,
            CantidadDisponible = 50,
            CantidadReservada = 0,
            CantidadFurgoneta = 0,
        });

        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre = $"Cliente Export {Guid.NewGuid():N}",
            Email = $"export-{Guid.NewGuid():N}@test.com",
            Tipo = BuenaTierra.Domain.Enums.TipoCliente.Empresa,
            Activo = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();

        var serie = ctx.SeriesFacturacion.First(s => s.EmpresaId == empresaId);
        return (producto.Id, cliente.Id, serie.Id);
    }

    private async Task<int> CrearFacturaAsync(HttpClient client, int productoId, int clienteId, int serieId, int unidades = 5)
    {
        var res = await client.PostAsJsonAsync("/api/facturas/crear", new
        {
            clienteId,
            serieId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = unidades } },
        });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<FacturaCreadaEnvelope>();
        return body!.Data.FacturaId;
    }

    [Fact]
    public async Task Plantilla_Devuelve200ConXlsx()
    {
        var client = await _factory.CreateAuthenticatedClientAsync();
        var res = await client.GetAsync("/api/facturas/importar-plantilla");

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        res.Content.Headers.ContentType!.MediaType.Should().Contain("spreadsheetml");
        var bytes = await res.Content.ReadAsByteArrayAsync();
        bytes.Length.Should().BeGreaterThan(1000, "el xlsx de plantilla no puede estar vacío");
        // Firma ZIP/OOXML de un .xlsx
        Encoding.ASCII.GetString(bytes, 0, 2).Should().Be("PK");

        // Contenido: cabeceras exactas + fila de ejemplo
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(bytes));
        var ws = wb.Worksheet(1);
        ws.Cell(1, 1).GetString().Should().Be("NumeroFactura");
        ws.Cell(1, 5).GetString().Should().Be("Total");
        ws.Cell(2, 1).GetString().Should().Be("F2026001");
        ws.Cell(2, 4).GetString().Should().Be("Panadería Demo");
    }

    [Fact]
    public async Task ExportarExcel_SinFechas_ExportaTODAS_IncluidaFacturaAntigua()
    {
        var (productoId, clienteId, serieId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        // Crear una factura HOY y verificar que también existe una de hace 2 años
        // (antes el default solo exportaba los últimos 30 días → bug del botón).
        await CrearFacturaAsync(client, productoId, clienteId, serieId);

        var numeroAntigua = $"FACT-ANT-{Guid.NewGuid():N}".Substring(0, 20);
        using (var scope = _factory.Services.CreateScope())
        {
            var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var empresaId = ctx.Empresas.First().Id;
            var serieIdDb = ctx.SeriesFacturacion.First(s => s.EmpresaId == empresaId).Id;
            var clienteAntiguoId = ctx.Clientes
                .Where(c => c.EmpresaId == empresaId)
                .OrderByDescending(c => c.Id)
                .Select(c => c.Id)
                .First();

            var facturaAntigua = new BuenaTierra.Domain.Entities.Factura
            {
                EmpresaId = empresaId,
                ClienteId = clienteAntiguoId,
                SerieId = serieIdDb,
                UsuarioId = ctx.Usuarios.First().Id,
                NumeroFactura = numeroAntigua,
                FechaFactura = DateOnly.FromDateTime(DateTime.Today.AddYears(-2)),
                Estado = BuenaTierra.Domain.Enums.EstadoFactura.Emitida,
                BaseImponible = 10m,
                Total = 11m,
            };
            ctx.Facturas.Add(facturaAntigua);
            ctx.SaveChanges();
        }

        var client2 = await _factory.CreateAuthenticatedClientAsync();
        var res = await client2.GetAsync("/api/facturas/exportar-excel");

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var bytes = await res.Content.ReadAsByteArrayAsync();
        bytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(bytes, 0, 2).Should().Be("PK",
            "el contenido debe ser un xlsx válido (ZIP)");

        // Sin fechas → nombre simple (sin rango): se exporta TODO el histórico
        var contentDisposition = res.Content.Headers.ContentDisposition?.FileName?.ToString() ?? "";
        contentDisposition.Should().Be("facturas.xlsx");

        // Contenido: cabecera + la factura de hace 2 años DEBE aparecer (antes solo exportaba 30 días)
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(bytes));
        var ws = wb.Worksheet(1);
        ws.Cell(1, 1).GetString().Should().Be("Nº Factura");
        ws.CellsUsed().Any(c => c.GetString() == numeroAntigua).Should().BeTrue(
            because: "una factura de hace 2 años debe incluirse cuando no se envían fechas");
    }

    [Fact]
    public async Task PdfIndividual_Devuelve200ConPdf()
    {
        var (productoId, clienteId, serieId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();
        var facturaId = await CrearFacturaAsync(client, productoId, clienteId, serieId);

        var res = await client.GetAsync($"/api/facturas/{facturaId}/pdf");

        res.StatusCode.Should().Be(HttpStatusCode.OK, because: "QuestPDF debe generar el PDF sin excepción");
        res.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");
        var bytes = await res.Content.ReadAsByteArrayAsync();
        bytes.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(bytes, 0, 4).Should().Be("%PDF", "debe empezar por la cabecera PDF");
    }

    [Fact]
    public async Task ExcelIndividual_Devuelve200Con2HojasValidas()
    {
        var (productoId, clienteId, serieId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();
        var facturaId = await CrearFacturaAsync(client, productoId, clienteId, serieId);

        var res = await client.GetAsync($"/api/facturas/{facturaId}/excel");

        res.StatusCode.Should().Be(HttpStatusCode.OK, because: "ClosedXML debe generar el Excel sin excepción");
        res.Content.Headers.ContentType!.MediaType.Should().Contain("spreadsheetml");
        var bytes = await res.Content.ReadAsByteArrayAsync();
        bytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(bytes, 0, 2).Should().Be("PK");

        // Contenido: 2 hojas con sus títulos y la factura rellena
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(bytes));
        wb.Worksheets.Count.Should().Be(2, because: "hoja resumen + hoja de trazabilidad de lotes");
        wb.Worksheet("Factura").Cell("A1").GetString().Should().Be("FACTURA");
        wb.Worksheet("Factura").Cell("A16").GetString().Should().Be("Base Imponible:");
        var traz = wb.Worksheet("Trazabilidad Lotes");
        traz.Cell("A1").GetString().Should().Contain("TRAZABILIDAD");
        traz.Cell(4, 2).GetString().Should().Be("Producto");
        traz.Cell(4, 9).GetString().Should().Be("Origen Descuento");
    }

    private record FacturaCreadaEnvelope(FacturaCreadaDto Data);
    private record FacturaCreadaDto(int FacturaId, string NumeroFactura, decimal Total);
}
