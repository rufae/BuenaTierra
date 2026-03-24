using BuenaTierra.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using System.Text;

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
    });
services.AddEndpointsApiExplorer();

// Infrastructure (EF Core, repositorios, servicios de negocio)
services.AddInfrastructure(builder.Configuration);

// Servicios de etiquetas
services.AddSingleton<BuenaTierra.API.Services.BarcodeService>();
services.AddSingleton<BuenaTierra.API.Services.OdtVariableService>();
services.AddSingleton<BuenaTierra.API.Services.DocumentConversionService>();

// Cache en memoria (reportes, listas de productos, etc.)
services.AddMemoryCache();
services.AddResponseCaching();

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
services.AddCors(options =>
{
    options.AddPolicy("AllowClients", policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
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
app.UseAuthentication();
app.UseAuthorization();

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.MapControllers();

// ============================================================
// SEED — crea empresa y usuarios si no existen (todos los entornos)
// ============================================================
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

Log.Information("BuenaTierra API iniciando en entorno {Environment}", app.Environment.EnvironmentName);
app.Run();

// Requerido para WebApplicationFactory<Program> en tests de integración
public partial class Program { }
