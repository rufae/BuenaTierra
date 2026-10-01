using BuenaTierra.Application.Interfaces;

namespace BuenaTierra.API.Services;

/// <summary>
/// Retira automaticamente del stock los lotes caducados (el dia DESPUES de su
/// caducidad; el propio dia de caducidad aun se puede vender).
///
/// Se ejecuta al arrancar (tras un margen) y cada X horas
/// (`Caducados:IntervaloHoras`, por defecto 6). Tambien se puede lanzar a mano
/// con POST /api/stock/purgar-caducados (Admin).
/// </summary>
public sealed class CaducadosHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<CaducadosHostedService> _logger;
    private readonly TimeSpan _intervalo;
    private readonly TimeSpan _retrasoInicial;

    public CaducadosHostedService(
        IServiceScopeFactory scopes,
        ILogger<CaducadosHostedService> logger,
        IConfiguration configuracion)
    {
        _scopes = scopes;
        _logger = logger;
        var horas = configuracion.GetValue("Caducados:IntervaloHoras", 6);
        _intervalo = TimeSpan.FromHours(Math.Clamp(horas, 1, 168));
        var segundos = configuracion.GetValue("Caducados:RetrasoInicialSegundos", 30);
        _retrasoInicial = TimeSpan.FromSeconds(Math.Clamp(segundos, 5, 3600));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(_retrasoInicial, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var stock = scope.ServiceProvider.GetRequiredService<IStockService>();
                var resultado = await stock.PurgarCaducadosAsync(null, stoppingToken);
                if (resultado.LotesAfectados > 0)
                {
                    _logger.LogInformation(
                        "Purga de caducados: {Lotes} lote(s), {Unidades} uds retiradas ({Detalle})",
                        resultado.LotesAfectados,
                        resultado.UnidadesRetiradas,
                        string.Join("; ", resultado.Detalle));
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "La purga automatica de caducados fallo; se reintentara");
            }

            try
            {
                await Task.Delay(_intervalo, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }
}
