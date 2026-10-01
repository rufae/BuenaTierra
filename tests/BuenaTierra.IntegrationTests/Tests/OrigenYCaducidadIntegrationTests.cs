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

    // ── Coherencia stock vendible vs caducado y corrección de caducidad ────

    private (int ProductoId, int LoteId, int ClienteId) SeedProductoConLoteCaducado(
        decimal caducado, string codigoLote = "VENCIDOTEST")
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;
        var hoy = DateOnly.FromDateTime(DateTime.Today);

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId = empresaId,
            Nombre = $"Cad {Guid.NewGuid():N}",
            PrecioVenta = 2m,
            IvaPorcentaje = 10,
            RequiereLote = true,
            Activo = true,
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            CodigoLote = codigoLote,
            FechaFabricacion = hoy.AddDays(-90),
            FechaCaducidad = hoy.AddDays(-30),
            CantidadInicial = caducado,
        };
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            LoteId = lote.Id,
            CantidadDisponible = caducado,
            CantidadReservada = 0,
            CantidadFurgoneta = 0,
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
        return (producto.Id, lote.Id, cliente.Id);
    }

    [Fact]
    public async Task Stock_MarcaVendibleYCaducado_YElResumenEsCoherente()
    {
        var (productoId, _, _, _) = SeedProductoLoteStock(disponible: 10m, enFurgoneta: 0m);
        using (var scope = _factory.Services.CreateScope())
        {
            var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var empresaId = ctx.Empresas.First().Id;
            var hoy = DateOnly.FromDateTime(DateTime.Today);
            var caducado = new BuenaTierra.Domain.Entities.Lote
            {
                EmpresaId = empresaId,
                ProductoId = productoId,
                CodigoLote = "CADUCADO01",
                FechaFabricacion = hoy.AddDays(-90),
                FechaCaducidad = hoy.AddDays(-1),
                CantidadInicial = 5m,
            };
            ctx.Lotes.Add(caducado);
            ctx.SaveChanges();
            ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
            {
                EmpresaId = empresaId,
                ProductoId = productoId,
                LoteId = caducado.Id,
                CantidadDisponible = 5m,
                CantidadReservada = 0,
                CantidadFurgoneta = 0,
            });
            ctx.SaveChanges();
        }

        var client = await _factory.CreateAuthenticatedClientAsync();

        var todos = await client.GetFromJsonAsync<Envelope<List<StockDetalleDto>>>("/api/stock/todos");
        var filas = todos!.Data.Where(s => s.ProductoId == productoId).ToList();
        filas.Should().HaveCount(2);
        var filaCaducada = filas.Single(s => s.CodigoLote == "CADUCADO01");
        filaCaducada.EsVendible.Should().BeFalse(because: "el lote está caducado");
        filaCaducada.CantidadVendible.Should().Be(0m);
        filas.Where(s => s.CodigoLote != "CADUCADO01")
            .Should().OnlyContain(s => s.EsVendible && s.CantidadVendible == 10m);

        var resumen = await client.GetFromJsonAsync<Envelope<ResumenDto>>($"/api/stock/producto/{productoId}");
        resumen!.Data.TotalVendible.Should().Be(10m);
        resumen.Data.TotalCaducado.Should().Be(5m, because: "el stock caducado se muestra aparte");
    }

    [Fact]
    public async Task Pedido_SoloLotesCaducados_ExplicaQueEstaCaducado()
    {
        var (productoId, loteId, clienteId) = SeedProductoConLoteCaducado(5m, "VENCIDOPEDIDO");
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 1m } },
        });

        ((int)res.StatusCode).Should().BeInRange(400, 422);
        var err = (await res.Content.ReadFromJsonAsync<ErrorEnvelope>())!;
        err.Errors.Should().NotBeEmpty();
        err.Errors[0].Should().Contain("caducad",
            because: "el usuario debe entender que el stock existe pero está caducado");
        err.Errors[0].Should().Contain("VENCIDOPEDIDO",
            because: "el mensaje debe identificar el lote caducado");
    }

    [Fact]
    public async Task PatchCaducidad_HabilitaLaVentaDelLote()
    {
        var (productoId, loteId, clienteId) = SeedProductoConLoteCaducado(5m, "VENCIDOPATCH");
        var client = await _factory.CreateAuthenticatedClientAsync();

        var nueva = DateOnly.FromDateTime(DateTime.Today).AddDays(90).ToString("yyyy-MM-dd");
        var patch = await client.PatchAsJsonAsync($"/api/lotes/{loteId}/caducidad",
            new { fechaCaducidad = nueva });
        patch.StatusCode.Should().Be(HttpStatusCode.OK);

        var res = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 1m } },
        });
        res.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "con la caducidad corregida el lote vuelve a ser vendible");
    }

    [Fact]
    public async Task PatchCaducidad_RechazaFechaAnteriorALaFabricacion()
    {
        var (_, loteId, _) = SeedProductoConLoteCaducado(5m, "VENCIDORECHAZA");
        var client = await _factory.CreateAuthenticatedClientAsync();

        var patch = await client.PatchAsJsonAsync($"/api/lotes/{loteId}/caducidad",
            new { fechaCaducidad = "2000-01-01" });
        ((int)patch.StatusCode).Should().BeInRange(400, 422);
    }

    // ── Purga automatica de caducados (2026-10-01) ─────────────────────────

    [Fact]
    public async Task PurgaCaducados_RetiraElStockVencido_YNoTocaElDeHoyNiElFuturo()
    {
        var (productoId, _, _, _) = SeedProductoLoteStock(disponible: 5m, enFurgoneta: 0m);
        int loteVencidoId;
        int loteHoyId;
        using (var scope = _factory.Services.CreateScope())
        {
            var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var empresaId = ctx.Empresas.First().Id;
            var hoy = DateOnly.FromDateTime(DateTime.Today);

            var vencido = new BuenaTierra.Domain.Entities.Lote
            {
                EmpresaId = empresaId,
                ProductoId = productoId,
                CodigoLote = "VENCIDO01",
                FechaFabricacion = hoy.AddDays(-60),
                FechaCaducidad = hoy.AddDays(-1),
                CantidadInicial = 6m,
            };
            var caducaHoy = new BuenaTierra.Domain.Entities.Lote
            {
                EmpresaId = empresaId,
                ProductoId = productoId,
                CodigoLote = "CADUCAHOY",
                FechaFabricacion = hoy.AddDays(-30),
                FechaCaducidad = hoy,
                CantidadInicial = 3m,
            };
            ctx.Lotes.AddRange(vencido, caducaHoy);
            ctx.SaveChanges();
            loteVencidoId = vencido.Id;
            loteHoyId = caducaHoy.Id;
            ctx.Set<BuenaTierra.Domain.Entities.Stock>().AddRange(
                new BuenaTierra.Domain.Entities.Stock
                {
                    EmpresaId = empresaId, ProductoId = productoId, LoteId = vencido.Id,
                    CantidadDisponible = 6m, CantidadReservada = 0, CantidadFurgoneta = 2m,
                },
                new BuenaTierra.Domain.Entities.Stock
                {
                    EmpresaId = empresaId, ProductoId = productoId, LoteId = caducaHoy.Id,
                    CantidadDisponible = 3m, CantidadReservada = 0, CantidadFurgoneta = 0,
                });
            ctx.SaveChanges();
        }

        var client = await _factory.CreateAuthenticatedClientAsync();
        var res = await client.PostAsync("/api/stock/purgar-caducados", null);
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        using (var scope = _factory.Services.CreateScope())
        {
            var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stockVencido = ctx.Set<BuenaTierra.Domain.Entities.Stock>()
                .First(s => s.ProductoId == productoId && s.LoteId == loteVencidoId);
            stockVencido.CantidadDisponible.Should().Be(0m, because: "el lote venció ayer");
            stockVencido.CantidadFurgoneta.Should().Be(0m, because: "también se retira de la furgoneta");
            stockVencido.CantidadReservada.Should().Be(0m);

            var stockHoy = ctx.Set<BuenaTierra.Domain.Entities.Stock>()
                .First(s => s.ProductoId == productoId && s.LoteId == loteHoyId);
            stockHoy.CantidadDisponible.Should().Be(3m,
                because: "el día de caducidad todavía se puede vender");

            var movimiento = ctx.Set<BuenaTierra.Domain.Entities.MovimientoStock>()
                .FirstOrDefault(m => m.ProductoId == productoId && m.LoteId == loteVencidoId
                                     && m.Tipo == TipoMovimientoStock.Caducidad);
            movimiento.Should().NotBeNull(because: "queda trazabilidad de la retirada");
            movimiento!.Cantidad.Should().Be(6m);
            movimiento.CantidadDespues.Should().Be(0m);
        }

        var resumen = await client.GetFromJsonAsync<Envelope<ResumenDto>>($"/api/stock/producto/{productoId}");
        resumen!.Data.TotalVendible.Should().Be(8m, because: "quedan el lote de hoy (3) y el futuro (5)");
        resumen.Data.TotalCaducado.Should().Be(0m, because: "el vencido ya se retiró del stock");
    }

    [Fact]
    public async Task Pedido_ElDiaDeCaducidad_TodaviaSePuedeVender()
    {
        var (productoId, loteId, clienteId, _) = SeedProductoLoteStock(disponible: 5m, enFurgoneta: 0m);
        using (var scope = _factory.Services.CreateScope())
        {
            var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var lote = ctx.Lotes.First(l => l.Id == loteId);
            lote.FechaCaducidad = DateOnly.FromDateTime(DateTime.Today);
            ctx.SaveChanges();
        }

        var client = await _factory.CreateAuthenticatedClientAsync();
        var res = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 2m } },
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "si caduca el 12, el 12 aún se vende; se retira el 13");
    }

    // ── DTOs ────────────────────────────────────────────────────────────────

    private record Envelope<T>(T Data);
    private record ErrorEnvelope(List<string> Errors);
    private record ProductoIdDto(int Id);
    private record StockDetalleDto(int ProductoId, string CodigoLote, bool EsVendible, decimal CantidadVendible);
    private record ResumenDto(decimal TotalVendible, decimal TotalCaducado, int NumLotesVendibles);
    private record ProduccionCreadaDto(int ProduccionId, int? LoteId, string? CodigoLote);
}
