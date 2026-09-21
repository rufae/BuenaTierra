using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace BuenaTierra.API.Services;

/// <summary>
/// Cifrado en reposo de los campos sensibles de la configuración
/// (contraseñas SMTP/IMAP, claves API) almacenada en JSON en la base de datos.
///
/// Usa AES-256-GCM. La clave se toma de la variable de entorno CONFIG_ENCRYPTION_KEY
/// (independiente de JWT_SECRET para que rotar el JWT no rompa el descifrado).
/// Si la clave no está definida, el cifrado es un no-op (comportamiento actual).
/// </summary>
public static class ConfiguracionCrypto
{
    private const string Prefix = "enc:v1:";

    public static bool IsConfigured => GetKey() != null;

    /// <summary>Cifra los valores sensibles de un JSON (solo los que aún no están cifrados).</summary>
    public static string ProtectJson(string json)
    {
        var key = GetKey();
        if (key == null) return json;
        return Transform(json, key, encrypt: true);
    }

    /// <summary>Descifra los valores sensibles de un JSON (los que tienen el prefijo enc:v1:).</summary>
    public static string UnprotectJson(string json)
    {
        var key = GetKey();
        if (key == null) return json;
        return Transform(json, key, encrypt: false);
    }

    private static byte[]? GetKey()
    {
        var raw = Environment.GetEnvironmentVariable("CONFIG_ENCRYPTION_KEY");
        if (string.IsNullOrWhiteSpace(raw)) return null;
        // Derivar una clave de 32 bytes (AES-256) a partir del secreto configurado
        return SHA256.HashData(Encoding.UTF8.GetBytes(raw));
    }

    private static string Transform(string json, byte[] key, bool encrypt)
    {
        if (string.IsNullOrWhiteSpace(json)) return json;
        try
        {
            var node = JsonNode.Parse(json);
            if (node is JsonObject obj)
                TransformObject(obj, key, encrypt);
            return node?.ToJsonString() ?? json;
        }
        catch
        {
            return json;
        }
    }

    private static void TransformObject(JsonObject obj, byte[] key, bool encrypt)
    {
        foreach (var kv in obj.ToList())
        {
            switch (kv.Value)
            {
                case JsonObject nested:
                    TransformObject(nested, key, encrypt);
                    break;
                case JsonArray array:
                    foreach (var item in array)
                        if (item is JsonObject itemObj)
                            TransformObject(itemObj, key, encrypt);
                    break;
                case JsonValue value when IsSensitiveKey(kv.Key) && value.TryGetValue<string>(out var s):
                    obj[kv.Key] = encrypt
                        ? (s.StartsWith(Prefix, StringComparison.Ordinal) ? s : Encrypt(s, key))
                        : (s.StartsWith(Prefix, StringComparison.Ordinal) ? Decrypt(s, key) : s);
                    break;
            }
        }
    }

    private static string Encrypt(string plain, byte[] key)
    {
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plainBytes = Encoding.UTF8.GetBytes(plain);
        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[16];

        using var aes = new AesGcm(key, tag.Length);
        aes.Encrypt(nonce, plainBytes, cipherBytes, tag);

        var payload = new byte[nonce.Length + tag.Length + cipherBytes.Length];
        Buffer.BlockCopy(nonce, 0, payload, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, payload, nonce.Length, tag.Length);
        Buffer.BlockCopy(cipherBytes, 0, payload, nonce.Length + tag.Length, cipherBytes.Length);

        return Prefix + Convert.ToBase64String(payload);
    }

    private static string Decrypt(string value, byte[] key)
    {
        try
        {
            var payload = Convert.FromBase64String(value.Substring(Prefix.Length));
            var nonce = new byte[12];
            var tag = new byte[16];
            var cipherBytes = new byte[payload.Length - nonce.Length - tag.Length];

            Buffer.BlockCopy(payload, 0, nonce, 0, nonce.Length);
            Buffer.BlockCopy(payload, nonce.Length, tag, 0, tag.Length);
            Buffer.BlockCopy(payload, nonce.Length + tag.Length, cipherBytes, 0, cipherBytes.Length);

            var plainBytes = new byte[cipherBytes.Length];
            using var aes = new AesGcm(key, tag.Length);
            aes.Decrypt(nonce, cipherBytes, tag, plainBytes);

            return Encoding.UTF8.GetString(plainBytes);
        }
        catch
        {
            return value;
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
