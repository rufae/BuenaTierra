using MailKit.Net.Smtp;
using MimeKit;
using System.Text.Json.Nodes;

namespace BuenaTierra.API.Services;

/// <summary>
/// Envío de correos SMTP reutilizable (recuperación de contraseña, etc.).
/// La configuración SMTP se lee del JSON de configuración de empresa (igual que CorreosController).
/// </summary>
public static class SmtpMailer
{
    public static async Task<bool> SendAsync(string empresaConfiguracionJson, string toEmail, string subject, string htmlBody, CancellationToken ct)
    {
        var cfg = TryParse(empresaConfiguracionJson);
        if (cfg == null) return false;

        var mail = new MimeMessage();
        mail.From.Add(MailboxAddress.Parse(cfg.FromEmail));
        mail.To.Add(MailboxAddress.Parse(toEmail));
        mail.Subject = subject;
        mail.Body = new BodyBuilder { HtmlBody = htmlBody }.ToMessageBody();

        using var client = new SmtpClient();
        await client.ConnectAsync(
            cfg.Host,
            cfg.Port,
            cfg.UseSsl ? MailKit.Security.SecureSocketOptions.SslOnConnect : MailKit.Security.SecureSocketOptions.StartTlsWhenAvailable,
            ct);
        await client.AuthenticateAsync(cfg.User, cfg.Password, ct);
        await client.SendAsync(mail, ct);
        await client.DisconnectAsync(true, ct);
        return true;
    }

    private sealed record SmtpCfg(string Host, int Port, string User, string Password, string FromEmail, bool UseSsl);

    private static SmtpCfg? TryParse(string json)
    {
        try
        {
            json = ConfiguracionCrypto.UnprotectJson(json);
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

            return new SmtpCfg(host.Trim(), port.Value, user.Trim(), pass, from.Trim(), useSsl);
        }
        catch { return null; }
    }
}
