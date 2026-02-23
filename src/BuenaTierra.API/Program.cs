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
// SEED (solo en Development si no hay usuarios)
// ============================================================
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var ctx = scope.ServiceProvider.GetRequiredService<BuenaTierra.Infrastructure.Persistence.AppDbContext>();
    if (!ctx.Usuarios.Any())
    {
        var empresa = ctx.Empresas.FirstOrDefault();
        if (empresa != null)
        {
            ctx.Usuarios.Add(new BuenaTierra.Domain.Entities.Usuario
            {
                EmpresaId = empresa.Id,
                Nombre = "Admin",
                Apellidos = "BuenaTierra",
                Email = "admin@buenatierra.com",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin#BuenaTierra2025"),
                Rol = BuenaTierra.Domain.Enums.RolUsuario.Admin,
                Activo = true
            });
            ctx.SaveChanges();
            Log.Information("Usuario admin creado: admin@buenatierra.com / Admin#BuenaTierra2025");
        }
    }
}

Log.Information("BuenaTierra API iniciando en entorno {Environment}", app.Environment.EnvironmentName);
app.Run();
