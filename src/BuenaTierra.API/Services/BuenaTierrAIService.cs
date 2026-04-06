using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Encodings.Web;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;

namespace BuenaTierra.API.Services;

public sealed class BuenaTierrAIService : IBuenaTierrAIService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _config;
    private readonly ILogger<BuenaTierrAIService> _logger;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IUnitOfWork _uow;

    public BuenaTierrAIService(
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment env,
        IConfiguration config,
        ILogger<BuenaTierrAIService> logger,
        IHttpContextAccessor httpContextAccessor,
        IUnitOfWork uow)
    {
        _httpClientFactory = httpClientFactory;
        _env = env;
        _config = config;
        _logger = logger;
        _httpContextAccessor = httpContextAccessor;
        _uow = uow;
    }

    public async Task<BuenaTierrAIStatusResponse> GetStatusAsync(CancellationToken ct = default)
    {
        var runtimeCfg = await ReadRuntimeConfigAsync(ct);
        var enabled = ReadEnabled(runtimeCfg);
        var apiKey = ReadApiKey(runtimeCfg);
        var model = ReadModel(runtimeCfg);
        var provider = ReadProviderBaseUrl(runtimeCfg);
        var apiKeyRequired = !IsLocalProvider(provider);
        var warnings = ValidateConfiguration(provider, model, apiKey, apiKeyRequired);

        return new BuenaTierrAIStatusResponse
        {
            Enabled = enabled,
            ApiKeyConfigured = !string.IsNullOrWhiteSpace(apiKey),
            ApiKeyRequired = apiKeyRequired,
            Model = model,
            ProviderBaseUrl = provider,
            ConfigurationValid = warnings.Count == 0,
            Warnings = warnings
        };
    }

    public async Task<BuenaTierrAIChatResponse> ChatAsync(BuenaTierrAIChatRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
            throw new DomainException("El mensaje de BuenaTierrAI no puede estar vacío");

        var runtimeCfg = await ReadRuntimeConfigAsync(ct);
        var enabled = ReadEnabled(runtimeCfg);
        if (!enabled)
            throw new DomainException("BuenaTierrAI está deshabilitado en configuración");

        var apiKey = ReadApiKey(runtimeCfg);
        var model = ReadModel(runtimeCfg);
        var providerBaseUrl = ReadProviderBaseUrl(runtimeCfg).TrimEnd('/');
        var apiKeyRequired = !IsLocalProvider(providerBaseUrl);

        if (apiKeyRequired && string.IsNullOrWhiteSpace(apiKey))
            throw new DomainException("Falta configurar la API key de BuenaTierrAI");

        var configWarnings = ValidateConfiguration(providerBaseUrl, model, apiKey, apiKeyRequired);
        if (configWarnings.Count > 0)
            throw new DomainException("Configuración inválida de BuenaTierrAI: " + string.Join(" | ", configWarnings));

        var temperature = _config.GetValue<double?>("BuenaTierrAI:Temperature")
            ?? ParseEnvDouble("BUENATIERRAI_TEMPERATURE")
            ?? 0.2;
        var maxOutputTokens = _config.GetValue<int?>("BuenaTierrAI:MaxOutputTokens") ?? 700;
        var maxHistoryMessages = _config.GetValue<int?>("BuenaTierrAI:MaxHistoryMessages") ?? 8;
        var maxToolPayloadChars = _config.GetValue<int?>("BuenaTierrAI:MaxToolPayloadChars") ?? 12000;

        var systemPrompt = BuildSystemPrompt();

        var messages = new List<Dictionary<string, string>>
        {
            new() { ["role"] = "system", ["content"] = systemPrompt }
        };

        foreach (var h in request.History.TakeLast(Math.Max(0, maxHistoryMessages)))
        {
            if (string.IsNullOrWhiteSpace(h.Content)) continue;
            var role = NormalizeRole(h.Role);
            messages.Add(new Dictionary<string, string>
            {
                ["role"] = role,
                ["content"] = h.Content.Trim()
            });
        }

        if (!string.IsNullOrWhiteSpace(request.ToolContextJson))
        {
            var toolContext = request.ToolContextJson;
            if (toolContext.Length > maxToolPayloadChars)
                toolContext = toolContext[..maxToolPayloadChars];

            messages.Add(new Dictionary<string, string>
            {
                ["role"] = "system",
                ["content"] = "CONTEXTO DE HERRAMIENTAS API (JSON):\n" + toolContext
            });

            var priorityHints = BuildPriorityContextHints(toolContext);
            if (!string.IsNullOrWhiteSpace(priorityHints))
            {
                messages.Add(new Dictionary<string, string>
                {
                    ["role"] = "system",
                    ["content"] = priorityHints
                });
            }
        }

        messages.Add(new Dictionary<string, string>
        {
            ["role"] = "user",
            ["content"] = request.Message.Trim()
        });

        var payload = new
        {
            model,
            messages,
            temperature,
            max_tokens = maxOutputTokens
        };

        var client = _httpClientFactory.CreateClient("BuenaTierrAI");
        if (!string.IsNullOrWhiteSpace(apiKey))
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var httpReq = new HttpRequestMessage(HttpMethod.Post, providerBaseUrl + "/chat/completions")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };

        using var response = await client.SendAsync(httpReq, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("BuenaTierrAI provider error {StatusCode}: {Body}", (int)response.StatusCode, raw);
            throw new DomainException("Error del proveedor IA. Verifica API key, modelo o conectividad.");
        }

        using var doc = JsonDocument.Parse(raw);
        var answer = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? string.Empty;

        var usedModel = doc.RootElement.TryGetProperty("model", out var modelNode)
            ? modelNode.GetString() ?? model
            : model;

        return new BuenaTierrAIChatResponse
        {
            Answer = answer.Trim(),
            Model = usedModel,
            TimestampUtc = DateTime.UtcNow,
            Warnings =
            [
                "La IA no accede a base de datos directamente.",
                "Los datos solo deben llegar por endpoints API autorizados."
            ]
        };
    }

    private string BuildSystemPrompt()
    {
        string root = _env.ContentRootPath;
        string aiRoot = Path.Combine(root, "BuenaTierrAI");

        string role = ReadText(Path.Combine(aiRoot, "Role", "system_role.md"));
        string context = ReadText(Path.Combine(aiRoot, "Context", "domain_context.md"));
        string guardrails = ReadText(Path.Combine(aiRoot, "Guardrails", "security_policy.md"));
        string tools = BuildPublicCapabilitiesSummary(Path.Combine(aiRoot, "Tools", "tool_manifest.json"));
        string modelProfile = ReadText(Path.Combine(aiRoot, "Model", "model_profile.json"));

        return $"""
{role}

--- CONTEXTO ---
{context}

--- SEGURIDAD ---
{guardrails}

--- CAPACIDADES FUNCIONALES DISPONIBLES ---
{tools}

--- PERFIL DE MODELO ---
{modelProfile}
""";
    }

    private static string BuildPublicCapabilitiesSummary(string toolManifestPath)
    {
        if (!File.Exists(toolManifestPath))
            return "- Operación diaria\n- Trazabilidad\n- Lotes y stock\n- Facturación y pedidos";

        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(toolManifestPath));
            if (!doc.RootElement.TryGetProperty("tools", out var toolsNode) || toolsNode.ValueKind != JsonValueKind.Array)
                return "- Operación diaria\n- Trazabilidad\n- Lotes y stock\n- Facturación y pedidos";

            var descriptions = toolsNode
                .EnumerateArray()
                .Select(t => t.TryGetProperty("description", out var d) ? d.GetString() ?? string.Empty : string.Empty)
                .Select(d => d.Trim())
                .Where(d => !string.IsNullOrWhiteSpace(d))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (descriptions.Count == 0)
                return "- Operación diaria\n- Trazabilidad\n- Lotes y stock\n- Facturación y pedidos";

            return string.Join("\n", descriptions.Select(d => "- " + d));
        }
        catch
        {
            return "- Operación diaria\n- Trazabilidad\n- Lotes y stock\n- Facturación y pedidos";
        }
    }

    private static string ReadText(string path)
        => File.Exists(path)
            ? File.ReadAllText(path)
            : string.Empty;

    private static string NormalizeRole(string? role)
    {
        if (string.IsNullOrWhiteSpace(role)) return "user";
        return role.Trim().ToLowerInvariant() switch
        {
            "assistant" => "assistant",
            "system" => "system",
            _ => "user"
        };
    }

    private bool ReadEnabled(BuenaTierrAICompanyConfig runtimeCfg)
    {
        if (runtimeCfg.Enabled.HasValue)
            return runtimeCfg.Enabled.Value;

        var envValue = Environment.GetEnvironmentVariable("BUENATIERRAI_ENABLED");
        if (bool.TryParse(envValue, out var parsed))
            return parsed;
        return _config.GetValue<bool?>("BuenaTierrAI:Enabled") ?? true;
    }

    private string ReadApiKey(BuenaTierrAICompanyConfig runtimeCfg)
    {
        if (!string.IsNullOrWhiteSpace(runtimeCfg.ApiKey))
            return runtimeCfg.ApiKey;

        var envKey = Environment.GetEnvironmentVariable("BUENATIERRAI_API_KEY");
        if (!string.IsNullOrWhiteSpace(envKey)) return envKey;

        var direct = _config["BuenaTierrAI:ApiKey"];
        if (!string.IsNullOrWhiteSpace(direct)) return direct;

        var keyFilePath = _config["BuenaTierrAI:ApiKeyFilePath"];
        if (string.IsNullOrWhiteSpace(keyFilePath))
            return string.Empty;

        var absolutePath = Path.IsPathRooted(keyFilePath)
            ? keyFilePath
            : Path.Combine(_env.ContentRootPath, keyFilePath);

        if (!File.Exists(absolutePath))
            return string.Empty;

        return File.ReadAllText(absolutePath).Trim();
    }

    private string ReadModel(BuenaTierrAICompanyConfig runtimeCfg)
        => runtimeCfg.Model
            ?? Environment.GetEnvironmentVariable("BUENATIERRAI_MODEL")
            ?? _config["BuenaTierrAI:Model"]
            ?? "gpt-4o-mini";

    private string ReadProviderBaseUrl(BuenaTierrAICompanyConfig runtimeCfg)
        => runtimeCfg.ProviderBaseUrl
            ?? Environment.GetEnvironmentVariable("BUENATIERRAI_PROVIDER_BASE_URL")
            ?? _config["BuenaTierrAI:ProviderBaseUrl"]
            ?? "https://api.openai.com/v1";

    private static bool IsLocalProvider(string providerBaseUrl)
    {
        if (string.IsNullOrWhiteSpace(providerBaseUrl))
            return false;

        if (!Uri.TryCreate(providerBaseUrl, UriKind.Absolute, out var uri))
            return false;

        var host = uri.Host.ToLowerInvariant();
        return host is "localhost" or "127.0.0.1" or "::1";
    }

    private async Task<BuenaTierrAICompanyConfig> ReadRuntimeConfigAsync(CancellationToken ct)
    {
        try
        {
            var user = _httpContextAccessor.HttpContext?.User;
            if (user is null || user.Identity?.IsAuthenticated != true)
                return new BuenaTierrAICompanyConfig();

            var empresaIdRaw = user.FindFirstValue("empresa_id");
            if (!int.TryParse(empresaIdRaw, out var empresaId))
                return new BuenaTierrAICompanyConfig();

            var empresa = await _uow.Empresas.GetByIdAsync(empresaId, ct);
            if (empresa is null || string.IsNullOrWhiteSpace(empresa.Configuracion))
                return new BuenaTierrAICompanyConfig();

            using var doc = JsonDocument.Parse(empresa.Configuracion);
            var root = doc.RootElement;
            var node = root;

            if (TryGetPropertyCaseInsensitive(root, "buenatierrAI", out var nested)
                && nested.ValueKind == JsonValueKind.Object)
            {
                node = nested;
            }

            bool? enabled = null;
            if (TryReadBool(node, "enabled", out var enabledNested)) enabled = enabledNested;
            if (enabled is null && TryReadBool(root, "BUENATIERRAI_ENABLED", out var enabledFlat)) enabled = enabledFlat;

            var model = TryReadString(node, "model") ?? TryReadString(root, "BUENATIERRAI_MODEL");
            var provider = TryReadString(node, "providerBaseUrl") ?? TryReadString(root, "BUENATIERRAI_PROVIDER_BASE_URL");
            var apiKey = TryReadString(node, "apiKey") ?? TryReadString(root, "BUENATIERRAI_API_KEY");

            return new BuenaTierrAICompanyConfig
            {
                Enabled = enabled,
                Model = model,
                ProviderBaseUrl = provider,
                ApiKey = apiKey
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo leer configuración IA de empresa");
            return new BuenaTierrAICompanyConfig();
        }
    }

    private static bool TryReadBool(JsonElement element, string propertyName, out bool value)
    {
        value = false;
        if (!TryGetPropertyCaseInsensitive(element, propertyName, out var node))
            return false;

        return node.ValueKind switch
        {
            JsonValueKind.True => (value = true) == true,
            JsonValueKind.False => true,
            JsonValueKind.String => bool.TryParse(node.GetString(), out value),
            _ => false
        };
    }

    private static string? TryReadString(JsonElement element, string propertyName)
    {
        if (!TryGetPropertyCaseInsensitive(element, propertyName, out var node))
            return null;

        if (node.ValueKind != JsonValueKind.String)
            return null;

        var raw = node.GetString()?.Trim();
        return string.IsNullOrWhiteSpace(raw) ? null : raw;
    }

    private static double? ParseEnvDouble(string key)
    {
        var raw = Environment.GetEnvironmentVariable(key);
        if (string.IsNullOrWhiteSpace(raw)) return null;
        return double.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    private static List<string> ValidateConfiguration(string providerBaseUrl, string model, string apiKey, bool apiKeyRequired)
    {
        var warnings = new List<string>();
        var provider = providerBaseUrl.Trim().ToLowerInvariant();
        var modelKey = model.Trim().ToLowerInvariant();
        var key = apiKey.Trim();

        if (provider.EndsWith("/chat/completions"))
            warnings.Add("ProviderBaseUrl no debe incluir /chat/completions; la API lo añade automáticamente.");

        if (key.StartsWith("gsk_", StringComparison.OrdinalIgnoreCase) && provider.Contains("api.openai.com"))
            warnings.Add("La API key parece de Groq (gsk_) pero el provider apunta a OpenAI.");

        if (key.StartsWith("sk-", StringComparison.OrdinalIgnoreCase) && provider.Contains("groq.com"))
            warnings.Add("La API key parece de OpenAI (sk-) pero el provider apunta a Groq.");

        if ((modelKey.StartsWith("llama-") || modelKey.StartsWith("mixtral") || modelKey.StartsWith("gemma"))
            && provider.Contains("api.openai.com"))
            warnings.Add("El modelo configurado no corresponde al endpoint de OpenAI configurado.");

        if ((modelKey.StartsWith("gpt-") || modelKey.StartsWith("o1") || modelKey.StartsWith("o3"))
            && provider.Contains("groq.com"))
            warnings.Add("El modelo configurado parece de OpenAI pero el provider apunta a Groq.");

        if (provider.Contains("localhost:11434") && !provider.EndsWith("/v1"))
            warnings.Add("Para Ollama, usa providerBaseUrl con sufijo /v1 (ej: http://localhost:11434/v1).");

        if (apiKeyRequired && string.IsNullOrWhiteSpace(key))
            warnings.Add("Falta API key para proveedor remoto.");

        return warnings;
    }

    private sealed class BuenaTierrAICompanyConfig
    {
        public bool? Enabled { get; init; }
        public string? ApiKey { get; init; }
        public string? Model { get; init; }
        public string? ProviderBaseUrl { get; init; }
    }

    private static string BuildPriorityContextHints(string toolContextJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(toolContextJson);
            var root = doc.RootElement;

            if (!TryGetPropertyCaseInsensitive(root, "ingredientesConAlergenos", out var ingredientesNode)
                || ingredientesNode.ValueKind != JsonValueKind.Array)
            {
                return string.Empty;
            }

            var ingredientesConAlergenos = new List<object>();
            foreach (var ing in ingredientesNode.EnumerateArray())
            {
                string? nombre = TryGetPropertyCaseInsensitive(ing, "nombre", out var nombreNode)
                    ? nombreNode.GetString()
                    : null;

                if (!TryGetPropertyCaseInsensitive(ing, "alergenos", out var alNode)
                    || alNode.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                var alergenos = alNode
                    .EnumerateArray()
                    .Select(a => a.GetString())
                    .Where(a => !string.IsNullOrWhiteSpace(a))
                    .Select(a => a!.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (string.IsNullOrWhiteSpace(nombre) || alergenos.Count == 0)
                    continue;

                ingredientesConAlergenos.Add(new
                {
                    nombre = nombre.Trim(),
                    alergenos
                });

                if (ingredientesConAlergenos.Count >= 60)
                    break;
            }

            if (ingredientesConAlergenos.Count == 0)
                return "PISTA DE CONTEXTO PRIORITARIA: No se detectan ingredientes con alérgenos en el contexto recibido.";

            var json = JsonSerializer.Serialize(
                ingredientesConAlergenos,
                new JsonSerializerOptions
                {
                    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
                });

            return """
PISTA DE CONTEXTO PRIORITARIA:
- Si te preguntan por ingredientes con alérgenos, responde SIEMPRE usando esta lista directamente.
- No digas "no tengo acceso" si estos datos están presentes.
- Devuelve la información en formato claro de negocio.

INGREDIENTES_CON_ALERGENOS_JSON:
""" + json;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static bool TryGetPropertyCaseInsensitive(JsonElement element, string propertyName, out JsonElement value)
    {
        foreach (var prop in element.EnumerateObject())
        {
            if (string.Equals(prop.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = prop.Value;
                return true;
            }
        }

        value = default;
        return false;
    }
}
