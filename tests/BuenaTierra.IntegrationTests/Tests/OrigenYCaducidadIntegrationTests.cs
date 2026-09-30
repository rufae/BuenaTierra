using BuenaTierra.Domain.Enums;
using BuenaTierra.Infrastructure.Persistence;
using BuenaTierra.IntegrationTests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Cobertura de los fallos reportados:
///  1) El lote debe heredar la fecha de caducidad de la vida útil del producto.
///  2) El stock por origen (Fábrica/Furgoneta) debe validarse y consumirse correctamente.
/// </summary>
public class OrigenYCaducidadIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public OrigenYCaducidadIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Helpers ─────────────────────────────────────────────────────────────

    private (int ProductoId, int LoteId, int ClienteId, int SerieId) SeedProductoLoteStock(
        decimal disponible, decimal enFurgoneta, int? vidaUtilDias = null)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;
        var hoy = DateOnly.FromDateTime(DateTime.Today);

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId = empresaId,
            Nombre = $"Prod {Guid.NewGuid():N}",
            PrecioVenta = 2m,
            IvaPorcentaje = 10,
            RequiereLote = true,
            Activo = true,
            VidaUtilDias = vidaUtilDias,
            VidaUtilUnidad = "Dias",
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            CodigoLote = $"L{Guid.NewGuid():N}"[..12],
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
        ctx.SaveChanges();

        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre = $"Cli {Guid.NewGuid():N}",
            Email = $"{Guid.NewGuid():N}@test.com",
            Tipo = TipoCliente.Empresa,
            Activo = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();

        var serie = ctx.SeriesFacturacion.First(s => s.EmpresaId == empresaId);
        return (producto.Id, lote.Id, cliente.Id, serie.Id);
    }

    private (decimal Disponible, decimal Furgoneta) GetStock(int productoId)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var s = ctx.Set<BuenaTierra.Domain.Entities.Stock>().First(x => x.ProductoId == productoId);
        return (s.CantidadDisponible, s.CantidadFurgoneta);
    }

    // ── Bug #1: caducidad heredada de la vida útil del producto ─────────────

    [Fact]
    public async Task ProduccionFinalizada_CalculaCaducidadDesdeVidaUtilDelProducto()
    {
        var client = await _factory.CreateAuthenticatedClientAsync();

        // Crear producto con vida útil 30 días a través de la API
        var resProd = await client.PostAsJsonAsync("/api/productos", new
        {
            nombre = $"Caducidad {Guid.NewGuid():N}",
            precioVenta = 1m,
            ivaPorcentaje = 10,
            requiereLote = true,
            activo = true,
            vidaUtilDias = 30,
            vidaUtilUnidad = "Dias",
        });
        resProd.StatusCode.Should().Be(HttpStatusCode.Created);
        var prod = (await resProd.Content.ReadFromJsonAsync<Envelope<ProductoIdDto>>())!.Data;

        var hoy = DateOnly.FromDateTime(DateTime.Today);

        var resCrear = await client.PostAsJsonAsync("/api/produccion", new
        {
            productoId = prod.Id,
            cantidadProducida = 5m,
            fechaProduccion = hoy.ToString("yyyy-MM-dd"),
            codigoLoteSugerido = $"VID{Guid.NewGuid():N}"[..8],
        });
        var creada = (await resCrear.Content.ReadFromJsonAsync<Envelope<ProduccionCreadaDto>>())!.Data;

        var resFin = await client.PostAsync($"/api/produccion/{creada.ProduccionId}/finalizar", null);
        resFin.StatusCode.Should().Be(HttpStatusCode.OK);

        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var lote = ctx.Lotes.First(l => l.ProductoId == prod.Id);

        lote.FechaCaducidad.Should().Be(hoy.AddDays(30),
            because: "el lote debe heredar la vida útil (30 días) del producto");
    }

    [Fact]
    public void Producto_VidaUtilUnidadSeGuardaYDevuelveCorrectamente()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId = empresaId,
            Nombre = $"UnidadCad {Guid.NewGuid():N}",
            PrecioVenta = 1m,
            IvaPorcentaje = 10,
            Activo = true,
            VidaUtilDias = 6,
            VidaUtilUnidad = "Meses",
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        var recargado = ctx.Productos.First(p => p.Id == producto.Id);
        recargado.VidaUtilDias.Should().Be(6);
        recargado.VidaUtilUnidad.Should().Be("Meses");
    }

    // ── Bug #2: stock por origen ────────────────────────────────────────────

    [Fact]
    public async Task Factura_OrigenFurgoneta_SinStockEnFurgoneta_FallaYOrigenFabricaFunciona()
    {
        // 10 unidades SOLO en fábrica, 0 en furgoneta
        var (productoId, _, clienteId, serieId) = SeedProductoLoteStock(disponible: 10m, enFurgoneta: 0m);
        var client = await _factory.CreateAuthenticatedClientAsync();

        var resFurgo = await client.PostAsJsonAsync("/api/facturas/crear", new
        {
            clienteId,
            serieId,
            origenStock = "Furgoneta",
            items = new[] { new { productoId, cantidad = 2m, descuento = 0m } },
        });
        ((int)resFurgo.StatusCode).Should().BeInRange(400, 422,
            because: "no hay stock en furgoneta (aunque haya 10 en fábrica): error bloqueante sin fallback");

        var resFab = await client.PostAsJsonAsync("/api/facturas/crear", new
        {
            clienteId,
            serieId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 2m, descuento = 0m } },
        });
        resFab.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "sí hay stock en fábrica");

        var (disponible, furgoneta) = GetStock(productoId);
        disponible.Should().Be(8m, because: "10 - 2 vendidos de fábrica");
        furgoneta.Should().Be(0m, because: "una venta de fábrica no toca la furgoneta");
    }

    [Fact]
    public async Task CargarFurgoneta_HabilitaLaVentaDesdeFurgoneta()
    {
        var (productoId, loteId, clienteId, serieId) = SeedProductoLoteStock(disponible: 10m, enFurgoneta: 0m);
        var client = await _factory.CreateAuthenticatedClientAsync();

        // Cargar las 10 unidades a la furgoneta
        var resCarga = await client.PostAsJsonAsync("/api/stock/carga-furgoneta", new
        {
            productoId,
            loteId,
            cantidad = 10m,
            sentido = "Carga",
        });
        resCarga.StatusCode.Should().Be(HttpStatusCode.OK);

        var (dispTrasCarga, furgoTrasCarga) = GetStock(productoId);
        dispTrasCarga.Should().Be(10m, because: "mover a furgoneta no altera el total");
        furgoTrasCarga.Should().Be(10m);

        // Venta desde furgoneta → debe funcionar
        var res = await client.PostAsJsonAsync("/api/facturas/crear", new
        {
            clienteId,
            serieId,
            origenStock = "Furgoneta",
            items = new[] { new { productoId, cantidad = 4m, descuento = 0m } },
        });
        res.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "ya hay stock en furgoneta tras la carga");

        var (disponible, furgoneta) = GetStock(productoId);
        disponible.Should().Be(6m, because: "el total baja con la venta");
        furgoneta.Should().Be(6m, because: "la venta de furgoneta baja también su porción (10 - 4)");
    }

    [Fact]
    public async Task Pedido_OrigenFurgoneta_SinStockEnFurgoneta_Falla()
    {
        var (productoId, _, clienteId, _) = SeedProductoLoteStock(disponible: 10m, enFurgoneta: 0m);
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Furgoneta",
            items = new[] { new { productoId, cantidad = 2m } },
        });

        ((int)res.StatusCode).Should().BeInRange(400, 422,
            because: "el origen elegido (Furgoneta) está vacío aunque el total sea 10");
    }

    [Fact]
    public async Task Pedido_OrigenFabrica_ConStockEnFabrica_Funciona()
    {
        var (productoId, _, clienteId, _) = SeedProductoLoteStock(disponible: 10m, enFurgoneta: 0m);
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 2m } },
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Pedido_ProductoSinLote_SinFilasDeStock_NoBloquea()
    {
        // Producto NO trazable (sin lote): no debe exigir stock ni bloquear la venta.
        using (var scope = _factory.Services.CreateScope())
        {
            var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var empresaId = ctx.Empresas.First().Id;
            var invendible = new BuenaTierra.Domain.Entities.Producto
            {
                EmpresaId = empresaId,
                Nombre = $"NoLote {Guid.NewGuid():N}",
                PrecioVenta = 1m,
                IvaPorcentaje = 10,
                RequiereLote = false,
                Activo = true,
            };
            ctx.Productos.Add(invendible);
            ctx.SaveChanges();

            var cliente = new BuenaTierra.Domain.Entities.Cliente
            {
                EmpresaId = empresaId,
                Nombre = $"Cli {Guid.NewGuid():N}",
                Email = $"{Guid.NewGuid():N}@test.com",
                Tipo = TipoCliente.Empresa,
                Activo = true,
            };
            ctx.Clientes.Add(cliente);
            ctx.SaveChanges();

            var client = await _factory.CreateAuthenticatedClientAsync();
            var res = await client.PostAsJsonAsync("/api/pedidos/crear", new
            {
                clienteId = cliente.Id,
                origenStock = "Fabrica",
                items = new[] { new { productoId = invendible.Id, cantidad = 3m } },
            });

            res.StatusCode.Should().Be(HttpStatusCode.OK,
                because: "un producto sin lote no debe requerir filas de stock");
        }
    }

    [Fact]
    public async Task ErrorDeOrigen_IndicaElStockDelOtroOrigen()
    {
        var (productoId, _, clienteId, serieId) = SeedProductoLoteStock(disponible: 10m, enFurgoneta: 0m);
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync("/api/facturas/crear", new
        {
            clienteId,
            serieId,
            origenStock = "Furgoneta",
            items = new[] { new { productoId, cantidad = 2m, descuento = 0m } },
        });

        ((int)res.StatusCode).Should().BeInRange(400, 422);
        var err = (await res.Content.ReadFromJsonAsync<ErrorEnvelope>())!;
        err.Errors.Should().NotBeEmpty();
        err.Errors[0].Should().Contain("fábrica",
            because: "el mensaje debe orientar al usuario de que el stock está en fábrica");
    }

    // ── DTOs ────────────────────────────────────────────────────────────────

    private record Envelope<T>(T Data);
    private record ErrorEnvelope(List<string> Errors);
    private record ProductoIdDto(int Id);
    private record ProduccionCreadaDto(int ProduccionId, int? LoteId, string? CodigoLote);
}
