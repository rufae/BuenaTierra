using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.IntegrationTests.Infrastructure;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Tests de integración del endpoint POST /api/pedidos/{id}/devolver.
/// Cubre: repuesto según motivo, no-repuesto por caducidad, destino Furgoneta,
/// límite de "ya devuelto" en la MISMA petición (bug A) y venta previa (bug B).
/// </summary>
public class DevolucionIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public DevolucionIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Setup ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Crea un pedido en estado Confirmado con reserva de 10 uds de un lote,
    /// stock ya consumido (disponible=0) y el movimiento Venta "pedido_confirmado".
    /// conVenta=false omite la Venta (para probar el bug B).
    /// </summary>
    private (int PedidoId, int ProductoId, int LoteId) SeedPedidoConfirmado(bool conVenta = true, OrigenStock origen = OrigenStock.Fabrica)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var empresaId = ctx.Empresas.First().Id;
        var userId = ctx.Usuarios.First().Id;

        var producto = new Producto
        {
            EmpresaId = empresaId,
            Nombre = $"Producto DevTest {Guid.NewGuid():N}",
            PrecioVenta = 2.50m,
            IvaPorcentaje = 10,
            RequiereLote = true,
            Activo = true,
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var lote = new Lote
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            CodigoLote = $"DV-{Guid.NewGuid():N}[..8]",
            FechaFabricacion = hoy.AddDays(-5),
            FechaCaducidad = hoy.AddDays(30),
            CantidadInicial = 10,
        };
        lote.CodigoLote = $"DV-{Guid.NewGuid():N}".Substring(0, 10);
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        ctx.Set<Stock>().Add(new Stock
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            LoteId = lote.Id,
            CantidadDisponible = 0,   // consumido al confirmar
            CantidadReservada = 0,
            CantidadFurgoneta = 0,
        });

        var cliente = new Cliente
        {
            EmpresaId = empresaId,
            Nombre = $"Cliente DevTest {Guid.NewGuid():N}",
            Email = $"dev-{Guid.NewGuid():N}@test.com",
            Tipo = TipoCliente.Empresa,
            Activo = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();

        var reservaJson = JsonSerializer.Serialize(new[]
        {
            new { LoteId = lote.Id, CodigoLote = lote.CodigoLote, Cantidad = 10m }
        });

        var pedido = new Pedido
        {
            EmpresaId = empresaId,
            ClienteId = cliente.Id,
            UsuarioId = userId,
            NumeroPedido = $"PED-DEV-{Guid.NewGuid():N}".Substring(0, 20),
            FechaPedido = hoy,
            Estado = EstadoPedido.Confirmado,
            OrigenStock = origen,
            Subtotal = 25m,
            Total = 27.5m,
            Lineas = new List<PedidoLinea>
            {
                new()
                {
                    ProductoId = producto.Id,
                    Descripcion = producto.Nombre,
                    Cantidad = 10m,
                    PrecioUnitario = 2.50m,
                    Descuento = 0,
                    IvaPorcentaje = 10,
                    ReservaLotesJson = reservaJson,
                    Orden = 0,
                }
            }
        };
        ctx.Pedidos.Add(pedido);
        ctx.SaveChanges(); // generar el Id del pedido antes de referenciarlo en movimientos

        if (conVenta)
        {
            ctx.Set<MovimientoStock>().Add(new MovimientoStock
            {
                EmpresaId = empresaId,
                ProductoId = producto.Id,
                LoteId = lote.Id,
                Tipo = TipoMovimientoStock.Venta,
                Cantidad = 10m,
                CantidadAntes = 10m,
                CantidadDespues = 0m,
                ReferenciaTipo = "pedido_confirmado",
                ReferenciaId = pedido.Id,
                UsuarioId = userId,
            });
            ctx.SaveChanges();
        }

        return (pedido.Id, producto.Id, lote.Id);
    }

    private decimal GetStockDisponible(int productoId, int loteId)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return ctx.Set<Stock>()
            .Where(s => s.ProductoId == productoId && s.LoteId == loteId)
            .Select(s => (decimal?)s.CantidadDisponible)
            .FirstOrDefault() ?? 0m;
    }

    private decimal GetStockFurgoneta(int productoId, int loteId)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return ctx.Set<Stock>()
            .Where(s => s.ProductoId == productoId && s.LoteId == loteId)
            .Select(s => (decimal?)s.CantidadFurgoneta)
            .FirstOrDefault() ?? 0m;
    }

    // ── Tests ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Devolver_Voluntaria_ReponeStockEnFabrica()
    {
        var (pedidoId, productoId, loteId) = SeedPedidoConfirmado();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync($"/api/pedidos/{pedidoId}/devolver", new
        {
            items = new[]
            {
                new { productoId, loteId, cantidad = 4, motivo = "DevolucionVoluntaria", destino = "Fabrica" }
            }
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        GetStockDisponible(productoId, loteId).Should().Be(4m,
            because: "una devolución voluntaria repone stock en fábrica");
        GetStockFurgoneta(productoId, loteId).Should().Be(0m);
    }

    [Fact]
    public async Task Devolver_Caducidad_NoReponeStock()
    {
        var (pedidoId, productoId, loteId) = SeedPedidoConfirmado();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync($"/api/pedidos/{pedidoId}/devolver", new
        {
            items = new[]
            {
                new { productoId, loteId, cantidad = 3, motivo = "Caducidad", destino = "Fabrica" }
            }
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        GetStockDisponible(productoId, loteId).Should().Be(0m,
            because: "la caducidad NUNCA repone stock");
    }

    [Fact]
    public async Task Devolver_DestinoFurgoneta_ReponeEnFurgoneta()
    {
        var (pedidoId, productoId, loteId) = SeedPedidoConfirmado();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync($"/api/pedidos/{pedidoId}/devolver", new
        {
            items = new[]
            {
                new { productoId, loteId, cantidad = 5, motivo = "DevolucionVoluntaria", destino = "Furgoneta" }
            }
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        GetStockDisponible(productoId, loteId).Should().Be(5m,
            because: "el total sube con el repuesto");
        GetStockFurgoneta(productoId, loteId).Should().Be(5m,
            because: "el destino Furgoneta incrementa también la porción de furgoneta");
    }

    [Fact]
    public async Task Devolver_DosItemsMismoLoteEnUnaPeticion_NoExcedeReserva()
    {
        // BUG A: dos items del MISMO lote en una petición deben acumular el "ya devuelto".
        var (pedidoId, productoId, loteId) = SeedPedidoConfirmado();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync($"/api/pedidos/{pedidoId}/devolver", new
        {
            items = new[]
            {
                new { productoId, loteId, cantidad = 6, motivo = "DevolucionVoluntaria" },
                new { productoId, loteId, cantidad = 6, motivo = "DevolucionVoluntaria" },
            }
        });

        ((int)res.StatusCode).Should().BeInRange(400, 422,
            because: "6+6=12 supera la reserva de 10: la segunda petición debe rechazarse");
        GetStockDisponible(productoId, loteId).Should().Be(0m,
            because: "la transacción debe haberse revertido completo");
    }

    [Fact]
    public async Task Devolver_SinVentaPrevia_NoReponeStock_AvisaEnMensaje()
    {
        // BUG B: pedido sin movimiento Venta registrado → no inflar stock.
        var (pedidoId, productoId, loteId) = SeedPedidoConfirmado(conVenta: false);
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync($"/api/pedidos/{pedidoId}/devolver", new
        {
            items = new[]
            {
                new { productoId, loteId, cantidad = 4, motivo = "DevolucionVoluntaria" }
            }
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        GetStockDisponible(productoId, loteId).Should().Be(0m,
            because: "sin venta previa registrada NO se repone (evita inflar stock)");

        var body = await res.Content.ReadFromJsonAsync<DevolucionEnvelope>();
        body!.Message.Should().Contain("venta previa",
            because: "la respuesta debe avisar de que no se repuso");
    }

    [Fact]
    public async Task Devolver_MotivoOtro_SinDescripcion_Retorna400()
    {
        var (pedidoId, productoId, loteId) = SeedPedidoConfirmado();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync($"/api/pedidos/{pedidoId}/devolver", new
        {
            items = new[]
            {
                new { productoId, loteId, cantidad = 1, motivo = "Otro" }
            }
        });

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            because: "el motivo 'Otro' exige descripción");
    }

    [Fact]
    public async Task Devolver_CampoLegadoEsCaducidad_SigueFuncionando()
    {
        // Compatibilidad: clientes viejos envían solo esCaducidad.
        var (pedidoId, productoId, loteId) = SeedPedidoConfirmado();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.PostAsJsonAsync($"/api/pedidos/{pedidoId}/devolver", new
        {
            items = new[]
            {
                new { productoId, loteId, cantidad = 2, esCaducidad = true }
            }
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        GetStockDisponible(productoId, loteId).Should().Be(0m,
            because: "esCaducidad=true legado debe mapearse a Caducidad (no repone)");
    }

    // ── DTOs ────────────────────────────────────────────────────────────────

    private record DevolucionEnvelope(string? Data, string? Message);
}
