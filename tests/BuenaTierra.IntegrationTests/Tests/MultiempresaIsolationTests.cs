using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Infrastructure.Persistence;
using BuenaTierra.IntegrationTests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Tests de aislamiento multiempresa.
/// Verifican que ningún usuario puede leer ni modificar datos de otra empresa,
/// incluso conociendo el Id del recurso ajeno.
/// </summary>
public class MultiempresaIsolationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public MultiempresaIsolationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Crea una segunda empresa + usuario admin en esa empresa, y devuelve los Ids.
    /// Es idempotente: si ya existe la empresa "Empresa Ajena Test" la reutiliza.
    /// </summary>
    private (int empresaId, int usuarioId) SeedEmpresaAjena()
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var existing = ctx.Empresas.FirstOrDefault(e => e.Nombre == "Empresa Ajena Test S.L.");
        if (existing != null)
        {
            var existingUser = ctx.Usuarios.First(u => u.EmpresaId == existing.Id);
            return (existing.Id, existingUser.Id);
        }

        var empresa = new Empresa
        {
            Nombre    = "Empresa Ajena Test S.L.",
            Nif       = "B99999999",
            Direccion = "Calle Ajena 99",
            Activa    = true,
        };
        ctx.Empresas.Add(empresa);
        ctx.SaveChanges();

        var usuario = new Usuario
        {
            EmpresaId    = empresa.Id,
            Nombre       = "Admin",
            Apellidos    = "Ajeno",
            Email        = "admin@empresa-ajena.test",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Test#1234"),
            Rol          = RolUsuario.Admin,
            Activo       = true,
        };
        ctx.Usuarios.Add(usuario);

        var serie = new SerieFacturacion
        {
            EmpresaId    = empresa.Id,
            Codigo       = "TA",
            Prefijo      = "TA",
            UltimoNumero = 0,
            Activa       = true,
        };
        ctx.SeriesFacturacion.Add(serie);
        ctx.SaveChanges();

        return (empresa.Id, usuario.Id);
    }

    /// <summary>
    /// Inserta un cliente en la empresa ajena y devuelve su Id.
    /// </summary>
    private int SeedClienteAjeno(int empresaAjenaId)
    {
        using var scope = _factory.Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var cliente = new Cliente
        {
            EmpresaId = empresaAjenaId,
            Nombre    = "Cliente Ajeno",
            Nif       = "Z12345678",
            Email     = "ajeno@test.com",
            Activo    = true,
        };
        ctx.Clientes.Add(cliente);
        ctx.SaveChanges();
        return cliente.Id;
    }

    /// <summary>
    /// Crea un HttpClient autenticado como admin de la empresa ajena.
    /// </summary>
    private async Task<HttpClient> CreateClienteAjenoAsync(int empresaAjenaId)
    {
        var client = _factory.CreateClient();
        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email     = "admin@empresa-ajena.test",
            password  = "Test#1234",
            empresaId = empresaAjenaId,
        });
        loginRes.EnsureSuccessStatusCode();

        var body = await loginRes.Content.ReadFromJsonAsync<LoginEnvelope>();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", body!.Data.Token);
        return client;
    }

    // ═══════════════════════════════════════════════════════
    // TEST 1: Endpoint público de lista de empresas
    // ═══════════════════════════════════════════════════════

    [Fact]
    public async Task ListaEmpresas_SinAuth_RetornaEmpresasActivas()
    {
        // Asegurar que existe al menos una empresa activa
        SeedEmpresaAjena();

        var client = _factory.CreateClient(); // sin autenticar
        var res = await client.GetAsync("/api/empresa/lista");

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<ListaEmpresasEnvelope>();
        body!.Data.Should().NotBeEmpty("debe haber al menos 1 empresa activa");
    }

    // ═══════════════════════════════════════════════════════
    // TEST 2: No se puede leer clientes de otra empresa
    // ═══════════════════════════════════════════════════════

    [Fact]
    public async Task GetCliente_DeEmpresaAjena_Retorna404()
    {
        var (empresaAjenaId, _) = SeedEmpresaAjena();
        var clienteAjenoId = SeedClienteAjeno(empresaAjenaId);

        // Autenticado como empresa PROPIA (empresa de test principal)
        var client = await _factory.CreateAuthenticatedClientAsync();

        // Intentar acceder al cliente que pertenece a la empresa ajena
        var res = await client.GetAsync($"/api/clientes/{clienteAjenoId}");

        res.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "un usuario no debe poder leer clientes de otra empresa");
    }

    // ═══════════════════════════════════════════════════════
    // TEST 3: No se puede editar clientes de otra empresa
    // ═══════════════════════════════════════════════════════

    [Fact]
    public async Task PutCliente_DeEmpresaAjena_Retorna404()
    {
        var (empresaAjenaId, _) = SeedEmpresaAjena();
        var clienteAjenoId = SeedClienteAjeno(empresaAjenaId);

        var client = await _factory.CreateAuthenticatedClientAsync();

        var payload = new
        {
            Nombre    = "Intento de hijack",
            Nif       = "Z12345678",
            Email     = "hack@hack.com",
            Telefono  = (string?)null,
            Direccion = (string?)null,
            Ciudad    = (string?)null,
            CodigoPostal = (string?)null,
            TipoCliente  = "Empresa",
            Activo    = true,
        };

        var res = await client.PutAsJsonAsync($"/api/clientes/{clienteAjenoId}", payload);

        res.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "un usuario no debe poder modificar clientes de otra empresa");
    }

    // ═══════════════════════════════════════════════════════
    // TEST 4: Login con empresa equivocada retorna 401
    // ═══════════════════════════════════════════════════════

    [Fact]
    public async Task Login_UsuarioEnEmpresaEquivocada_Retorna401()
    {
        var (empresaAjenaId, _) = SeedEmpresaAjena();

        // El usuario admin@test.com pertenece a la empresa de test, NO a la ajena
        var client = _factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email     = "admin@test.com",
            password  = "Test#1234",
            empresaId = empresaAjenaId, // empresa incorrecta para este usuario
        });

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "un usuario no puede hacer login en una empresa a la que no pertenece");
    }

    // ═══════════════════════════════════════════════════════
    // TEST 5: Listado de clientes solo devuelve los propios
    // ═══════════════════════════════════════════════════════

    [Fact]
    public async Task GetClientes_SoloDevuelveClientesDeLaPropiaEmpresa()
    {
        var (empresaAjenaId, _) = SeedEmpresaAjena();
        SeedClienteAjeno(empresaAjenaId); // asegurar que hay 1 cliente ajeno

        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.GetAsync("/api/clientes");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await res.Content.ReadFromJsonAsync<ClientesListEnvelope>();

        // Ningún cliente del listado debe pertenecer a la empresa ajena
        body!.Data.Should().NotContain(
            c => c.EmpresaId == empresaAjenaId,
            "el listado de clientes no debe incluir clientes de otra empresa");
    }

    // ═══════════════════════════════════════════════════════
    // DTOs internos para deserialización de respuestas
    // ═══════════════════════════════════════════════════════

    private record LoginEnvelope(LoginData Data);
    private record LoginData(string Token);
    private record ListaEmpresasEnvelope(List<EmpresaDto> Data);
    private record EmpresaDto(int Id, string Nombre);
    private record ClientesListEnvelope(List<ClienteDto> Data);
    private record ClienteDto(int Id, int EmpresaId, string Nombre);
}
