using BuenaTierra.IntegrationTests.Infrastructure;
using System.Net;

namespace BuenaTierra.IntegrationTests.Tests;

/// <summary>
/// Tests de autenticación: login válido, credenciales erróneas,
/// acceso a endpoints protegidos sin / con token, role guard.
/// </summary>
public class AuthIntegrationTests : IClassFixture<BuenaTierraWebAppFactory>
{
    private readonly BuenaTierraWebAppFactory _factory;

    public AuthIntegrationTests(BuenaTierraWebAppFactory factory)
        => _factory = factory;

    // ── Login ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Login_ConCredencialesValidas_RetornaTokenJwt()
    {
        var client = _factory.CreateClient();

        var res = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email    = "admin@test.com",
            password = "Test#1234",
        });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<LoginEnvelope>();
        body!.Data.Token.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Login_ConPasswordIncorrecto_Retorna401()
    {
        var client = _factory.CreateClient();

        var res = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email    = "admin@test.com",
            password = "passwords_incorrecta",
        });

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_ConEmailInexistente_Retorna401()
    {
        var client = _factory.CreateClient();

        var res = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email    = "noexiste@test.com",
            password = "cualquiercosa",
        });

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Acceso a endpoints protegidos ─────────────────────────────────────────

    [Fact]
    public async Task EndpointProtegido_SinToken_Retorna401()
    {
        var client = _factory.CreateClient();

        var res = await client.GetAsync("/api/facturas");

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task EndpointProtegido_ConTokenValido_Retorna200()
    {
        var client = await _factory.CreateAuthenticatedClientAsync();

        var res = await client.GetAsync("/api/facturas");

        // 200 OK o 204 NoContent son válidos (lista vacía)
        ((int)res.StatusCode).Should().BeInRange(200, 204);
    }

    // ── Health check ──────────────────────────────────────────────────────────

    [Fact]
    public async Task HealthEndpoint_SinAutenticacion_Retorna200()
    {
        var client = _factory.CreateClient();

        var res = await client.GetAsync("/health");

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadAsStringAsync();
        body.Should().Contain("healthy");
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    private record LoginEnvelope(LoginData Data);
    private record LoginData(string Token, string RefreshToken);
}
