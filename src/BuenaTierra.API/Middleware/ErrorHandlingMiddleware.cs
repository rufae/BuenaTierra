using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Exceptions;
using System.Text.Json;

namespace BuenaTierra.API.Middleware;

/// <summary>
/// Middleware global de manejo de errores.
/// Convierte todas las excepciones a respuestas ApiResponse estandarizadas.
/// Evita que stack traces lleguen al cliente en producción.
/// </summary>
public class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ErrorHandlingMiddleware> _logger;
    private readonly IHostEnvironment _env;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger, IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception ex)
    {
        int statusCode;
        string message;

        switch (ex)
        {
            case EntidadNotFoundException:
                statusCode = StatusCodes.Status404NotFound;
                message = ex.Message;
                _logger.LogWarning("Entidad no encontrada: {Message}", ex.Message);
                break;

            case StockInsuficienteException stockEx:
                statusCode = StatusCodes.Status422UnprocessableEntity;
                message = ex.Message;
                _logger.LogWarning("Stock insuficiente: producto={ProductoId}, solicitado={Solicitado}, disponible={Disponible}",
                    stockEx.ProductoId, stockEx.CantidadSolicitada, stockEx.CantidadDisponible);
                break;

            case NoHayLotesDisponiblesException:
                statusCode = StatusCodes.Status422UnprocessableEntity;
                message = ex.Message;
                break;

            case EstadoInvalidoException:
            case DomainException:
                statusCode = StatusCodes.Status400BadRequest;
                message = ex.Message;
                _logger.LogWarning("Error de dominio: {Message}", ex.Message);
                break;

            case UnauthorizedAccessException:
                statusCode = StatusCodes.Status403Forbidden;
                message = "Acceso no autorizado";
                break;

            default:
                statusCode = StatusCodes.Status500InternalServerError;
                message = _env.IsDevelopment() ? ex.Message : "Error interno del servidor";
                _logger.LogError(ex, "Error no controlado: {Message}", ex.Message);
                break;
        }

        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";

        var response = new
        {
            success = false,
            message,
            errors = new[] { message },
            timestamp = DateTime.UtcNow
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(response,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
    }
}

public static class ErrorHandlingMiddlewareExtensions
{
    public static IApplicationBuilder UseErrorHandling(this IApplicationBuilder app)
        => app.UseMiddleware<ErrorHandlingMiddleware>();
}
