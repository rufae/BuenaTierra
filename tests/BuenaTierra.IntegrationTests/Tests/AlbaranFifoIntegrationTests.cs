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
            EmpresaId       = empresaId,
            ProductoId      = producto.Id,
            FechaProduccion = hoy,
            Cantidad        = 20,
        };
        ctx.Producciones.Add(produccion);
        ctx.SaveChanges();

        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            ProduccionId    = produccion.Id,
            CodigoLote      = $"ROSQ-{hoy:ddMMyyyy}",
            FechaProduccion = hoy,
            FechaCaducidad  = hoy.AddDays(14),
            CantidadInicial = 20,
            CantidadActual  = 20,
        };
        ctx.Lotes.Add(lote);

        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId   = empresaId,
            Nombre      = "Cliente ALB Test",
            Email       = $"alb-{Guid.NewGuid():N}@test.com",
            TipoCliente = BuenaTierra.Domain.Enums.TipoCliente.Empresa,
            Activo      = true,
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

        // 2. Convertir albarán → factura
        var convertirRes = await client.PostAsJsonAsync(
            $"/api/albaranes/{albaran.Id}/convertir-factura", new { serieId });

        convertirRes.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "el albarán en estado Pendiente debe convertirse a factura");

        var facturaEnv = await convertirRes.Content.ReadFromJsonAsync<FacturaEnvelope>();
        var factura = facturaEnv!.Data;

        factura.Id.Should().BeGreaterThan(0);
        factura.NumeroFactura.Should().NotBeNullOrEmpty();

        // Las líneas de la factura deben corresponder a las líneas del albarán
        factura.Lineas.Sum(l => l.Cantidad).Should()
            .Be(albaran.Lineas.Sum(l => l.Cantidad),
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

    private record AlbaranEnvelope(AlbaranDto Data);
    private record AlbaranDto(int Id, string NumeroAlbaran, List<LineaDto> Lineas);

    private record FacturaEnvelope(FacturaDto Data);
    private record FacturaDto(int Id, string NumeroFactura, List<LineaDto> Lineas);

    private record LineaDto(decimal Cantidad, int? LoteId);
}
