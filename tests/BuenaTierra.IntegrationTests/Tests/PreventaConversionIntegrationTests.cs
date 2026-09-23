using BuenaTierra.Domain.Enums;
using BuenaTierra.IntegrationTests.Infrastructure;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Tests de integración: preventa → pedido CONSUME stock en el origen elegido
/// (Fábrica/Furgoneta), con transacción y bloqueo si no hay stock en el origen.
/// </summary>
public class PreventaConversionIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public PreventaConversionIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Setup ───────────────────────────────────────────────────────────────

    private (int ProductoId, int ClienteId) SeedData(decimal disponible = 10m, decimal enFurgoneta = 0m)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var empresaId = ctx.Empresas.First().Id;

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId = empresaId,
            Nombre = $"Producto Preventa {Guid.NewGuid():N}",
            PrecioVenta = 2.00m,
            IvaPorcentaje = 10,
            RequiereLote = true,
            Activo = true,
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            CodigoLote = $"PREV-{Guid.NewGuid():N}".Substring(0, 10),
            FechaFabricacion = hoy.AddDays(-1),
            FechaCaducidad = hoy.AddDays(60),
            CantidadInicial = disponible,
        };
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            LoteId = lote.Id,
            CantidadDisponible = disponible,
            CantidadReservada = 0,
            CantidadFurgoneta = enFurgoneta,
        });

        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre = $"Cliente Preventa {Guid.NewGuid():N}",
            Email = $"prev-{Guid.NewGuid():N}@test.com",
            Tipo = TipoCliente.Empresa,
            Activo = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();

        return (producto.Id, cliente.Id);
    }

    private (decimal Disponible, decimal Furgoneta) GetStock(int productoId)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var s = ctx.Set<BuenaTierra.Domain.Entities.Stock>()
            .First(x => x.ProductoId == productoId);
        return (s.CantidadDisponible, s.CantidadFurgoneta);
    }

    private int CountMovimientosVentaPedido(int productoId)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return ctx.Set<BuenaTierra.Domain.Entities.MovimientoStock>()
            .Count(m => m.ProductoId == productoId
                     && m.ReferenciaTipo == "pedido_confirmado"
                     && m.Tipo == TipoMovimientoStock.Venta);
    }

    private async Task<int> CrearPreventaAsync(HttpClient client, int productoId, int clienteId, decimal cantidad = 4m)
    {
        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var res = await client.PostAsJsonAsync("/api/preventas/crear", new
        {
            clienteId,
            fechaPreventa = hoy.ToString("yyyy-MM-dd"),
            lineas = new[]
            {
                new { productoId, fechaObjetivo = hoy.ToString("yyyy-MM-dd"), cantidadPrevista = cantidad },
            },
        });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<PreventaCreadaEnvelope>();
        return body!.Data.Id;
    }

    // ── Tests ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Convertir_OrigenFabrica_DescuentaStockDeFabrica()
    {
        var (productoId, clienteId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();
        var preventaId = await CrearPreventaAsync(client, productoId, clienteId);

        var res = await client.PostAsJsonAsync($"/api/preventas/{preventaId}/convertir", new
        {
            alertaConfirmada = true,
            origenStock = "Fabrica",
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var (disponible, furgoneta) = GetStock(productoId);
        disponible.Should().Be(6m, because: "10 - 4 convertidos = 6 en fábrica");
        furgoneta.Should().Be(0m, because: "una venta de fábrica no toca la furgoneta");
        CountMovimientosVentaPedido(productoId).Should().BeGreaterThan(0,
            because: "la conversión debe registrar la Venta (pedido_confirmado) para poder reponer al cancelar");
    }

    [Fact]
    public async Task Convertir_OrigenFurgoneta_DescuentaAmbasPorciones()
    {
        var (productoId, clienteId) = SeedData(disponible: 10m, enFurgoneta: 5m);
        var client = await _factory.CreateAuthenticatedClientAsync();
        var preventaId = await CrearPreventaAsync(client, productoId, clienteId);

        var res = await client.PostAsJsonAsync($"/api/preventas/{preventaId}/convertir", new
        {
            alertaConfirmada = true,
            origenStock = "Furgoneta",
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var (disponible, furgoneta) = GetStock(productoId);
        disponible.Should().Be(6m, because: "el total baja con la venta");
        furgoneta.Should().Be(1m, because: "la venta de furgoneta baja también la porción en furgoneta (5 - 4)");
    }

    [Fact]
    public async Task Convertir_OrigenFurgoneta_SinStockEnFurgoneta_BloqueaCon4xx()
    {
        // 10 en fábrica pero 0 en furgoneta → error bloqueante, sin fallback
        var (productoId, clienteId) = SeedData(disponible: 10m, enFurgoneta: 0m);
        var client = await _factory.CreateAuthenticatedClientAsync();
        var preventaId = await CrearPreventaAsync(client, productoId, clienteId);

        var res = await client.PostAsJsonAsync($"/api/preventas/{preventaId}/convertir", new
        {
            alertaConfirmada = true,
            origenStock = "Furgoneta",
        });

        ((int)res.StatusCode).Should().BeInRange(400, 422,
            because: "sin stock en furgoneta no puede convertirse (sin fallback a fábrica)");

        var (disponible, furgoneta) = GetStock(productoId);
        disponible.Should().Be(10m, because: "la transacción debe revertirse completo");
        furgoneta.Should().Be(0m);
    }

    [Fact]
    public async Task Convertir_SinOrigen_Retorna400()
    {
        var (productoId, clienteId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();
        var preventaId = await CrearPreventaAsync(client, productoId, clienteId);

        var res = await client.PostAsJsonAsync($"/api/preventas/{preventaId}/convertir", new
        {
            alertaConfirmada = true,
        });

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            because: "el origen de la venta es obligatorio");
    }

    // ── DTOs ────────────────────────────────────────────────────────────────

    private record PreventaCreadaEnvelope(PreventaCreadaDto Data);
    private record PreventaCreadaDto(int Id, string FechaPreventa, string Estado);
}
