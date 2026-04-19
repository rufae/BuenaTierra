using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

public class CorreoMensaje : TenantEntity
{
    public int? UsuarioId { get; set; }
    public int? ClienteId { get; set; }
    public int? FacturaId { get; set; }
    public string Folder { get; set; } = "Sent";
    public EstadoCorreo Estado { get; set; } = EstadoCorreo.Enviado;
    public string? De { get; set; }                  // Sender (for Inbox messages)
    public string Para { get; set; } = string.Empty;
    public string? Cc { get; set; }
    public string? Cco { get; set; }
    public string Asunto { get; set; } = string.Empty;
    public string Cuerpo { get; set; } = string.Empty;
    public string? AdjuntoNombre { get; set; }
    public byte[]? AdjuntoDatos { get; set; }        // Binary attachment data
    public string? AdjuntoContentType { get; set; }  // MIME type of attachment
    public long? UidImap { get; set; }               // IMAP UID for deduplication
    public string? Error { get; set; }
    public DateTime? FechaEnvio { get; set; }

    public virtual Usuario? Usuario { get; set; }
    public virtual Cliente? Cliente { get; set; }
    public virtual Factura? Factura { get; set; }
    public virtual Empresa Empresa { get; set; } = null!;
}
