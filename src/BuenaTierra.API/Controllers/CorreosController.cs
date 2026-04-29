using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Infrastructure.Persistence;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using Npgsql;
using System.Net;
using System.Net.Mail;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CorreosController : ControllerBase
{
    private readonly AppDbContext _ctx;
    private readonly IUnitOfWork _uow;
    private readonly IFacturaService _facturaService;
    private readonly ILogger<CorreosController> _logger;

    public CorreosController(AppDbContext ctx, IUnitOfWork uow, IFacturaService facturaService, ILogger<CorreosController> logger)
    {
        _ctx = ctx;
        _uow = uow;
        _facturaService = facturaService;
        _logger = logger;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);
    private int UsuarioId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<CorreoResumenDto>>>> GetAll(
        [FromQuery] string folder = "All",
        [FromQuery] string? q = null,
        CancellationToken ct = default)
    {
        await EnsureMailTableAsync(ct);

        var query = _ctx.CorreosMensajes
            .AsNoTracking()
            .Where(c => c.EmpresaId == EmpresaId);


        if (!string.Equals(folder, "All", StringComparison.OrdinalIgnoreCase))
            query = query.Where(c => c.Folder == folder);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(c =>
                EF.Functions.ILike(c.Para, $"%{term}%") ||
                EF.Functions.ILike(c.Asunto, $"%{term}%") ||
                   EF.Functions.ILike(c.Cuerpo, $"%{term}%") ||
                   (c.De != null && EF.Functions.ILike(c.De, $"%{term}%")));
        }

        var rows = await query
            .OrderByDescending(c => c.CreatedAt)
            .Take(300)
            .Select(c => new CorreoResumenDto(
                c.Id,
                c.Folder,
                c.Estado.ToString(),
                   c.De,
                   c.Para,
                c.Asunto,
                c.CreatedAt,
                c.FechaEnvio,
                c.Error,
                c.FacturaId,
                c.AdjuntoNombre
            ))
            .ToListAsync(ct);

        return Ok(ApiResponse<IEnumerable<CorreoResumenDto>>.Ok(rows));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<CorreoDetalleDto>>> GetById(int id, CancellationToken ct)
    {
        await EnsureMailTableAsync(ct);

        var row = await _ctx.CorreosMensajes
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id && c.EmpresaId == EmpresaId, ct);


        if (row == null)
            return NotFound(ApiResponse<CorreoDetalleDto>.Fail("Correo no encontrado"));

        return Ok(ApiResponse<CorreoDetalleDto>.Ok(new CorreoDetalleDto(
            row.Id,
            row.Folder,
            row.Estado.ToString(),
               row.De,
               row.Para,
            row.Cc,
            row.Cco,
            row.Asunto,
            row.Cuerpo,
            row.CreatedAt,
            row.FechaEnvio,
            row.Error,
            row.FacturaId,
            row.AdjuntoNombre
        )));
    }

    /// <summary>GET /api/correos/{id}/adjunto — Descarga el adjunto de un correo</summary>
    [HttpGet("{id:int}/adjunto")]
    public async Task<IActionResult> DescargarAdjunto(int id, CancellationToken ct)
    {
        await EnsureMailTableAsync(ct);
        var row = await _ctx.CorreosMensajes
            .FirstOrDefaultAsync(c => c.Id == id && c.EmpresaId == EmpresaId && c.UsuarioId == UsuarioId, ct);
        if (row == null) return NotFound();
        if (row.AdjuntoDatos == null || row.AdjuntoDatos.Length == 0) return NotFound("Sin adjunto");
        return File(row.AdjuntoDatos, row.AdjuntoContentType ?? "application/octet-stream", row.AdjuntoNombre ?? "adjunto");
    }

    [HttpPost("borrador")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<CorreoIdDto>>> GuardarBorrador(
        [FromBody] GuardarBorradorRequest req,
        CancellationToken ct)
    {
        await EnsureMailTableAsync(ct);

        var msg = new CorreoMensaje
        {
            EmpresaId = EmpresaId,
            UsuarioId = UsuarioId,
            Folder = "Drafts",
            Estado = EstadoCorreo.Borrador,
            Para = req.Para.Trim(),
            Cc = CleanNullable(req.Cc),
            Cco = CleanNullable(req.Cco),
            Asunto = req.Asunto.Trim(),
            Cuerpo = req.Cuerpo,
            FacturaId = req.FacturaId,
            AdjuntoNombre = req.FacturaId.HasValue ? $"factura-{req.FacturaId}.pdf" : null,
            FechaEnvio = null
        };

        _ctx.CorreosMensajes.Add(msg);
        await _ctx.SaveChangesAsync(ct);

        return Ok(ApiResponse<CorreoIdDto>.Ok(new CorreoIdDto(msg.Id), "Borrador guardado"));
    }

    [HttpPost("enviar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<CorreoIdDto>>> Enviar([FromBody] EnviarCorreoRequest req, CancellationToken ct)
    {
        await EnsureMailTableAsync(ct);

        if (string.IsNullOrWhiteSpace(req.Para) || string.IsNullOrWhiteSpace(req.Asunto))
            return BadRequest(ApiResponse<CorreoIdDto>.Fail("Para y Asunto son obligatorios"));

        var smtp = await GetSmtpConfigAsync(ct);
        if (smtp == null)
            return UnprocessableEntity(ApiResponse<CorreoIdDto>.Fail("SMTP no configurado. Revise Ajustes > SMTP"));

        byte[]? facturaPdf = null;
        string? adjuntoNombre = null;

        if (req.FacturaId.HasValue)
        {
            facturaPdf = await _facturaService.GetPdfBytesAsync(req.FacturaId.Value, EmpresaId, ct);
            if (facturaPdf.Length == 0)
                return UnprocessableEntity(ApiResponse<CorreoIdDto>.Fail("No se pudo generar el PDF de la factura"));
            adjuntoNombre = $"factura-{req.FacturaId}.pdf";
        }

        var row = new CorreoMensaje
        {
            EmpresaId = EmpresaId,
            UsuarioId = UsuarioId,
            Folder = "Sent",
            Estado = EstadoCorreo.Enviado,
            Para = req.Para.Trim(),
            Cc = CleanNullable(req.Cc),
            Cco = CleanNullable(req.Cco),
            Asunto = req.Asunto.Trim(),
            Cuerpo = req.Cuerpo,
            FacturaId = req.FacturaId,
            AdjuntoNombre = adjuntoNombre,
            FechaEnvio = DateTime.UtcNow
        };

        try
        {
            await SendMailAsync(smtp, req, facturaPdf, adjuntoNombre, ct);
        }
        catch (Exception ex)
        {
            row.Folder = "Errors";
            row.Estado = EstadoCorreo.Error;
            row.Error = ex.Message;
            row.FechaEnvio = null;
            _ctx.CorreosMensajes.Add(row);
            await _ctx.SaveChangesAsync(ct);
            return BadRequest(ApiResponse<CorreoIdDto>.Fail($"No se pudo enviar el correo: {ex.Message}"));
        }

        _ctx.CorreosMensajes.Add(row);

        if (req.FacturaId.HasValue)
        {
            var factura = await _uow.Facturas.GetByIdAsync(req.FacturaId.Value, ct);
            if (factura != null && factura.EmpresaId == EmpresaId && factura.Estado == EstadoFactura.Emitida)
            {
                factura.Estado = EstadoFactura.Enviada;
                await _uow.Facturas.UpdateAsync(factura, ct);
            }
        }

        await _ctx.SaveChangesAsync(ct);
        await _uow.SaveChangesAsync(ct);

        return Ok(ApiResponse<CorreoIdDto>.Ok(new CorreoIdDto(row.Id), "Correo enviado"));
    }

    /// <summary>POST /api/correos/sincronizar — Lee correos de IMAP y los mete en Inbox</summary>
    [HttpPost("sincronizar")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<SincronizarResultDto>>> Sincronizar(CancellationToken ct)
        {
            await EnsureMailTableAsync(ct);
            var imapCfg = await GetImapConfigAsync(ct);
            if (imapCfg == null)
                return UnprocessableEntity(ApiResponse<SincronizarResultDto>.Fail("IMAP no configurado. Configure los datos de recepción en Ajustes > Correo"));

            int nuevos = 0, errores = 0;
            try
            {
                using var client = new ImapClient();
                client.Timeout = 30000;
                var primaryOpts = imapCfg.UseSsl
                    ? MailKit.Security.SecureSocketOptions.SslOnConnect
                    : MailKit.Security.SecureSocketOptions.StartTlsWhenAvailable;
                var fallbackOpts = imapCfg.UseSsl
                    ? MailKit.Security.SecureSocketOptions.StartTlsWhenAvailable
                    : MailKit.Security.SecureSocketOptions.SslOnConnect;

                try
                {
                    using var authCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    authCts.CancelAfter(TimeSpan.FromSeconds(30));
                    await client.ConnectAsync(imapCfg.Host, imapCfg.Port, primaryOpts, authCts.Token);
                    await client.AuthenticateAsync(imapCfg.User, imapCfg.Password, authCts.Token);
                }
                catch
                {
                    if (client.IsConnected)
                    {
                        using var disconnectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                        disconnectCts.CancelAfter(TimeSpan.FromSeconds(10));
                        await client.DisconnectAsync(true, disconnectCts.Token);
                    }

                    using var fallbackAuthCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    fallbackAuthCts.CancelAfter(TimeSpan.FromSeconds(30));
                    await client.ConnectAsync(imapCfg.Host, imapCfg.Port, fallbackOpts, fallbackAuthCts.Token);
                    await client.AuthenticateAsync(imapCfg.User, imapCfg.Password, fallbackAuthCts.Token);
                }

                var inbox = client.Inbox;
                using var inboxCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                inboxCts.CancelAfter(TimeSpan.FromSeconds(30));
                await inbox.OpenAsync(FolderAccess.ReadOnly, inboxCts.Token);

                var knownUids = await _ctx.CorreosMensajes
                    .Where(c => c.EmpresaId == EmpresaId && c.UsuarioId == UsuarioId
                             && c.Folder == "Inbox" && c.UidImap != null)
                    .Select(c => c.UidImap!.Value)
                    .ToHashSetAsync(inboxCts.Token);

                var uids = await inbox.SearchAsync(SearchQuery.All, inboxCts.Token);
                var toFetch = uids.Skip(Math.Max(0, uids.Count - 100)).ToList();

                foreach (var uid in toFetch)
                {
                    if (knownUids.Contains(uid.Id)) continue;
                    try
                    {
                        using var messageCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                        messageCts.CancelAfter(TimeSpan.FromSeconds(20));
                        var message = await inbox.GetMessageAsync(uid, messageCts.Token);
                        var de = message.From.OfType<MailboxAddress>().FirstOrDefault()?.Address ?? "";
                        var para = string.Join("; ", message.To.OfType<MailboxAddress>().Select(a => a.Address));
                        var cuerpo = message.HtmlBody ?? message.TextBody ?? "";

                        byte[]? adjuntoDatos = null;
                        string? adjuntoNombre = null;
                        string? adjuntoContentType = null;
                        foreach (var part in message.BodyParts.OfType<MimePart>())
                        {
                            if (part.IsAttachment && adjuntoDatos == null)
                            {
                                using var ms = new MemoryStream();
                                await part.Content.DecodeToAsync(ms, ct);
                                adjuntoDatos = ms.ToArray();
                                adjuntoNombre = part.FileName ?? "adjunto";
                                adjuntoContentType = part.ContentType.MimeType;
                                break;
                            }
                        }

                        _ctx.CorreosMensajes.Add(new CorreoMensaje
                        {
                            EmpresaId = EmpresaId,
                            UsuarioId = UsuarioId,
                            Folder = "Inbox",
                            Estado = EstadoCorreo.Enviado,
                            De = de,
                            Para = para,
                            Asunto = message.Subject ?? "(Sin asunto)",
                            Cuerpo = cuerpo,
                            AdjuntoNombre = adjuntoNombre,
                            AdjuntoDatos = adjuntoDatos,
                            AdjuntoContentType = adjuntoContentType,
                            UidImap = uid.Id,
                            FechaEnvio = message.Date.UtcDateTime,
                            CreatedAt = message.Date.UtcDateTime,
                        });
                        nuevos++;
                    }
                    catch { errores++; }
                }
                await _ctx.SaveChangesAsync(ct);
                using var finalDisconnectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                finalDisconnectCts.CancelAfter(TimeSpan.FromSeconds(10));
                await client.DisconnectAsync(true, finalDisconnectCts.Token);
            }
            catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
            {
                _logger.LogWarning(ex, "Timeout IMAP al sincronizar. host={Host} port={Port} user={User}", imapCfg.Host, imapCfg.Port, imapCfg.User);
                return BadRequest(ApiResponse<SincronizarResultDto>.Fail(
                    $"Error IMAP ({imapCfg.Host}:{imapCfg.Port}, usuario {imapCfg.User}): tiempo de espera agotado al conectar o leer la bandeja. Revisa host/puerto, SSL/TLS y conectividad de red."));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error IMAP al sincronizar. host={Host} port={Port} user={User}", imapCfg.Host, imapCfg.Port, imapCfg.User);
                var hint = string.Empty;
                if (ex.Message.Contains("AUTH", StringComparison.OrdinalIgnoreCase)
                    || ex.Message.Contains("LOGIN", StringComparison.OrdinalIgnoreCase)
                    || ex.Message.Contains("credentials", StringComparison.OrdinalIgnoreCase))
                {
                    hint = " Revisa IMAP usuario (email completo) y contraseña de aplicación.";
                }
                var inner = ex.InnerException?.Message;
                var detail = string.IsNullOrWhiteSpace(inner) ? ex.Message : $"{ex.Message} | {inner}";
                return BadRequest(ApiResponse<SincronizarResultDto>.Fail(
                    $"Error IMAP ({imapCfg.Host}:{imapCfg.Port}, usuario {imapCfg.User}): {detail}.{hint}".Trim()));
            }
            return Ok(ApiResponse<SincronizarResultDto>.Ok(new SincronizarResultDto(nuevos, errores),
                $"Sincronización: {nuevos} nuevos, {errores} errores"));
        }

        [HttpDelete("{id:int}")]
        [Authorize(Policy = "ObradorOrAdmin")]
        public async Task<ActionResult<ApiResponse<string>>> Delete(int id, CancellationToken ct)
    {
        await EnsureMailTableAsync(ct);

        var row = await _ctx.CorreosMensajes.FirstOrDefaultAsync(c => c.Id == id && c.EmpresaId == EmpresaId, ct);
        if (row == null)
            return NotFound(ApiResponse<string>.Fail("Correo no encontrado"));

        _ctx.CorreosMensajes.Remove(row);
        await _ctx.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Correo eliminado"));
    }

    private static string? CleanNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Gets SMTP config — user-level first, empresa-level as fallback</summary>
    private async Task<EmpresaSmtpConfig?> GetSmtpConfigAsync(CancellationToken ct)
    {
        var usuario = await _uow.Usuarios.GetByIdAsync(UsuarioId, ct);
        if (usuario != null && !string.IsNullOrWhiteSpace(usuario.Configuracion))
        {
            var cfg = TryParseSmtp(usuario.Configuracion);
            if (cfg != null) return cfg;
        }
        var empresa = await _uow.Empresas.GetByIdAsync(EmpresaId, ct);
        if (empresa == null || string.IsNullOrWhiteSpace(empresa.Configuracion)) return null;
        return TryParseSmtp(empresa.Configuracion);
    }

    private static EmpresaSmtpConfig? TryParseSmtp(string json)
    {
        try
        {
            var root = JsonNode.Parse(json)?.AsObject();
            if (root == null) return null;
            string? host = root["smtpHost"]?.GetValue<string>();
            int? port = root["smtpPort"]?.GetValue<int>();
            string? user = root["smtpUser"]?.GetValue<string>();
            string? pass = root["smtpPassword"]?.GetValue<string>();
            string? from = root["smtpFromEmail"]?.GetValue<string>();
            bool useSsl = root["smtpUseSsl"]?.GetValue<bool>() ?? true;
            if (string.IsNullOrWhiteSpace(host) || !port.HasValue || string.IsNullOrWhiteSpace(user)
                || string.IsNullOrWhiteSpace(pass) || string.IsNullOrWhiteSpace(from))
                return null;
            return new EmpresaSmtpConfig(host.Trim(), port.Value, user.Trim(), pass, from.Trim(), useSsl);
        }
        catch { return null; }
    }

    private async Task<ImapConfig?> GetImapConfigAsync(CancellationToken ct)
    {
        var usuario = await _uow.Usuarios.GetByIdAsync(UsuarioId, ct);
        if (usuario == null || string.IsNullOrWhiteSpace(usuario.Configuracion)) return null;
        try
        {
            var root = JsonNode.Parse(usuario.Configuracion)?.AsObject();
            if (root == null) return null;
            string? host = root["imapHost"]?.GetValue<string>();
            int? port = root["imapPort"]?.GetValue<int>();
            string? user = root["imapUser"]?.GetValue<string>();
            string? pass = root["imapPassword"]?.GetValue<string>();
            bool useSsl = root["imapUseSsl"]?.GetValue<bool>() ?? true;
            if (string.IsNullOrWhiteSpace(host) || !port.HasValue || string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
                return null;
            var hostNorm = host.Trim();
            var userNorm = NormalizeImapUser(hostNorm, user.Trim());
            var passNorm = NormalizeImapPassword(hostNorm, pass);
            return new ImapConfig(hostNorm, port.Value, userNorm, passNorm, useSsl);
        }
        catch { return null; }
    }

    private static string NormalizeImapUser(string host, string user)
    {
        if (user.Contains('@')) return user;
        if (host.Contains("gmail", StringComparison.OrdinalIgnoreCase))
            return $"{user}@gmail.com";
        return user;
    }

    private static string NormalizeImapPassword(string host, string pass)
    {
        if (host.Contains("gmail", StringComparison.OrdinalIgnoreCase))
            return pass.Replace(" ", string.Empty);
        return pass;
    }

    private static async Task SendMailAsync(EmpresaSmtpConfig cfg, EnviarCorreoRequest req, byte[]? adjunto, string? adjuntoNombre, CancellationToken ct)
    {
        using var mail = new MailMessage
        {
            From = new MailAddress(cfg.FromEmail),
            Subject = req.Asunto,
            Body = req.Cuerpo,
            IsBodyHtml = true
        };

        foreach (var target in SplitEmails(req.Para))
            mail.To.Add(target);
        foreach (var target in SplitEmails(req.Cc))
            mail.CC.Add(target);
        foreach (var target in SplitEmails(req.Cco))
            mail.Bcc.Add(target);

        if (adjunto != null && adjunto.Length > 0)
        {
            var ms = new MemoryStream(adjunto);
            mail.Attachments.Add(new Attachment(ms, adjuntoNombre ?? "adjunto.pdf", "application/pdf"));
        }

        using var client = new SmtpClient(cfg.Host, cfg.Port)
        {
            EnableSsl = cfg.UseSsl,
            Credentials = new NetworkCredential(cfg.User, cfg.Password),
            DeliveryMethod = SmtpDeliveryMethod.Network,
            Timeout = 25000
        };

        using var reg = ct.Register(client.SendAsyncCancel);
        await client.SendMailAsync(mail);
    }

    private static IEnumerable<string> SplitEmails(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) yield break;

        foreach (var token in raw.Split(';', ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            if (!string.IsNullOrWhiteSpace(token))
                yield return token;
    }

    private async Task EnsureMailTableAsync(CancellationToken ct)
    {
        try
        {
            await _ctx.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS correos_mensajes (
                    id                   SERIAL PRIMARY KEY,
                    empresa_id           INTEGER NOT NULL REFERENCES empresas(id),
                    usuario_id           INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                    cliente_id           INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
                    factura_id           INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
                    folder               VARCHAR(20) NOT NULL DEFAULT 'Sent',
                    estado               TEXT NOT NULL DEFAULT 'Enviado',
                    de                   VARCHAR(1000),
                    para                 VARCHAR(1000) NOT NULL,
                    cc                   VARCHAR(1000),
                    cco                  VARCHAR(1000),
                    asunto               VARCHAR(300) NOT NULL,
                    cuerpo               TEXT NOT NULL,
                    adjunto_nombre       VARCHAR(300),
                    adjunto_datos        BYTEA,
                    adjunto_content_type VARCHAR(100),
                    uid_imap             BIGINT,
                    error                VARCHAR(2000),
                    fecha_envio          TIMESTAMPTZ,
                    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT ck_correos_folder CHECK (folder IN ('Inbox','Sent','Drafts','Errors')),
                    CONSTRAINT ck_correos_estado CHECK (estado IN ('Borrador','Enviado','Error'))
                );
            ", ct);
        }
        catch (PostgresException ex) when (ex.SqlState == "42501")
        {
            _logger.LogWarning("CREATE TABLE correos_mensajes omitido por permisos de owner: {SqlState}", ex.SqlState);
        }

        // Crear índice (tolerando error de owner si ya existe)
        await TryEnsureIndexAsync("CREATE INDEX IF NOT EXISTS idx_correos_empresa_folder_created ON correos_mensajes(empresa_id, folder, created_at DESC);", ct);

        await TryEnsureColumnAsync("ALTER TABLE correos_mensajes ADD COLUMN IF NOT EXISTS de VARCHAR(1000);", ct);
        await TryEnsureColumnAsync("ALTER TABLE correos_mensajes ADD COLUMN IF NOT EXISTS adjunto_datos BYTEA;", ct);
        await TryEnsureColumnAsync("ALTER TABLE correos_mensajes ADD COLUMN IF NOT EXISTS adjunto_content_type VARCHAR(100);", ct);
        await TryEnsureColumnAsync("ALTER TABLE correos_mensajes ADD COLUMN IF NOT EXISTS uid_imap BIGINT;", ct);
        await TryEnsureColumnAsync("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS configuracion TEXT;", ct);
    }

    private async Task TryEnsureColumnAsync(string sql, CancellationToken ct)
    {
        try
        {
            await _ctx.Database.ExecuteSqlRawAsync(sql, ct);
        }
        catch (PostgresException ex) when (ex.SqlState == "42501")
        {
            // En BDs restauradas puede haber diferencia de owner; continuamos si la estructura ya existe.
            _logger.LogWarning("Ensure schema correo omitido por permisos (owner): {Sql}", sql);
        }
    }

    private async Task TryEnsureIndexAsync(string sql, CancellationToken ct)
    {
        try
        {
            await _ctx.Database.ExecuteSqlRawAsync(sql, ct);
        }
        catch (PostgresException ex) when (ex.SqlState == "42501")
        {
            _logger.LogWarning("Crear índice omitido por permisos (owner): {Sql}", sql);
        }
        catch
        {
            // Otros errores (como índice ya existe) son tolerados silenciosamente
        }
    }
}

public record CorreoResumenDto(
    int Id,
    string Folder,
    string Estado,
    string? De,
    string Para,
    string Asunto,
    DateTime CreatedAt,
    DateTime? FechaEnvio,
    string? Error,
    int? FacturaId,
    string? AdjuntoNombre
);

public record CorreoDetalleDto(
    int Id,
    string Folder,
    string Estado,
    string? De,
    string Para,
    string? Cc,
    string? Cco,
    string Asunto,
    string Cuerpo,
    DateTime CreatedAt,
    DateTime? FechaEnvio,
    string? Error,
    int? FacturaId,
    string? AdjuntoNombre
);

public record CorreoIdDto(int Id);
public record SincronizarResultDto(int Nuevos, int Errores);
public record ImapConfig(string Host, int Port, string User, string Password, bool UseSsl);

public class GuardarBorradorRequest
{
    public string Para { get; set; } = string.Empty;
    public string? Cc { get; set; }
    public string? Cco { get; set; }
    public string Asunto { get; set; } = string.Empty;
    public string Cuerpo { get; set; } = string.Empty;
    public int? FacturaId { get; set; }
}

public class EnviarCorreoRequest
{
    public string Para { get; set; } = string.Empty;
    public string? Cc { get; set; }
    public string? Cco { get; set; }
    public string Asunto { get; set; } = string.Empty;
    public string Cuerpo { get; set; } = string.Empty;
    public int? FacturaId { get; set; }
}

public record EmpresaSmtpConfig(
    string Host,
    int Port,
    string User,
    string Password,
    string FromEmail,
    bool UseSsl
);
