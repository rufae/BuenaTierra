using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BuenaTierra.API.Controllers;

/// <summary>
/// WOPI (Web Application Open Platform Interface) endpoint for Collabora Online.
/// Collabora calls these to check, read, and write files.
/// Security: uses HMAC-based access_token with expiry.
/// </summary>
[ApiController]
[Route("wopi")]
[Authorize]
public class WopiController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _config;
    private readonly ILogger<WopiController> _logger;

    // HMAC key derived from JWT secret (reuse existing config)
    private byte[] HmacKey => Encoding.UTF8.GetBytes(
        _config["Jwt:Secret"] ?? "BuenaTierraWOPIFallbackKey2025!");

    public WopiController(
        IUnitOfWork uow,
        IWebHostEnvironment env,
        IConfiguration config,
        ILogger<WopiController> logger)
    {
        _uow = uow;
        _env = env;
        _config = config;
        _logger = logger;
    }

    // ═══════════════════════════════════════════════════════
    // TOKEN GENERATION (called by our API, not by Collabora)
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Generate a WOPI access token for a given file.
    /// Called by our frontend (authenticated) to get a token Collabora can use.
    /// GET /wopi/token?fileId=5&empresaId=1&userId=1&permission=edit
    /// </summary>
    [HttpGet("token")]
    public IActionResult GenerateToken(
        [FromQuery] int fileId,
        [FromQuery] string permission = "edit")
    {
        var empresaId = int.Parse(User.FindFirstValue("empresa_id")!);
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var userName = User.FindFirstValue(ClaimTypes.Name) ?? "Usuario";

        var token = CreateAccessToken(fileId, empresaId, userId, userName, permission);
        // Token valid for 8 hours
        var ttl = (long)TimeSpan.FromHours(8).TotalMilliseconds;

        return Ok(new { access_token = token, access_token_ttl = ttl });
    }

    // ═══════════════════════════════════════════════════════
    // WOPI CheckFileInfo
    // GET /wopi/files/{fileId}?access_token=xxx
    // ═══════════════════════════════════════════════════════

    [AllowAnonymous]
    [HttpGet("files/{fileId:int}")]
    public async Task<IActionResult> CheckFileInfo(int fileId, [FromQuery] string? access_token, CancellationToken ct)
    {
        var token = ResolveAccessToken(access_token);
        if (string.IsNullOrEmpty(token))
            return Unauthorized(new { error = "Missing access token" });

        var claims = ValidateAccessToken(token, fileId);
        if (claims == null)
            return Unauthorized(new { error = "Invalid or expired access token" });

        var etiqueta = await _uow.EtiquetasImportadas.GetByIdAsync(fileId, ct);
        if (etiqueta == null)
            return NotFound(new { error = "File not found" });

        if (etiqueta.EmpresaId != claims.EmpresaId)
            return Forbid();

        var fullPath = Path.Combine(_env.ContentRootPath, etiqueta.RutaArchivo);
        var fileInfo = new FileInfo(fullPath);

        var canWrite = claims.Permission == "edit";

        // WOPI CheckFileInfo response — standard fields
        // See: https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/files/checkfileinfo
        var response = new Dictionary<string, object>
        {
            ["BaseFileName"] = $"{etiqueta.Nombre}.{etiqueta.Formato.ToString().ToLowerInvariant()}",
            ["OwnerId"] = etiqueta.EmpresaId.ToString(),
            ["Size"] = fileInfo.Exists ? fileInfo.Length : etiqueta.TamanoBytes,
            ["UserId"] = claims.UserId.ToString(),
            ["UserFriendlyName"] = claims.UserName,
            ["Version"] = fileInfo.Exists ? fileInfo.LastWriteTimeUtc.Ticks.ToString() : "1",
            ["LastModifiedTime"] = fileInfo.Exists
                ? fileInfo.LastWriteTimeUtc.ToString("O")
                : DateTime.UtcNow.ToString("O"),
            // Permissions
            ["UserCanWrite"] = canWrite,
            ["UserCanNotWriteRelative"] = true,
            ["ReadOnly"] = !canWrite,
            ["SupportsLocks"] = false,
            ["SupportsUpdate"] = canWrite,
            // UI settings
            ["DisablePrint"] = false,
            ["DisableExport"] = false,
            ["DisableCopy"] = false,
            ["HideSaveOption"] = false,
            ["HideExportOption"] = false,
            ["HidePrintOption"] = false,
            ["UserCanRename"] = false,
            // PostMessage API for iframe communication
            ["PostMessageOrigin"] = GetPostMessageOrigin(),
        };

        return new JsonResult(response);
    }

    // ═══════════════════════════════════════════════════════
    // WOPI GetFile
    // GET /wopi/files/{fileId}/contents?access_token=xxx
    // ═══════════════════════════════════════════════════════

    [AllowAnonymous]
    [HttpGet("files/{fileId:int}/contents")]
    public async Task<IActionResult> GetFile(int fileId, [FromQuery] string? access_token, CancellationToken ct)
    {
        var token = ResolveAccessToken(access_token);
        if (string.IsNullOrEmpty(token))
            return Unauthorized(new { error = "Missing access token" });

        var claims = ValidateAccessToken(token, fileId);
        if (claims == null)
            return Unauthorized();

        var etiqueta = await _uow.EtiquetasImportadas.GetByIdAsync(fileId, ct);
        if (etiqueta == null)
            return NotFound();

        if (etiqueta.EmpresaId != claims.EmpresaId)
            return Forbid();

        var fullPath = Path.Combine(_env.ContentRootPath, etiqueta.RutaArchivo);
        if (!System.IO.File.Exists(fullPath))
            return NotFound();

        var bytes = await System.IO.File.ReadAllBytesAsync(fullPath, ct);
        return File(bytes, "application/octet-stream");
    }

    // ═══════════════════════════════════════════════════════
    // WOPI PutFile
    // POST /wopi/files/{fileId}/contents?access_token=xxx
    // ═══════════════════════════════════════════════════════

    [AllowAnonymous]
    [HttpPost("files/{fileId:int}/contents")]
    public async Task<IActionResult> PutFile(int fileId, [FromQuery] string? access_token, CancellationToken ct)
    {
        var token = ResolveAccessToken(access_token);
        if (string.IsNullOrEmpty(token))
            return Unauthorized(new { error = "Missing access token" });

        var claims = ValidateAccessToken(token, fileId);
        if (claims == null)
            return Unauthorized();

        if (claims.Permission != "edit")
            return StatusCode(403, new { error = "Read-only token" });

        var etiqueta = await _uow.EtiquetasImportadas.GetByIdAsync(fileId, ct);
        if (etiqueta == null)
            return NotFound();

        if (etiqueta.EmpresaId != claims.EmpresaId)
            return Forbid();

        var fullPath = Path.Combine(_env.ContentRootPath, etiqueta.RutaArchivo);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        await using var fileStream = new FileStream(fullPath, FileMode.Create, FileAccess.Write);
        await Request.Body.CopyToAsync(fileStream, ct);

        // Update file size in database
        etiqueta.TamanoBytes = fileStream.Length;
        await _uow.SaveChangesAsync(ct);

        _logger.LogInformation("WOPI PutFile: file {FileId} updated by user {UserId}, size={Size}",
            fileId, claims.UserId, fileStream.Length);

        return Ok(new { LastModifiedTime = DateTime.UtcNow.ToString("O") });
    }

    // ═══════════════════════════════════════════════════════
    // COLLABORA DISCOVERY (proxy for frontend)
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Returns the Collabora iframe URL for a given file.
    /// GET /wopi/collabora-url?fileId=5&permission=edit
    /// </summary>
    [HttpGet("collabora-url")]
    public async Task<IActionResult> GetCollaboraUrl(
        [FromQuery] int fileId, [FromQuery] string permission = "edit", CancellationToken ct = default)
    {
        var empresaId = int.Parse(User.FindFirstValue("empresa_id")!);
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var userName = User.FindFirstValue(ClaimTypes.Name) ?? "Usuario";

        var etiqueta = await _uow.EtiquetasImportadas.GetByIdAsync(fileId, ct);
        if (etiqueta == null)
            return NotFound(new { error = "File not found" });
        if (etiqueta.EmpresaId != empresaId)
            return Forbid();

        // Get discovery URL from Collabora
        var collaboraBase = _config["Collabora:BaseUrl"] ?? "http://localhost:9980";
        var discoveryUrl = $"{collaboraBase}/hosting/discovery";

        string? editorUrl = null;
        try
        {
            using var httpClient = new HttpClient();
            var discoveryXml = await httpClient.GetStringAsync(discoveryUrl, ct);

            var ext = etiqueta.Formato.ToString().ToLowerInvariant();
            var action = permission == "view" ? "view" : "edit";

            // Parse discovery XML to find urlsrc for this extension
            editorUrl = ParseDiscoveryUrl(discoveryXml, ext, action);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch Collabora discovery from {Url}", discoveryUrl);
            return StatusCode(503, new { error = "Collabora Online no disponible", detail = ex.Message });
        }

        if (editorUrl == null)
            return BadRequest(new { error = $"Collabora no soporta formato .{etiqueta.Formato}" });

        // Generate access token
        var token = CreateAccessToken(fileId, empresaId, userId, userName, permission);

        // Build WOPI src URL (how Collabora reaches our WOPI endpoints)
        var wopiHost = _config["Collabora:WopiHost"] ?? "http://host.docker.internal:5001";
        var wopiSrc = $"{wopiHost}/wopi/files/{fileId}";

        // The form POST goes directly to Collabora (cross-origin to iframe is allowed).
        // Ensure the editor URL uses HTTP scheme matching Collabora's SSL setting.
        var collaboraPublic = _config["Collabora:PublicUrl"] ?? collaboraBase;
        var editorUri = new Uri(editorUrl);
        var publicUri = new Uri(collaboraPublic);
        if (editorUri.Host != publicUri.Host || editorUri.Port != publicUri.Port)
        {
            var rewritten = new UriBuilder(editorUri)
            {
                Scheme = publicUri.Scheme,
                Host = publicUri.Host,
                Port = publicUri.Port,
            };
            editorUrl = rewritten.Uri.ToString();
        }

        // Build FORM POST URL — WOPI standard: access_token goes in POST body, not URL
        var formUrl = $"{editorUrl}WOPISrc={Uri.EscapeDataString(wopiSrc)}&lang=es";

        // Also provide legacy iframeUrl with token in query string (for backwards compat)
        var iframeUrl = $"{editorUrl}WOPISrc={Uri.EscapeDataString(wopiSrc)}&access_token={Uri.EscapeDataString(token)}&lang=es";

        var ttlMs = (long)TimeSpan.FromHours(8).TotalMilliseconds;

        return Ok(new
        {
            iframeUrl,
            formUrl, // URL for FORM POST (recommended)
            accessToken = token,
            accessTokenTtl = ttlMs,
            wopiSrc,
            fileName = etiqueta.Nombre,
            formato = etiqueta.Formato.ToString(),
        });
    }

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    private string CreateAccessToken(int fileId, int empresaId, int userId, string userName, string permission)
    {
        var expiry = DateTimeOffset.UtcNow.AddHours(8).ToUnixTimeSeconds();
        var payload = JsonSerializer.Serialize(new
        {
            fid = fileId,
            eid = empresaId,
            uid = userId,
            un = userName,
            perm = permission,
            exp = expiry,
        });
        var payloadBase64 = ToBase64Url(Encoding.UTF8.GetBytes(payload));

        using var hmac = new HMACSHA256(HmacKey);
        var signature = ToBase64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadBase64)));

        return $"{payloadBase64}.{signature}";
    }

    private WopiTokenClaims? ValidateAccessToken(string? token, int expectedFileId)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var parts = token.Split('.');
        if (parts.Length != 2) return null;

        var payloadBase64 = parts[0];
        var signature = parts[1];

        // Verify HMAC
        using var hmac = new HMACSHA256(HmacKey);
        var expected = ToBase64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadBase64)));
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(signature)))
            return null;

        // Decode payload
        try
        {
            var json = Encoding.UTF8.GetString(FromBase64Url(payloadBase64));
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var fileId = root.GetProperty("fid").GetInt32();
            var empresaId = root.GetProperty("eid").GetInt32();
            var userId = root.GetProperty("uid").GetInt32();
            var userName = root.GetProperty("un").GetString() ?? "";
            var permission = root.GetProperty("perm").GetString() ?? "view";
            var expiry = root.GetProperty("exp").GetInt64();

            // Check expiry
            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expiry)
                return null;

            // Check file ID matches
            if (fileId != expectedFileId)
                return null;

            return new WopiTokenClaims(fileId, empresaId, userId, userName, permission);
        }
        catch
        {
            return null;
        }
    }

    private string GetPostMessageOrigin()
    {
        // In development, the frontend runs on a different port
        return _env.IsDevelopment() ? "http://localhost:5173" : Request.Scheme + "://" + Request.Host;
    }

    private static string? ParseDiscoveryUrl(string xml, string extension, string action)
    {
        // Simple XML parsing for WOPI discovery
        // Look for: <action ext="odt" name="edit" urlsrc="..."/>
        var searchExt = $"ext=\"{extension}\"";
        var searchAction = $"name=\"{action}\"";

        var lines = xml.Split('\n');
        for (int i = 0; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (line.Contains(searchExt) && line.Contains(searchAction))
            {
                var urlStart = line.IndexOf("urlsrc=\"") + 8;
                var urlEnd = line.IndexOf("\"", urlStart);
                if (urlStart > 7 && urlEnd > urlStart)
                    return line[urlStart..urlEnd];
            }
            // Handle multi-line action elements
            if (line.Contains(searchExt) && i + 1 < lines.Length)
            {
                var nextLine = lines[i + 1].Trim();
                if (nextLine.Contains(searchAction))
                {
                    var combined = line + " " + nextLine;
                    var urlStart = combined.IndexOf("urlsrc=\"") + 8;
                    var urlEnd = combined.IndexOf("\"", urlStart);
                    if (urlStart > 7 && urlEnd > urlStart)
                        return combined[urlStart..urlEnd];
                }
            }
        }
        return null;
    }

    /// <summary>
    /// Resolve access_token from multiple sources: query string, X-WOPI-AccessToken header, or Authorization header.
    /// Collabora's WebSocket code path sometimes calls CheckFileInfo without the query param.
    /// </summary>
    private string? ResolveAccessToken(string? queryToken)
    {
        if (!string.IsNullOrEmpty(queryToken))
            return queryToken;

        // Try X-WOPI-AccessToken header
        if (Request.Headers.TryGetValue("X-WOPI-AccessToken", out var wopiHeader) &&
            !string.IsNullOrEmpty(wopiHeader.FirstOrDefault()))
            return wopiHeader.First()!;

        // Try Authorization: Bearer header (for direct API calls)
        var authHeader = Request.Headers.Authorization.FirstOrDefault();
        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var bearer = authHeader["Bearer ".Length..];
            // This is a JWT, not a WOPI token — don't use it
        }

        _logger.LogWarning("WOPI request without access_token: {Method} {Path}",
            Request.Method, Request.Path);
        return null;
    }

    private record WopiTokenClaims(int FileId, int EmpresaId, int UserId, string UserName, string Permission);

    /// <summary>Base64Url encode (RFC 4648 §5): no +, /, or = padding — safe for URL round-trips.</summary>
    private static string ToBase64Url(byte[] data) =>
        Convert.ToBase64String(data)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

    /// <summary>Base64Url decode back to bytes.</summary>
    private static byte[] FromBase64Url(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }
}
