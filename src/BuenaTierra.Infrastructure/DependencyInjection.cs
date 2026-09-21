using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Infrastructure.Persistence;
using BuenaTierra.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BuenaTierra.Infrastructure;

/// <summary>
/// Registro de todos los servicios de Infrastructure en el contenedor DI.
/// Llamado desde Program.cs del API project.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        // Cadena de conexión: se lee de configuración (p.ej. ConnectionStrings__DefaultConnection en Docker)
        // o, en local, se construye desde variables de entorno (.env). Nunca credenciales hardcodeadas.
        var connectionString = config.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            connectionString = BuildConnectionStringFromEnvironment();
        }

        // Base de datos PostgreSQL con Npgsql
        services.AddDbContext<AppDbContext>(options =>
        {
            options.UseNpgsql(
                connectionString + ";Maximum Pool Size=50;Minimum Pool Size=5",
                npgsqlOptions =>
                {
                    npgsqlOptions.CommandTimeout(30);
                    // Nota: EnableRetryOnFailure es incompatible con transacciones manuales (FIFO ACID).
                    // El retry lo gestionamos a nivel de aplicación si es necesario.
                }
            );
#if DEBUG
            options.EnableSensitiveDataLogging();
            options.EnableDetailedErrors();
#endif
        });

        // Unit of Work y Repositorios
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Servicios de dominio
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<ILoteAsignacionService, LoteAsignacionService>();
        services.AddScoped<IFacturaService, FacturaService>();
        services.AddScoped<IProduccionService, ProduccionService>();
        services.AddScoped<ISerieFacturacionService, SerieFacturacionService>();
        services.AddScoped<IStockService, StockService>();

        return services;
    }

    private static string BuildConnectionStringFromEnvironment()
    {
        var host = Environment.GetEnvironmentVariable("POSTGRES_HOST") ?? "127.0.0.1";
        var port = Environment.GetEnvironmentVariable("POSTGRES_PORT") ?? "5434";
        var database = Environment.GetEnvironmentVariable("POSTGRES_DB") ?? "buenatierra";
        var username = Environment.GetEnvironmentVariable("POSTGRES_USER") ?? "buenatierra_admin";
        var password = Environment.GetEnvironmentVariable("POSTGRES_PASSWORD") ?? "";

        return $"Host={host};Port={port};Database={database};Username={username};Password={password};Pooling=true;";
    }
}
