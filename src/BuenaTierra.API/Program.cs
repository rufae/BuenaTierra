using BuenaTierra.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using System.Text;
using System.Threading.RateLimiting;

LoadDotEnvFromWorkspace();

var builder = WebApplication.CreateBuilder(args);

// ============================================================
// SERILOG
// ============================================================
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
    .WriteTo.File("logs/buenatierra-.txt", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 30)
    .CreateLogger();

builder.Host.UseSerilog();

// ============================================================
// SERVICIOS
// ============================================================
var services = builder.Services;

services.AddControllers()
    .AddJsonOptions(opts =>
    {
        // Serializar/deserializar enums como strings en toda la API
        opts.JsonSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter());
        opts.JsonSerializerOptions.DefaultIgnoreCondition =
            System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
        // Evitar error 500 por referencias circulares en entidades EF Core
        opts.JsonSerializerOptions.ReferenceHandler =
            System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });
services.AddEndpointsApiExplorer();
services.AddHttpContextAccessor();

// Infrastructure (EF Core, repositorios, servicios de negocio)
services.AddInfrastructure(builder.Configuration);

// Servicios de etiquetas
services.AddSingleton<BuenaTierra.API.Services.BarcodeService>();
services.AddSingleton<BuenaTierra.API.Services.OdtVariableService>();
services.AddSingleton<BuenaTierra.API.Services.DocumentConversionService>();

// BuenaTierrAI (orquestación IA segura por API)
services.AddHttpClient("BuenaTierrAI", c =>
{
    c.Timeout = TimeSpan.FromSeconds(45);
});
services.AddScoped<BuenaTierra.Application.Interfaces.IBuenaTierrAIService, BuenaTierra.API.Services.BuenaTierrAIService>();

// Cache en memoria (reportes, listas de productos, etc.)
services.AddMemoryCache();
services.AddResponseCaching();

// Rate Limiting — protección contra fuerza bruta y abuso
services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Política para login: máximo 10 intentos por minuto por IP
    options.AddFixedWindowLimiter("auth", o =>
    {
        o.PermitLimit = 10;
        o.Window = TimeSpan.FromMinutes(1);
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit = 2;
    });

    // Política general: 200 req/min por IP
    options.AddFixedWindowLimiter("general", o =>
    {
        o.PermitLimit = 200;
        o.Window = TimeSpan.FromMinutes(1);
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit = 10;
    });

    // Política para reportes pesados: 30 req/min
    options.AddFixedWindowLimiter("reportes", o =>
    {
        o.PermitLimit = 30;
        o.Window = TimeSpan.FromMinutes(1);
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit = 5;
    });
});

// JWT Authentication
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret no configurado");

services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew = TimeSpan.Zero
        };
    });

services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", p => p.RequireRole("Admin"));
    options.AddPolicy("ObradorOrAdmin", p => p.RequireRole("Admin", "Obrador"));
    options.AddPolicy("AnyRole", p => p.RequireAuthenticatedUser());
});

// CORS
// CORS — restrictivo en producción, permisivo en desarrollo/Electron
services.AddCors(options =>
{
    options.AddPolicy("AllowClients", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
        if (allowedOrigins is { Length: > 0 })
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyMethod()
                  .AllowAnyHeader()
                  .AllowCredentials();
        }
        else
        {
            // Fallback para Electron desktop (mismo equipo) y desarrollo
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
        }
    });
});

// Swagger con soporte JWT
services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "BuenaTierra API",
        Version = "v1",
        Description = "API central del sistema de gestión para obrador y repartidores"
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT: Bearer {token}",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {{new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }, Array.Empty<string>() }});
});

// ============================================================
// PIPELINE
// ============================================================
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "BuenaTierra API v1"));
}

app.UseMiddleware<BuenaTierra.API.Middleware.ErrorHandlingMiddleware>();
app.UseSerilogRequestLogging();
app.UseCors("AllowClients");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Health check
app.MapGet("/health", async (IServiceProvider sp) =>
{
    try
    {
        using var scope = sp.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<BuenaTierra.Infrastructure.Persistence.AppDbContext>();
        await ctx.Database.ExecuteSqlRawAsync("SELECT 1");
        return Results.Ok(new { status = "healthy", database = "connected", timestamp = DateTime.UtcNow });
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "Health check: base de datos no disponible");
        return Results.Json(
            new { status = "degraded", database = "disconnected", timestamp = DateTime.UtcNow },
            statusCode: 503);
    }
});

app.MapControllers();

