using BuenaTierra.IntegrationTests.Infrastructure;
using BuenaTierra.Infrastructure.Persistence;
using ClosedXML.Excel;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Verifica el CONTENIDO real de los Excel exportados (migración EPPlus → ClosedXML):
/// cabeceras, filas de datos y formato de pedidos, albaranes, clientes y productos.
/// </summary>
public class ExcelContentIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public ExcelContentIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static XLWorkbook AbrirXlsx(byte[] bytes)
    {
        Encoding.ASCII.GetString(bytes, 0, 2).Should().Be("PK", "el contenido debe ser un xlsx válido (ZIP)");
        return new XLWorkbook(new MemoryStream(bytes));
    }

    private static bool Contiene(XLWorkbook wb, string texto)
        => wb.Worksheets.Any(ws => ws.CellsUsed().Any(c =>
            (c.GetString() ?? string.Empty).Contains(texto, StringComparison.Ordinal)));

    private (int ProductoId, int ClienteId) SeedProductoCliente()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId = empresaId,
            Nombre = $"Prod Excel {Guid.NewGuid():N}".Substring(0, 30),
            PrecioVenta = 1.50m,
            IvaPorcentaje = 10,
            RequiereLote = true,
            Activo = true,
        };
        ctx.Productos.Add(producto);

        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre = $"Cli Excel {Guid.NewGuid():N}".Substring(0, 30),
            Email = $"xl-{Guid.NewGuid():N}@test.com",
            Nif = $"B{Random.Shared.NextInt64(10000000, 99999999)}",
            Tipo = BuenaTierra.Domain.Enums.TipoCliente.Empresa,
            Activo = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            CodigoLote = $"XL-{Guid.NewGuid():N}".Substring(0, 9),
            FechaFabricacion = hoy.AddDays(-1),
            FechaCaducidad = hoy.AddDays(60),
            CantidadInicial = 20,
        };
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            LoteId = lote.Id,
            CantidadDisponible = 20,
            CantidadReservada = 0,
            CantidadFurgoneta = 0,
        });
        ctx.SaveChanges();

        return (producto.Id, cliente.Id);
    }

    // ── Tests ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task ExportarPedidos_ContieneCabeceraYDatos()
    {
        var (productoId, clienteId) = SeedProductoCliente();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var crear = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 2 } },
        });
        crear.EnsureSuccessStatusCode();
        var pedido = (await crear.Content.ReadFromJsonAsync<PedidoCreadoEnvelope>())!.Data;

        var res = await client.GetAsync("/api/pedidos/exportar-excel");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        using var wb = AbrirXlsx(await res.Content.ReadAsByteArrayAsync());
        var ws = wb.Worksheet(1);
        ws.Cell(1, 1).GetString().Should().Be("Nº Pedido");
        ws.Cell(1, 6).GetString().Should().Be("Estado");
        ws.Cell(1, 9).GetString().Should().Be("Cantidad");
        Contiene(wb, pedido.NumeroPedido).Should().BeTrue(because: "el pedido recién creado debe aparecer");
        // Formato de fecha en la columna 2: dd/MM/yyyy
        ws.Cell(2, 2).GetString().Should().MatchRegex(@"^\d{2}/\d{2}/\d{4}$");
    }

    [Fact]
    public async Task ExportarAlbaranes_ContieneCabeceraYDatos()
    {
        var (productoId, clienteId) = SeedProductoCliente();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var crear = await client.PostAsJsonAsync("/api/albaranes/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 3 } },
        });
        crear.EnsureSuccessStatusCode();
        var albaran = (await crear.Content.ReadFromJsonAsync<AlbaranCreadoEnvelope>())!.Data;

        // Listado
        var res = await client.GetAsync("/api/albaranes/exportar-excel");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        using var wb = AbrirXlsx(await res.Content.ReadAsByteArrayAsync());
        var ws = wb.Worksheet(1);
        ws.Cell(1, 1).GetString().Should().Be("Nº Albarán");
        ws.Cell(1, 10).GetString().Should().Be("Total");
        Contiene(wb, albaran.NumeroAlbaran).Should().BeTrue(because: "el albarán creado debe aparecer");

        // Individual con líneas y formato monetario
        var resInd = await client.GetAsync($"/api/albaranes/{albaran.Id}/excel");
        resInd.StatusCode.Should().Be(HttpStatusCode.OK);
        using var wbInd = AbrirXlsx(await resInd.Content.ReadAsByteArrayAsync());
        var wsInd = wbInd.Worksheet(1);
        wsInd.Cell("A1").GetString().Should().Be("ALBARÁN");
        wsInd.Cell("A3").GetString().Should().Be("Número");
        wsInd.Cell(10, 1).GetString().Should().Be("Producto");
        wsInd.Cell(10, 5).GetString().Should().Be("Cantidad");
        // Formato monetario en la columna de Precio Unitario (col 6) de la primera línea
        wsInd.Cell(11, 6).Style.NumberFormat.Format.Should().Contain("€");
    }

    [Fact]
    public async Task ExportarClientes_ContieneCabeceraYCliente()
    {
        var (productoId, clienteId) = SeedProductoCliente();

        var client = await _factory.CreateAuthenticatedClientAsync();
        var res = await client.GetAsync("/api/clientes/exportar-excel");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        using var wb = AbrirXlsx(await res.Content.ReadAsByteArrayAsync());
        var ws = wb.Worksheet(1);
        ws.Cell(1, 1).GetString().Should().Be("Código");
        ws.Cell(1, 3).GetString().Should().Be("Nombre");
        ws.Cell(1, 10).GetString().Should().Be("Activo");

        using var scope2 = _factory.Services.CreateScope();
        var ctx2 = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
        var nombreCliente = ctx2.Clientes.Where(c => c.Id == clienteId).Select(c => c.Nombre).Single();
        Contiene(wb, nombreCliente).Should().BeTrue(because: "el cliente creado debe aparecer en la exportación");
    }

    [Fact]
    public async Task ExportarProductos_ContieneCabeceraYProducto()
    {
        var (productoId, clienteId) = SeedProductoCliente();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.GetAsync("/api/productos/exportar-excel");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        using var wb = AbrirXlsx(await res.Content.ReadAsByteArrayAsync());
        var ws = wb.Worksheet(1);
        ws.Cell(1, 1).GetString().Should().Be("Código");
        ws.Cell(1, 3).GetString().Should().Be("Nombre");
        ws.Cell(1, 6).GetString().Should().Be("Precio Venta");

        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var nombre = ctx.Productos.Where(p => p.Id == productoId).Select(p => p.Nombre).Single();
        Contiene(wb, nombre).Should().BeTrue(because: "el producto creado debe aparecer en la exportación");

        // Formato monetario en la columna de precio
        ws.Cell(2, 6).Style.NumberFormat.Format.Should().Contain("€");
    }

    // ── DTOs ────────────────────────────────────────────────────────────────

    private record PedidoCreadoEnvelope(PedidoCreadoDto Data);
    private record PedidoCreadoDto(int Id, string NumeroPedido, decimal Total);
    private record AlbaranCreadoEnvelope(AlbaranCreadoDto Data);
    private record AlbaranCreadoDto(int Id, string NumeroAlbaran, decimal Total);
}
