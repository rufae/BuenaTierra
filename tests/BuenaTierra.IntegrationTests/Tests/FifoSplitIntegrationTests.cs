using BuenaTierra.IntegrationTests.Infrastructure;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Tests de integración para el split automático FIFO de lotes.
/// Verifica que al crear una factura con cantidad > un lote,
/// el sistema genera líneas separadas por lote respetando FIFO.
/// </summary>
public class FifoSplitIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public FifoSplitIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Setup de datos de prueba ─────────────────────────────────────────────

    /// <summary>
    /// Inserta en BD: 1 producto con 3 lotes (3+4+3 unidades) y 1 cliente.
    /// Devuelve (productoId, clienteId, serieId).
    /// </summary>
    private (int productoId, int clienteId, int serieId) SeedFifoData()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var empresaId = ctx.Empresas.First().Id;
        var userId = ctx.Usuarios.First().Id;

        // Producto
        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId     = empresaId,
            Nombre        = "Palmeras FIFO Test",
            Referencia    = $"PALM-FIFO-{Guid.NewGuid():N}",
            PrecioVenta   = 2.50m,
            IvaPorcentaje = 10,
            Activo        = true,
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        // Producción y lotes (FIFO: A→B→C)
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        int[] cantidades = [3, 4, 3];
        for (int i = 0; i < 3; i++)
        {
            var prod = new BuenaTierra.Domain.Entities.Produccion
            {
                EmpresaId         = empresaId,
                ProductoId        = producto.Id,
                UsuarioId         = userId,
                FechaProduccion   = hoy.AddDays(-3 + i),
                CantidadProducida = cantidades[i],
            };
            ctx.Producciones.Add(prod);
            ctx.SaveChanges();

            var lote = new BuenaTierra.Domain.Entities.Lote
            {
                EmpresaId        = empresaId,
                ProductoId       = producto.Id,
                ProduccionId     = prod.Id,
                CodigoLote       = $"LOTE{(char)('A' + i)}-{prod.FechaProduccion:ddMMyyyy}-{Guid.NewGuid().ToString("N")[..8]}",
                FechaFabricacion  = prod.FechaProduccion,
                FechaCaducidad   = hoy.AddDays(30),
                CantidadInicial  = cantidades[i],
            };
            ctx.Lotes.Add(lote);
            ctx.SaveChanges();

            // Stock entry for FIFO
            ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
            {
                EmpresaId          = empresaId,
                ProductoId         = producto.Id,
                LoteId             = lote.Id,
                CantidadDisponible = cantidades[i],
                CantidadReservada  = 0,
            });
            ctx.SaveChanges();
        }

        // Cliente
        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre    = "Cliente FIFO Test",
            Email     = $"fifo-{Guid.NewGuid():N}@test.com",
            Tipo      = BuenaTierra.Domain.Enums.TipoCliente.Empresa,
            Activo    = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();

        var serie = ctx.SeriesFacturacion.First(s => s.EmpresaId == empresaId);
        return (producto.Id, cliente.Id, serie.Id);
    }

    // ── Tests ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CrearFactura_10Unidades_GeneraTresLineasConLotesCorrectos()
    {
        var (productoId, clienteId, serieId) = SeedFifoData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var request = new
        {
            clienteId,
            serieId,
            items = new[] { new { productoId, cantidad = 10, descuento = 0 } },
        };

        var res = await client.PostAsJsonAsync("/api/facturas/crear", request);

        res.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "10 unidades distribuidas en 3 lotes debe crear la factura sin error");

        // POST returns FacturaCreada (FacturaId, NumeroFactura, Total) — no Lineas
        var created = (await res.Content.ReadFromJsonAsync<FacturaCreadaEnvelope>())!.Data;
        created.FacturaId.Should().BeGreaterThan(0);

        // GET the full factura to inspect lines
        var getRes = await client.GetAsync($"/api/facturas/{created.FacturaId}");
        getRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var factura = (await getRes.Content.ReadFromJsonAsync<FacturaDetalleEnvelope>())!.Data;

        // La factura debe tener 3 líneas (una por lote)
        factura.Lineas.Should().HaveCount(3,
            because: "FIFO split debe producir 3 líneas para lotes A(3) + B(4) + C(3)");

        // Cantidades totales
        var totalCantidad = factura.Lineas.Sum(l => l.Cantidad);
        totalCantidad.Should().Be(10);

        // Cada línea debe tener un CodigoLote asignado
        factura.Lineas.Should().AllSatisfy(l =>
            l.CodigoLote.Should().NotBeNullOrEmpty("toda línea FIFO debe referenciar un lote"));

        // Los códigos de lote deben ser distintos
        var codes = factura.Lineas.Select(l => l.CodigoLote).ToList();
        codes.Should().OnlyHaveUniqueItems("cada línea corresponde a un lote diferente");
    }

    [Fact]
    public async Task CrearFactura_CantidadIgualAUnLote_GeneraUnaLinea()
    {
        var (productoId, clienteId, serieId) = SeedFifoData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        // Solicitar exactamente las 3 unidades del lote A (el más antiguo)
        var res = await client.PostAsJsonAsync("/api/facturas/crear", new
        {
            clienteId,
            serieId,
            items = new[] { new { productoId, cantidad = 3, descuento = 0 } },
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var created = (await res.Content.ReadFromJsonAsync<FacturaCreadaEnvelope>())!.Data;

        // GET the full factura to inspect lines
        var getRes = await client.GetAsync($"/api/facturas/{created.FacturaId}");
        getRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var factura = (await getRes.Content.ReadFromJsonAsync<FacturaDetalleEnvelope>())!.Data;

        factura.Lineas.Should().HaveCount(1,
            because: "3 unidades caben exactamente en el lote A → 1 línea");
        factura.Lineas[0].Cantidad.Should().Be(3);
    }

    [Fact]
    public async Task CrearFactura_CantidadSuperiorAlStock_Retorna4xxOError()
    {
        var (productoId, clienteId, serieId) = SeedFifoData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        // Pedir más de 10 (el stock total disponible)
        var res = await client.PostAsJsonAsync("/api/facturas/crear", new
        {
            clienteId,
            serieId,
            items = new[] { new { productoId, cantidad = 999, descuento = 0 } },
        });

        ((int)res.StatusCode).Should()
            .BeInRange(400, 422, because: "sin stock suficiente debe rechazar la solicitud");
    }

    // ── DTOs de respuesta ────────────────────────────────────────────────────

    // POST /api/facturas/crear → ApiResponse<FacturaCreada>
    private record FacturaCreadaEnvelope(FacturaCreadaDto Data);
    private record FacturaCreadaDto(int FacturaId, string NumeroFactura, decimal Total);

    // GET /api/facturas/{id} → ApiResponse<FacturaDto>
    private record FacturaDetalleEnvelope(FacturaDetalleDto Data);
    private record FacturaDetalleDto(int Id, string NumeroFactura, List<FacturaLineaDto> Lineas);
    private record FacturaLineaDto(decimal Cantidad, string? CodigoLote);
}
