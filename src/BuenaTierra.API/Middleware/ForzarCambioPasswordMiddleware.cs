using System.Security.Claims;
using System.Text.Json;

namespace BuenaTierra.API.Middleware;

/// <summary>
/// Bloquea el acceso a la API (excepto los endpoints de autenticación y consulta de
/// perfil/empresa) a los usuarios que tienen pendiente el cambio de contraseña obligatorio.
/// Refuerza a nivel de backend el flujo de "cambiar contraseña en el primer login".
/// </summary>
public class ForzarCambioPasswordMiddleware
{
    private readonly RequestDelegate _next;

    public ForzarCambioPasswordMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true
            && string.Equals(user.FindFirstValue("debe_cambiar_password"), "true", StringComparison.OrdinalIgnoreCase))
        {
            var path = context.Request.Path.Value ?? string.Empty;
            var method = context.Request.Method;

            var permitido =
                path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase)
                || (string.Equals(path, "/api/empresa", StringComparison.OrdinalIgnoreCase) && method == HttpMethods.Get)
                || (string.Equals(path, "/api/usuarios/me", StringComparison.OrdinalIgnoreCase) && method == HttpMethods.Get);

            if (!permitido)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";
                var body = JsonSerializer.Serialize(new
                {
                    success = false,
                    message = "Debes cambiar tu contraseña antes de continuar",
                    errors = new[] { "Debes cambiar tu contraseña antes de continuar" }
                });
                await context.Response.WriteAsync(body);
                return;
            }
        }

        await _next(context);
    }
}
