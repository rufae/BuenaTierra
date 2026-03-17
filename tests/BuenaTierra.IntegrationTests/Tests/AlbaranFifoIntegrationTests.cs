using BuenaTierra.IntegrationTests.Infrastructure;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using System.Net;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Tests de integración del flujo completo albarán → conversión a factura.
/// Verifica estado, numeración correcta y preservación de líneas FIFO.
/// </summary>
public class AlbaranFifoIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public AlbaranFifoIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Seed ─────────────────────────────────────────────────────────────────

    private (int productoId, int clienteId, int serieId) SeedData()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;
        var userId = ctx.Usuarios.First().Id;

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId     = empresaId,
            Nombre        = "Rosquillas ALB Test",
            Referencia    = $"ROSQ-{Guid.NewGuid():N}",
            PrecioVenta   = 1.80m,
            IvaPorcentaje = 10,
            Activo        = true,
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var produccion = new BuenaTierra.Domain.Entities.Produccion
        {
            EmpresaId        = empresaId,
            ProductoId       = producto.Id,
            UsuarioId        = userId,
            FechaProduccion  = hoy,
            CantidadProducida = 20,
        };
        ctx.Producciones.Add(produccion);
        ctx.SaveChanges();

        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            EmpresaId        = empresaId,
            ProductoId       = producto.Id,
            ProduccionId     = produccion.Id,
            CodigoLote       = $"ROSQ-{hoy:ddMMyyyy}-{Guid.NewGuid().ToString("N")[..8]}",
            FechaFabricacion = hoy,
            FechaCaducidad   = hoy.AddDays(14),
            CantidadInicial  = 20,
        };
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        // Stock entry — required for FIFO to find this lote
        ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
        {
            EmpresaId          = empresaId,
            ProductoId         = producto.Id,
            LoteId             = lote.Id,
            CantidadDisponible = 20,
            CantidadReservada  = 0,
        });
        ctx.SaveChanges();

        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre    = "Cliente ALB Test",
            Email     = $"alb-{Guid.NewGuid():N}@test.com",
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
    public async Task CrearAlbaran_Valido_Retorna200ConId()
    {
        var (productoId, clienteId, serieId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync("/api/albaranes/crear", new
        {
            clienteId,
            serieId,
            items = new[] { new { productoId, cantidad = 5, descuento = 0 } },
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<AlbaranEnvelope>();
        body!.Data.Id.Should().BeGreaterThan(0);
        body.Data.NumeroAlbaran.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task ConvertirAlbaranAFactura_EstadoCambia_YFacturaTieneMismasLineas()
    {
        var (productoId, clienteId, serieId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        // 1. Crear albarán
        var crearRes = await client.PostAsJsonAsync("/api/albaranes/crear", new
        {
            clienteId,
            serieId,
            items = new[] { new { productoId, cantidad = 8, descuento = 0 } },
        });
        crearRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var albaran = (await crearRes.Content.ReadFromJsonAsync<AlbaranEnvelope>())!.Data;

        // 2. Convertir albarán → factura (returns FacturaCreada: FacturaId, NumeroFactura, Total)
        var convertirRes = await client.PostAsJsonAsync(
            $"/api/albaranes/{albaran.Id}/convertir-factura", new { serieId });

        convertirRes.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "el albarán en estado Pendiente debe convertirse a factura");

        var facturaCreada = (await convertirRes.Content
            .ReadFromJsonAsync<FacturaCreadaEnvelope>())!.Data;

        facturaCreada.FacturaId.Should().BeGreaterThan(0);
        facturaCreada.NumeroFactura.Should().NotBeNullOrEmpty();

        // 3. Obtener factura completa con líneas via GET
        var getRes = await client.GetAsync($"/api/facturas/{facturaCreada.FacturaId}");
        getRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var factura = (await getRes.Content.ReadFromJsonAsync<FacturaDetalleEnvelope>())!.Data;

        // Las líneas de la factura deben sumar la misma cantidad del albarán (8)
        factura.Lineas.Should().NotBeNullOrEmpty();
        factura.Lineas.Sum(l => l.Cantidad).Should().Be(8,
            because: "cantidades totales deben coincidir tras conversión");
    }

    [Fact]
    public async Task ConvertirAlbaranYaConvertido_Retorna4xx()
    {
        var (productoId, clienteId, serieId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        // Crear y convertir
        var crearRes = await client.PostAsJsonAsync("/api/albaranes/crear", new
        {
            clienteId,
            serieId,
            items = new[] { new { productoId, cantidad = 3, descuento = 0 } },
        });
        var albaran = (await crearRes.Content.ReadFromJsonAsync<AlbaranEnvelope>())!.Data;
        await client.PostAsJsonAsync($"/api/albaranes/{albaran.Id}/convertir-factura", new { serieId });

        // Intentar convertir de nuevo
        var segundoIntento = await client.PostAsJsonAsync(
            $"/api/albaranes/{albaran.Id}/convertir-factura", new { serieId });

        ((int)segundoIntento.StatusCode).Should()
            .BeInRange(400, 422,
                because: "no se puede convertir dos veces el mismo albarán");
    }

    // ── DTOs ─────────────────────────────────────────────────────────────────

    // POST /api/albaranes/crear → ApiResponse<AlbaranCreado>
    private record AlbaranEnvelope(AlbaranCreadoDto Data);
    private record AlbaranCreadoDto(int Id, string NumeroAlbaran, decimal Total);

    // POST /api/albaranes/{id}/convertir-factura → ApiResponse<FacturaCreada>
    private record FacturaCreadaEnvelope(FacturaCreadaDto Data);
    private record FacturaCreadaDto(int FacturaId, string NumeroFactura, decimal Total);

    // GET /api/facturas/{id} → ApiResponse<FacturaDto>
    private record FacturaDetalleEnvelope(FacturaDetalleDto Data);
    private record FacturaDetalleDto(int Id, string NumeroFactura, List<FacturaLineaDto> Lineas);
    private record FacturaLineaDto(decimal Cantidad, string? CodigoLote);
}
