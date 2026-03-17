using BuenaTierra.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Testcontainers.PostgreSql;

namespace BuenaTierra.IntegrationTests.Infrastructure;

/// <summary>
/// WebApplicationFactory que lanza la API real contra un PostgreSQL efímero (Testcontainer).
/// Implementa IAsyncLifetime de xUnit para crear/destruir el contenedor por collection.
/// </summary>
public sealed class BuenaTierraWebAppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder()
        .WithImage("postgres:15-alpine")
        .WithDatabase("buenatierra_test")
        .WithUsername("postgres")
        .WithPassword("postgres_test_pw")
        .Build();

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    public async Task InitializeAsync()
    {
        await _db.StartAsync();
    }

    public new async Task DisposeAsync()
    {
        await _db.StopAsync();
        await base.DisposeAsync();
    }

    // ── Override de configuración ─────────────────────────────────────────────

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // NOTE: Do NOT override Jwt:Secret here via ConfigureAppConfiguration.
        // With minimal hosting, Program.cs reads builder.Configuration["Jwt:Secret"]
        // at build time BEFORE ConfigureAppConfiguration overrides are applied.
        // AuthService reads IConfiguration at request time AFTER overrides.
        // This mismatch causes signing key ≠ validation key → 401.
        // Solution: let both use the same secret from appsettings.json.

        builder.ConfigureServices(services =>
        {
            // Reemplazar la cadena de conexión con la del Testcontainer
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (descriptor != null)
                services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(opts =>
                opts.UseNpgsql(_db.GetConnectionString() + ";Include Error Detail=true")
                    .EnableDetailedErrors()
                    .EnableSensitiveDataLogging()
                    .LogTo(_ => { }, LogLevel.None));  // silenciar SQL en tests

            // Crear schema desde el modelo EF (no hay migraciones, se usa code-first)
            var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            ctx.Database.EnsureCreated();

            // Seed mínimo: empresa + user admin para poder hacer login en tests
            SeedTestData(ctx);
        });
    }

    // ── Seed de datos mínimos ─────────────────────────────────────────────────

    private static void SeedTestData(AppDbContext ctx)
    {
        if (ctx.Empresas.Any()) return;

        var empresa = new BuenaTierra.Domain.Entities.Empresa
        {
            Nombre      = "BuenaTierra Test S.L.",
            Nif         = "B12345678",
            Direccion   = "Calle Test 1",
            Activa      = true,
        };
        ctx.Empresas.Add(empresa);
        ctx.SaveChanges();

        var admin = new BuenaTierra.Domain.Entities.Usuario
        {
            EmpresaId    = empresa.Id,
            Nombre       = "Admin",
            Apellidos    = "Test",
            Email        = "admin@test.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Test#1234"),
            Rol          = BuenaTierra.Domain.Enums.RolUsuario.Admin,
            Activo       = true,
        };
        ctx.Usuarios.Add(admin);

        var serie = new BuenaTierra.Domain.Entities.SerieFacturacion
        {
            EmpresaId   = empresa.Id,
            Codigo      = "TF",
            Prefijo     = "TF",
            UltimoNumero = 0,
            Activa      = true,
        };
        ctx.SeriesFacturacion.Add(serie);
        ctx.SaveChanges();
    }

    // ── Helper: HttpClient ya autenticado ────────────────────────────────────

    /// <summary>Returns the test empresa Id from the seed data.</summary>
    public int GetEmpresaId()
    {
        using var scope = Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return ctx.Empresas.First().Id;
    }

    public async Task<HttpClient> CreateAuthenticatedClientAsync(
        string email    = "admin@test.com",
        string password = "Test#1234")
    {
        var client = CreateClient();

        // Obtener EmpresaId del seed (primera empresa)
        using var scope = Services.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var empresaId = ctx.Empresas.First().Id;

        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new { email, password, empresaId });
        loginRes.EnsureSuccessStatusCode();

        var body = await loginRes.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", body!.Data.Token);
        return client;
    }

    // ── DTOs internos de ayuda ────────────────────────────────────────────────

    private record LoginResponse(LoginData Data);
    private record LoginData(string Token);
}
