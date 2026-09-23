using BuenaTierra.IntegrationTests.Infrastructure;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// GARANTÍA DE NÚMEROS: los totales de un mismo flujo de venta
/// (pedido → confirmar → albarán → factura) deben ser IDÉNTICOS al céntimo
/// en los tres documentos, y los PDFs deben generarse correctamente.
/// Regla de redondeo: cabeceras = Σ de líneas redondeadas a 2dp (Money.R2).
/// </summary>
public class TotalesCadenaIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public TotalesCadenaIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Setup: cliente con 15% descuento general + producto con precio con decimales ──

    private (int ProductoId, int ClienteId) SeedData()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var empresaId = ctx.Empresas.First().Id;

        var producto = new BuenaTierra.Domain.Entities.Producto
        {
            EmpresaId = empresaId,
            Nombre = $"Producto Totales {Guid.NewGuid():N}".Substring(0, 30),
            PrecioVenta = 3.33m,   // decimales para forzar redondeos
            IvaPorcentaje = 10,
            RequiereLote = true,
            Activo = true,
        };
        ctx.Productos.Add(producto);

        var cliente = new BuenaTierra.Domain.Entities.Cliente
        {
            EmpresaId = empresaId,
            Nombre = $"Cliente Totales {Guid.NewGuid():N}".Substring(0, 30),
            Email = $"tot-{Guid.NewGuid():N}@test.com",
            Tipo = BuenaTierra.Domain.Enums.TipoCliente.Empresa,
            DescuentoGeneral = 15m,
            AplicarImpuesto = true,
            Activo = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();

        var hoy = DateOnly.FromDateTime(DateTime.Today);
        var lote = new BuenaTierra.Domain.Entities.Lote
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            CodigoLote = $"TOT-{Guid.NewGuid():N}".Substring(0, 10),
            FechaFabricacion = hoy.AddDays(-2),
            FechaCaducidad = hoy.AddDays(90),
            CantidadInicial = 50,
        };
        ctx.Lotes.Add(lote);
        ctx.SaveChanges();

        ctx.Set<BuenaTierra.Domain.Entities.Stock>().Add(new BuenaTierra.Domain.Entities.Stock
        {
            EmpresaId = empresaId,
            ProductoId = producto.Id,
            LoteId = lote.Id,
            CantidadDisponible = 50,
            CantidadReservada = 0,
            CantidadFurgoneta = 0,
        });
        ctx.SaveChanges();

        return (producto.Id, cliente.Id);
    }

    private static decimal Round2(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);

    private async Task<int> GetSerieIdAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/series");
        var body = await res.Content.ReadFromJsonAsync<SerieListEnvelope>();
        return body!.Data.First().Id;
    }

    // ── Test principal: cadena completa cuadra al céntimo ────────────────────

    [Fact]
    public async Task CadenaVenta_PedidoAlbaranFactura_TotalesIdenticosAlCentimo()
    {
        var (productoId, clienteId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        // 1. Crear pedido (7 x 3.33 con 15% dto → fuerza decimales)
        var crearRes = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 7 } },
        });
        crearRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var creado = (await crearRes.Content.ReadFromJsonAsync<PedidoCreadoEnvelope>())!.Data;

        // 2. Cabeceras del pedido vs fórmula exacta (Σ R2 por línea)
        var getPedido = await client.GetAsync($"/api/pedidos/{creado.Id}");
        getPedido.StatusCode.Should().Be(HttpStatusCode.OK);
        var pedido = (await getPedido.Content.ReadFromJsonAsync<PedidoDetalleEnvelope>())!.Data;

        pedido.Lineas.Should().HaveCount(1);
        var linea = pedido.Lineas[0];

        // Política: precio 3.33 (producto_base), descuento 15% (cliente_general)
        linea.PrecioUnitario.Should().Be(3.33m);
        linea.Descuento.Should().Be(15m);

        var brutoEsperado = Round2(7m * 3.33m);
        var netoEsperado = Round2(7m * 3.33m * (1 - 15m / 100));
        var ivaEsperado = Round2(netoEsperado * 10m / 100);
        var subtotalEsperado = netoEsperado;
        var descuentoEsperado = brutoEsperado - netoEsperado;
        var totalEsperado = subtotalEsperado + ivaEsperado;

        pedido.Subtotal.Should().Be(subtotalEsperado, "subtotal = Σ R2(neto)");
        pedido.DescuentoTotal.Should().Be(descuentoEsperado, "descuento = Σ R2(bruto) - Σ R2(neto)");
        pedido.IvaTotal.Should().Be(ivaEsperado, "IVA = Σ R2(IVA)");
        pedido.Total.Should().Be(totalEsperado, "total = subtotal + IVA (sin retención)");
        pedido.Lineas.Sum(l => Round2(l.Subtotal)).Should().Be(pedido.Subtotal, "Σ de líneas = cabecera");

        // 3. Confirmar → albarán: mismas cabeceras que el pedido
        (await client.PostAsJsonAsync($"/api/pedidos/{creado.Id}/confirmar", new { }))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var crearAlb = await client.PostAsJsonAsync($"/api/pedidos/{creado.Id}/crear-albaran", new { });
        crearAlb.StatusCode.Should().Be(HttpStatusCode.OK);
        var alb = (await crearAlb.Content.ReadFromJsonAsync<AlbaranCreadoEnvelope>())!.Data;

        var getAlb = await client.GetAsync($"/api/albaranes/{alb.Id}");
        getAlb.StatusCode.Should().Be(HttpStatusCode.OK);
        var albaran = (await getAlb.Content.ReadFromJsonAsync<AlbaranDetalleEnvelope>())!.Data;

        albaran.Subtotal.Should().Be(pedido.Subtotal, "albarán.subtotal = pedido.subtotal");
        albaran.Total.Should().Be(pedido.Total, "albarán.total = pedido.total");

        // 4. Albarán → factura: mismas cabeceras
        var convertirRes = await client.PostAsJsonAsync(
            $"/api/albaranes/{alb.Id}/convertir-factura", new { serieId = await GetSerieIdAsync(client) });
        convertirRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var facturaCreada = (await convertirRes.Content.ReadFromJsonAsync<FacturaCreadaEnvelope>())!.Data;

        var getFac = await client.GetAsync($"/api/facturas/{facturaCreada.FacturaId}");
        getFac.StatusCode.Should().Be(HttpStatusCode.OK);
        var factura = (await getFac.Content.ReadFromJsonAsync<FacturaDetalleEnvelope>())!.Data;

        factura.BaseImponible.Should().Be(pedido.Subtotal, "factura.base = pedido.subtotal (mismas líneas redondeadas)");
        factura.Total.Should().Be(pedido.Total, "factura.total = pedido.total → los tres documentos cuadran al céntimo");
        factura.Lineas.Sum(l => Round2(l.Subtotal)).Should().Be(factura.BaseImponible, "Σ R2 de líneas = base");
    }

    [Fact]
    public async Task PedidoYAlbaran_PDFs_SonValidos()
    {
        var (productoId, clienteId) = SeedData();
        var client = await _factory.CreateAuthenticatedClientAsync();

        var crearRes = await client.PostAsJsonAsync("/api/pedidos/crear", new
        {
            clienteId,
            origenStock = "Fabrica",
            items = new[] { new { productoId, cantidad = 3 } },
        });
        var creado = (await crearRes.Content.ReadFromJsonAsync<PedidoCreadoEnvelope>())!.Data;

        // PDF del pedido
        var pdfPedido = await client.GetAsync($"/api/pedidos/{creado.Id}/pdf");
        pdfPedido.StatusCode.Should().Be(HttpStatusCode.OK);
        pdfPedido.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");
        var bytesPedido = await pdfPedido.Content.ReadAsByteArrayAsync();
        Encoding.ASCII.GetString(bytesPedido, 0, 4).Should().Be("%PDF");

        // Albarán + su PDF
        (await client.PostAsJsonAsync($"/api/pedidos/{creado.Id}/confirmar", new { }))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        var crearAlb = await client.PostAsJsonAsync($"/api/pedidos/{creado.Id}/crear-albaran", new { });
        var alb = (await crearAlb.Content.ReadFromJsonAsync<AlbaranCreadoEnvelope>())!.Data;

        var pdfAlb = await client.GetAsync($"/api/albaranes/{alb.Id}/pdf");
        pdfAlb.StatusCode.Should().Be(HttpStatusCode.OK);
        pdfAlb.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");
        var bytesAlb = await pdfAlb.Content.ReadAsByteArrayAsync();
        Encoding.ASCII.GetString(bytesAlb, 0, 4).Should().Be("%PDF");
    }

    // ── DTOs ────────────────────────────────────────────────────────────────

    private record PedidoCreadoEnvelope(PedidoCreadoDto Data);
    private record PedidoCreadoDto(int Id, string NumeroPedido, decimal Total);

    private record PedidoDetalleEnvelope(PedidoDetalleDto Data);
    private record PedidoDetalleDto(
        int Id, string NumeroPedido, string Estado, decimal Subtotal, decimal DescuentoTotal,
        decimal IvaTotal, decimal RecargoEquivalenciaTotal, decimal RetencionTotal, decimal Total,
        List<PedidoLineaDto> Lineas, string OrigenStock);
    private record PedidoLineaDto(int ProductoId, string ProductoNombre, decimal Cantidad,
        decimal PrecioUnitario, decimal Descuento, decimal Subtotal, decimal IvaImporte);

    private record AlbaranCreadoEnvelope(AlbaranCreadoDto Data);
    private record AlbaranCreadoDto(int Id, string NumeroAlbaran, decimal Total);

    private record AlbaranDetalleEnvelope(AlbaranDetalleDto Data);
    private record AlbaranDetalleDto(int Id, string NumeroAlbaran, string Estado,
        decimal Subtotal, decimal IvaTotal, decimal Total);

    private record FacturaCreadaEnvelope(FacturaCreadaDto Data);
    private record FacturaCreadaDto(int FacturaId, string NumeroFactura, decimal Total);

    private record FacturaDetalleEnvelope(FacturaDetalleDto Data);
    private record FacturaDetalleDto(int Id, string NumeroFactura,
        decimal BaseImponible, decimal IvaTotal, decimal Total, List<FacturaLineaDto> Lineas);
    private record FacturaLineaDto(int ProductoId, string ProductoNombre, decimal Cantidad,
        decimal PrecioUnitario, decimal Descuento, decimal Subtotal, decimal IvaImporte);

    private record SerieListEnvelope(List<SerieDto> Data);
    private record SerieDto(int Id, string Codigo, string? Descripcion);
}
