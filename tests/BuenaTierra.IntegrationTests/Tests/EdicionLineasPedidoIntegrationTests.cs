using BuenaTierra.Infrastructure.Persistence;
using BuenaTierra.IntegrationTests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Edición de líneas de un pedido mientras sigue en estado Pendiente:
/// cambiar cantidades, precios, añadir productos y eliminar líneas.
/// Al confirmar, el pedido queda bloqueado.
/// </summary>
public class EdicionLineasPedidoIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public EdicionLineasPedidoIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Helpers ─────────────────────────────────────────────────────────────

    private int SeedProducto(decimal cantidadDisponible, decimal precioVenta = 5m)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;
        var hoy = DateOnly.FromDateTime(DateTime.Today);

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId = empresaId,
            Nombre = $"EditLinea {Guid.NewGuid():N}",
            PrecioVenta = precioVenta,
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
            CodigoLote = $"E{Guid.NewGuid():N}"[..12],
            FechaFabricacion = hoy.AddDays(-1),
            FechaCaducidad = hoy.AddDays(60),
            CantidadInicial = cantidadDisponible,
        };
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            LoteId = lote.Id,
            CantidadDisponible = cantidadDisponible,
            CantidadReservada = 0,
            CantidadFurgoneta = 0,
        });
        ctx.SaveChanges();

        return producto.Id;
    }

    private int SeedCliente()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;

        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre = $"CliEdit {Guid.NewGuid():N}",
            Email = $"{Guid.NewGuid():N}@test.com",
            Tipo = BuenaTierra.Domain.Enums.TipoCliente.Empresa,
            Activo = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();
        return cliente.Id;
    }

    private void SetStockDisponible(int productoId, decimal cantidad)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var stock = ctx.Set<BuenaTierra.Domain.Entities.Stock>().First(s => s.ProductoId == productoId);
        stock.CantidadDisponible = cantidad;
        ctx.SaveChanges();
    }

    private async Task<int> CrearPedidoAsync(
        HttpClient client, int clienteId, params (int ProductoId, decimal Cantidad)[] items)
    {
        var res = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = items.Select(i => new { productoId = i.ProductoId, cantidad = i.Cantidad }).ToList(),
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var creado = (await res.Content.ReadFromJsonAsync<Envelope<PedidoCreadoDto>>())!.Data;
        return creado.Id;
    }

    private async Task<PedidoDetalleDto> GetPedidoAsync(HttpClient client, int pedidoId)
    {
        var res = await client.GetAsync($"/api/pedidos/{pedidoId}");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await res.Content.ReadFromJsonAsync<Envelope<PedidoDetalleDto>>())!.Data;
    }

    // ── Tests ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task PedidoPendiente_PuedeCambiarCantidadesAnadirYQuitarProductos()
    {
        var client = await _factory.CreateAuthenticatedClientAsync();
        var clienteId = SeedCliente();
        var pQueda = SeedProducto(10m);   // 2 → 5
        var pQuita = SeedProducto(10m);   // se elimina del pedido
        var pAnade = SeedProducto(10m, precioVenta: 7m); // se añade

        var pedidoId = await CrearPedidoAsync(client, clienteId, (pQueda, 2m), (pQuita, 3m));

        var res = await client.PutAsJsonAsync($"/api/pedidos/{pedidoId}/lineas", new
        {
            items = new object[]
            {
                new { productoId = pQueda, cantidad = 5m, precioUnitario = 5m, descuento = 0m, motivo = "precio acordado" },
                new { productoId = pAnade, cantidad = 4m, precioUnitario = 7m, descuento = 0m, motivo = "" },
            },
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var detalle = await GetPedidoAsync(client, pedidoId);
        detalle.Estado.Should().Be("Pendiente");
        detalle.Lineas.Should().HaveCount(2, because: "una línea se quitó y otra se añadió");
        detalle.Lineas.Single(l => l.ProductoId == pQueda).Cantidad.Should().Be(5m);
        detalle.Lineas.Should().NotContain(l => l.ProductoId == pQuita);

        // 5 x 5 = 25 + 4 x 7 = 28 → base 53, IVA 10% = 5,3 → total 58,3
        detalle.Subtotal.Should().Be(53m);
        detalle.IvaTotal.Should().Be(5.3m);
        detalle.Total.Should().Be(58.3m);
        detalle.Lineas.Single(l => l.ProductoId == pQueda).MotivoPrecioEspecial
            .Should().Be("precio acordado");
    }

    [Fact]
    public async Task PedidoConfirmado_NoPermiteModificarLineas()
    {
        var client = await _factory.CreateAuthenticatedClientAsync();
        var clienteId = SeedCliente();
        var productoId = SeedProducto(10m);

        var pedidoId = await CrearPedidoAsync(client, clienteId, (productoId, 2m));
        var confirmar = await client.PostAsync($"/api/pedidos/{pedidoId}/confirmar", null);
        confirmar.StatusCode.Should().Be(HttpStatusCode.OK);

        var res = await client.PutAsJsonAsync($"/api/pedidos/{pedidoId}/lineas", new
        {
            items = new[] { new { productoId, cantidad = 1m, precioUnitario = 5m, descuento = 0m, motivo = "" } },
        });

        ((int)res.StatusCode).Should().BeInRange(400, 422);
        var err = (await res.Content.ReadFromJsonAsync<ErrorEnvelope>())!;
        err.Errors[0].Should().Contain("Pendiente",
            because: "un pedido confirmado ya no admite cambios en sus líneas");
    }

    [Fact]
    public async Task AumentarCantidad_SinStockEnElOrigen_Falla()
    {
        var client = await _factory.CreateAuthenticatedClientAsync();
        var clienteId = SeedCliente();
        var productoId = SeedProducto(5m);

        var pedidoId = await CrearPedidoAsync(client, clienteId, (productoId, 1m));

        var res = await client.PutAsJsonAsync($"/api/pedidos/{pedidoId}/lineas", new
        {
            items = new[] { new { productoId, cantidad = 9m, precioUnitario = 5m, descuento = 0m, motivo = "" } },
        });

        ((int)res.StatusCode).Should().BeInRange(400, 422);
        var err = (await res.Content.ReadFromJsonAsync<ErrorEnvelope>())!;
        err.Errors[0].Should().Contain("Stock insuficiente",
            because: "subir la cantidad por encima del stock se avisa antes de confirmar");
    }

    [Fact]
    public async Task CambiarSoloElPrecio_NoExigeStock()
    {
        var client = await _factory.CreateAuthenticatedClientAsync();
        var clienteId = SeedCliente();
        var productoId = SeedProducto(3m);

        var pedidoId = await CrearPedidoAsync(client, clienteId, (productoId, 3m));

        // El stock se agota por otras ventas: un cambio de precio no debe bloquearse
        SetStockDisponible(productoId, 0m);

        var res = await client.PutAsJsonAsync($"/api/pedidos/{pedidoId}/lineas", new
        {
            items = new[] { new { productoId, cantidad = 3m, precioUnitario = 6.5m, descuento = 0m, motivo = "" } },
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "si la cantidad no sube, no se exige stock");

        var detalle = await GetPedidoAsync(client, pedidoId);
        detalle.Lineas.Single().PrecioUnitario.Should().Be(6.5m);
        detalle.Subtotal.Should().Be(19.5m);
    }

    [Fact]
    public async Task SinLineas_OCantidadCero_NoSeGuarda()
    {
        var client = await _factory.CreateAuthenticatedClientAsync();
        var clienteId = SeedCliente();
        var productoId = SeedProducto(10m);
        var pedidoId = await CrearPedidoAsync(client, clienteId, (productoId, 2m));

        var vacio = await client.PutAsJsonAsync($"/api/pedidos/{pedidoId}/lineas", new
        {
            items = Array.Empty<object>(),
        });
        ((int)vacio.StatusCode).Should().BeInRange(400, 422);

        var cero = await client.PutAsJsonAsync($"/api/pedidos/{pedidoId}/lineas", new
        {
            items = new[] { new { productoId, cantidad = 0m, precioUnitario = 5m, descuento = 0m, motivo = "" } },
        });
        ((int)cero.StatusCode).Should().BeInRange(400, 422);

        // El pedido original no se ha tocado
        var detalle = await GetPedidoAsync(client, pedidoId);
        detalle.Lineas.Should().HaveCount(1);
        detalle.Lineas.Single().Cantidad.Should().Be(2m);
    }

    // ── DTOs ────────────────────────────────────────────────────────────────

    private record Envelope<T>(T Data);
    private record ErrorEnvelope(List<string> Errors);
    private record PedidoCreadoDto(int Id, string NumeroPedido, decimal Total);

    private record PedidoDetalleDto(
        int Id, string NumeroPedido, string Estado,
        decimal Subtotal, decimal IvaTotal, decimal Total,
        List<LineaDto> Lineas);

    private record LineaDto(
        int ProductoId, string ProductoNombre,
        decimal Cantidad, decimal PrecioUnitario, decimal Descuento,
        decimal IvaPorcentaje, decimal RecargoEquivalenciaPorcentaje,
        decimal Subtotal, string? MotivoPrecioEspecial);
}
