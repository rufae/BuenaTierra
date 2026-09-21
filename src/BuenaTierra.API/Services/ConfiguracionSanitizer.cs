using System.Text.Json.Nodes;

namespace BuenaTierra.API.Services;

/// <summary>
/// Elimina de un JSON de configuración los campos sensibles (contraseñas SMTP/IMAP,
/// claves API, secretos) antes de exponerlo por la API a usuarios sin privilegios.
/// </summary>
public static class ConfiguracionSanitizer
{
    public static string Sanitize(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return json;

        try
        {
            var node = JsonNode.Parse(json);
            if (node is JsonObject obj)
                SanitizeObject(obj);

            return node?.ToJsonString() ?? json;
        }
        catch
        {
            return json;
        }
    }

    private static void SanitizeObject(JsonObject obj)
    {
        var keysToRemove = obj
            .Select(kv => kv.Key)
            .Where(IsSensitiveKey)
            .ToList();

        foreach (var key in keysToRemove)
            obj.Remove(key);

        foreach (var kv in obj.ToList())
        {
            switch (kv.Value)
            {
                case JsonObject nested:
                    SanitizeObject(nested);
                    break;
                case JsonArray array:
                    foreach (var item in array)
                        if (item is JsonObject itemObj)
                            SanitizeObject(itemObj);
                    break;
            }
        }
    }

    private static bool IsSensitiveKey(string key)
    {
        var k = key.ToLowerInvariant();
        return k.Contains("password")
            || k.Contains("apikey")
            || k.Contains("api_key")
            || k.Contains("secret");
    }
}
