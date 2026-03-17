using BuenaTierra.IntegrationTests.Infrastructure;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using System.Net;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Tests de integración de trazabilidad alimentaria.
/// Verifica que el endpoint de trazabilidad identifica correctamente
/// qué clientes recibieron un lote determinado (recall simulado).
/// Reglamento CE 178/2002.
/// </summary>
public class TrazabilidadIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public TrazabilidadIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Seed ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Escenario:
    /// - Producto A → Lote X (5 uds)
    /// - Cliente 1 → factura por 3 uds del Lote X
    /// - Cliente 2 → factura por 2 uds del Lote X
    /// El recall de Lote X debe retornar Cliente 1 y Cliente 2.
    /// </summary>
    private record TrazabilidadSeed(int LoteId, string CodigoLote, int Cliente1Id, int Cliente2Id);

    private TrazabilidadSeed SeedTrazabilidad()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;
        var userId = ctx.Usuarios.First().Id;

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId     = empresaId,
            Nombre        = "Alfajores TRAZ",
            Referencia    = $"ALF-{Guid.NewGuid():N}",
            PrecioVenta   = 3m,
            IvaPorcentaje = 10,
            Activo        = true,
        };
        ctx.Productos.Add(producto);
        ctx.SaveChanges();

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var produccion = new BuenaTierra.Domain.Entities.Produccion
        {
            EmpresaId         = empresaId,
            ProductoId        = producto.Id,
            UsuarioId         = userId,
            FechaProduccion   = hoy,
            CantidadProducida = 5,
        };
        ctx.Producciones.Add(produccion);
        ctx.SaveChanges();

        var codigoLote = $"ALF-{hoy:ddMMyyyy}-{Guid.NewGuid().ToString("N")[..8]}";
        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            EmpresaId        = empresaId,
            ProductoId       = producto.Id,
            ProduccionId     = produccion.Id,
            CodigoLote       = codigoLote,
            FechaFabricacion = hoy,
            FechaCaducidad   = hoy.AddDays(20),
            CantidadInicial  = 5,
        };
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        // Stock entry
        ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
        {
            EmpresaId          = empresaId,
            ProductoId         = producto.Id,
            LoteId             = lote.Id,
            CantidadDisponible = 5,
            CantidadReservada  = 0,
        });
        ctx.SaveChanges();

        var c1 = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre    = "ClienteTraz1",
            Email     = $"traz1-{Guid.NewGuid():N}@test.com",
            Tipo      = BuenaTierra.Domain.Enums.TipoCliente.Empresa,
            Activo    = true,
        };
        var c2 = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre    = "ClienteTraz2",
            Email     = $"traz2-{Guid.NewGuid():N}@test.com",
            Tipo      = BuenaTierra.Domain.Enums.TipoCliente.Empresa,
            Activo    = true,
        };
        ctx.Clientes.AddRange(c1, c2);
        ctx.SaveChanges();

        var serie = ctx.SeriesFacturacion.First(s => s.EmpresaId == empresaId);

        // Factura cliente 1 — 3 uds
        var f1 = new BuenaTierra.Domain.Entities.Factura
        {
            EmpresaId      = empresaId,
            ClienteId      = c1.Id,
            UsuarioId      = ctx.Usuarios.First().Id,
            SerieId        = serie.Id,
            NumeroFactura  = $"TRAZ-TEST-{Guid.NewGuid():N}",
            FechaFactura   = hoy,
            Estado         = BuenaTierra.Domain.Enums.EstadoFactura.Emitida,
            Subtotal       = 9m,
            BaseImponible  = 9m,
            IvaTotal       = 0.9m,
            Total          = 9.9m,
        };
        f1.Lineas.Add(new BuenaTierra.Domain.Entities.FacturaLinea
        {
            ProductoId     = producto.Id,
            LoteId         = lote.Id,
            Cantidad       = 3,
            PrecioUnitario = 3m,
            IvaPorcentaje  = 10,
            Orden          = 1,
        });
        ctx.Facturas.Add(f1);

        // Factura cliente 2 — 2 uds
        var f2 = new BuenaTierra.Domain.Entities.Factura
        {
            EmpresaId      = empresaId,
            ClienteId      = c2.Id,
            UsuarioId      = ctx.Usuarios.First().Id,
            SerieId        = serie.Id,
            NumeroFactura  = $"TRAZ-TEST-{Guid.NewGuid():N}",
            FechaFactura   = hoy,
            Estado         = BuenaTierra.Domain.Enums.EstadoFactura.Emitida,
            Subtotal       = 6m,
            BaseImponible  = 6m,
            IvaTotal       = 0.6m,
            Total          = 6.6m,
        };
        f2.Lineas.Add(new BuenaTierra.Domain.Entities.FacturaLinea
        {
            ProductoId     = producto.Id,
            LoteId         = lote.Id,
            Cantidad       = 2,
            PrecioUnitario = 3m,
            IvaPorcentaje  = 10,
            Orden          = 1,
        });
        ctx.Facturas.Add(f2);
        ctx.SaveChanges();

        return new TrazabilidadSeed(lote.Id, codigoLote, c1.Id, c2.Id);
    }

    // ── Tests ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task TrazabilidadLote_RetornaClientesQueTuvieronEseLote()
    {
        var seed    = SeedTrazabilidad();
        var client  = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.GetAsync($"/api/trazabilidad/lote/{seed.LoteId}");

        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await res.Content.ReadFromJsonAsync<TrazabilidadResponse>();
        body!.Data.Should().NotBeNull();

        var clienteIds = body.Data.Select(t => t.ClienteId).ToList();
        clienteIds.Should().Contain(seed.Cliente1Id,
            because: "ClienteTraz1 recibió unidades del lote");
        clienteIds.Should().Contain(seed.Cliente2Id,
            because: "ClienteTraz2 recibió unidades del lote");
    }

    [Fact]
    public async Task TrazabilidadExcelExport_RetornaFicheroXlsx()
    {
        var seed   = SeedTrazabilidad();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var hoy    = DateTime.Today;
        var desde  = hoy.AddMonths(-1).ToString("yyyy-MM-dd");
        var hasta  = hoy.ToString("yyyy-MM-dd");

        var res = await client.GetAsync(
            $"/api/facturas/trazabilidad/excel?desde={desde}&hasta={hasta}");

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        res.Content.Headers.ContentType!.MediaType.Should()
            .Be("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }

    // ── DTOs ─────────────────────────────────────────────────────────────────

    private record TrazabilidadResponse(List<TrazabilidadItem> Data);
    private record TrazabilidadItem(int ClienteId, string NombreCliente, decimal Cantidad);
}