// ============================================================
// AUTO-MIGRACIÓN — aplica upgrade scripts pendientes para .exe en cliente
// ============================================================
{
    using var migScope = app.Services.CreateScope();
    var migCtx = migScope.ServiceProvider.GetRequiredService<BuenaTierra.Infrastructure.Persistence.AppDbContext>();
    try
    {
        // Asegurar que la tabla schema_version existe
        await migCtx.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS schema_version (
                version     INTEGER NOT NULL PRIMARY KEY,
                descripcion VARCHAR(500) NOT NULL,
                applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        ");

        // Obtener versión actual
        var currentVersion = 0;
        try
        {
            var conn = migCtx.Database.GetDbConnection();
            await conn.OpenAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COALESCE(MAX(version), 0) FROM schema_version";
            var result = await cmd.ExecuteScalarAsync();
            currentVersion = Convert.ToInt32(result);
        }
        catch { /* tabla puede no existir aún en instalaciones muy antiguas */ }

        Log.Information("Schema version actual: {Version}", currentVersion);

        // Buscar scripts de upgrade en database/init/ o junto al ejecutable
        var upgradeDir = FindUpgradeScriptsDirectory();
        if (upgradeDir != null)
        {
            var scripts = Directory.GetFiles(upgradeDir, "*_upgrade_*.sql")
                .OrderBy(f => f)
                .ToArray();

            foreach (var scriptPath in scripts)
            {
                var fileName = Path.GetFileName(scriptPath);
                Log.Information("Evaluando script de migración: {Script}", fileName);

                var sql = await File.ReadAllTextAsync(scriptPath);
                // Los scripts son idempotentes, pero solo ejecutar si hay algo pendiente
                if (currentVersion < 8) // v8 es la versión actual conocida
                {
                    Log.Information("Aplicando migración: {Script}", fileName);
                    // Quitar comandos psql (\echo, \i) que no son SQL estándar
                    var cleanSql = System.Text.RegularExpressions.Regex.Replace(sql, @"^\\.*$", "", System.Text.RegularExpressions.RegexOptions.Multiline);
                    await migCtx.Database.ExecuteSqlRawAsync(cleanSql);
                    Log.Information("Migración aplicada con éxito: {Script}", fileName);
                }
            }
        }

        // Registrar versión base si no hay ninguna (instalación nueva con 01_schema.sql)
        await migCtx.Database.ExecuteSqlRawAsync(@"
            INSERT INTO schema_version (version, descripcion) VALUES
            (1, 'Esquema inicial — tablas, funciones, vistas, triggers, roles'),
            (2, 'Consolidación: named CHECK constraints, estados normalizados, schema_version'),
            (3, 'Módulo de correo integrado (correos_mensajes)'),
            (4, 'Per-user email config + IMAP inbox support'),
            (5, 'Formato código lote DDMMYYYY → DDMMYY'),
            (6, 'Reserva de stock al confirmar pedidos (reserva_lotes_json en pedidos_lineas)'),
            (7, 'Corrige UNIQUE lotes: (empresa_id, producto_id, codigo_lote)'),
            (8, 'Vida util configurable por dias o meses en productos')
            ON CONFLICT (version) DO NOTHING;
        ");

        // ── Migraciones inline de seguridad ──────────────────────────────────
        // Garantizan columnas críticas aunque los scripts .sql no estén en disco
        // (p.ej. instalación de cliente sin carpeta database/init/).
        await migCtx.Database.ExecuteSqlRawAsync(@"
            ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS vida_util_unidad VARCHAR(10);
            UPDATE productos SET vida_util_unidad = 'Dias' WHERE vida_util_unidad IS NULL OR btrim(vida_util_unidad) = '';
        ");
        try { await migCtx.Database.ExecuteSqlRawAsync("ALTER TABLE productos ALTER COLUMN vida_util_unidad SET DEFAULT 'Dias';"); } catch { }
        try { await migCtx.Database.ExecuteSqlRawAsync("ALTER TABLE productos ALTER COLUMN vida_util_unidad SET NOT NULL;"); } catch { }
        try { await migCtx.Database.ExecuteSqlRawAsync("ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_vida_util_unidad;"); } catch { }
        try { await migCtx.Database.ExecuteSqlRawAsync("ALTER TABLE productos ADD CONSTRAINT ck_productos_vida_util_unidad CHECK (vida_util_unidad IN ('Dias','Meses'));"); } catch { }

        await migCtx.Database.ExecuteSqlRawAsync(@"
            ALTER TABLE IF EXISTS pedidos_lineas ADD COLUMN IF NOT EXISTS reserva_lotes_json TEXT;
        ");
        await migCtx.Database.ExecuteSqlRawAsync(@"
            ALTER TABLE IF EXISTS usuarios ADD COLUMN IF NOT EXISTS configuracion TEXT;
        ");
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "Auto-migración: no se pudo verificar/aplicar. Continuando arranque normal.");
    }
}

// ============================================================
// SEED — crea empresa y usuarios si no existen (todos los entornos)
// ============================================================
try
{
    using var scope = app.Services.CreateScope();
    var ctx = scope.ServiceProvider.GetRequiredService<BuenaTierra.Infrastructure.Persistence.AppDbContext>();

    // Crear empresa raíz si no existe
    var empresa = ctx.Empresas.FirstOrDefault();
    if (empresa == null)
    {
        empresa = new BuenaTierra.Domain.Entities.Empresa
        {
            Nombre      = "BuenaTierra",
            Nif         = "00000000T",
            RazonSocial = "BuenaTierra Obrador Artesanal S.L.",
            EsObrador   = true,
            Activa      = true
        };
        ctx.Empresas.Add(empresa);
        ctx.SaveChanges();
        Log.Information("Empresa raíz creada: BuenaTierra");
    }

    // Admin
    if (!ctx.Usuarios.Any(u => u.Email == "admin@buenatierra.com"))
    {
        ctx.Usuarios.Add(new BuenaTierra.Domain.Entities.Usuario
        {
            EmpresaId    = empresa.Id,
            Nombre       = "Admin",
            Apellidos    = "BuenaTierra",
            Email        = "admin@buenatierra.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin#BuenaTierra2025"),
            Rol          = BuenaTierra.Domain.Enums.RolUsuario.Admin,
            Activo       = true
        });
        Log.Information("Usuario Admin creado: admin@buenatierra.com");
    }
    // Obrador
    if (!ctx.Usuarios.Any(u => u.Email == "obrador@buenatierra.com"))
    {
        ctx.Usuarios.Add(new BuenaTierra.Domain.Entities.Usuario
        {
            EmpresaId    = empresa.Id,
            Nombre       = "Usuario",
            Apellidos    = "Obrador",
            Email        = "obrador@buenatierra.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Obrador#BuenaTierra2025"),
            Rol          = BuenaTierra.Domain.Enums.RolUsuario.Obrador,
            Activo       = true
        });
        Log.Information("Usuario Obrador creado: obrador@buenatierra.com");
    }
    // Repartidor
    if (!ctx.Usuarios.Any(u => u.Email == "repartidor@buenatierra.com"))
    {
        ctx.Usuarios.Add(new BuenaTierra.Domain.Entities.Usuario
        {
            EmpresaId    = empresa.Id,
            Nombre       = "Usuario",
            Apellidos    = "Repartidor",
            Email        = "repartidor@buenatierra.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Repartidor#BuenaTierra2025"),
            Rol          = BuenaTierra.Domain.Enums.RolUsuario.Repartidor,
            Activo       = true
        });
        Log.Information("Usuario Repartidor creado: repartidor@buenatierra.com");
    }

    // Serie de facturación por defecto
    if (!ctx.SeriesFacturacion.Any(s => s.EmpresaId == empresa.Id && s.Codigo == "FAC"))
    {
        ctx.SeriesFacturacion.Add(new BuenaTierra.Domain.Entities.SerieFacturacion
        {
            EmpresaId    = empresa.Id,
            Codigo       = "FAC",
            Descripcion  = "Facturas",
            Prefijo      = "F",
            UltimoNumero = 0,
            Formato      = "{PREFIJO}{ANIO}{NUMERO:6}",
            Activa       = true
        });
    }
    if (!ctx.SeriesFacturacion.Any(s => s.EmpresaId == empresa.Id && s.Codigo == "ALB"))
    {
        ctx.SeriesFacturacion.Add(new BuenaTierra.Domain.Entities.SerieFacturacion
        {
            EmpresaId    = empresa.Id,
            Codigo       = "ALB",
            Descripcion  = "Albaranes",
            Prefijo      = "A",
            UltimoNumero = 0,
            Formato      = "{PREFIJO}{ANIO}{NUMERO:6}",
            Activa       = true
        });
    }

    ctx.SaveChanges();
}
catch (Exception ex)
{
    Log.Warning(ex, "SEED: base de datos no disponible al arrancar. La API continuará; comprueba que PostgreSQL está activo y la base de datos 'buenatierra' existe.");
}

Log.Information("BuenaTierra API iniciando en entorno {Environment}", app.Environment.EnvironmentName);
await app.RunAsync();

static string? FindUpgradeScriptsDirectory()
{
    // 1. Junto al ejecutable (publish/api/database/init/)
    var exeDir = AppContext.BaseDirectory;
    var candidate = Path.Combine(exeDir, "database", "init");
    if (Directory.Exists(candidate)) return candidate;

    // 2. Workspace relativo (desarrollo)
    var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (dir != null)
    {
        candidate = Path.Combine(dir.FullName, "database", "init");
        if (Directory.Exists(candidate)) return candidate;
        dir = dir.Parent;
    }

    return null;
}

static void LoadDotEnvFromWorkspace()
{
    var directory = new DirectoryInfo(Directory.GetCurrentDirectory());

    while (directory is not null)
    {
        var envPath = Path.Combine(directory.FullName, ".env");
        if (File.Exists(envPath))
        {
            foreach (var rawLine in File.ReadAllLines(envPath))
            {
                var line = rawLine.Trim();
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#'))
                    continue;

                var separator = line.IndexOf('=');
                if (separator <= 0)
                    continue;

                var key = line[..separator].Trim();
                var value = line[(separator + 1)..].Trim().Trim('"');

                if (string.IsNullOrWhiteSpace(key))
                    continue;

                var current = Environment.GetEnvironmentVariable(key);
                if (string.IsNullOrWhiteSpace(current))
                    Environment.SetEnvironmentVariable(key, value);
            }

            break;
        }

        directory = directory.Parent;
    }
}

// Requerido para WebApplicationFactory<Program> en tests de integración
public partial class Program { }
