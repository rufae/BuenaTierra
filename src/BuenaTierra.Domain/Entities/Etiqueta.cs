using BuenaTierra.Domain.Common;
using BuenaTierra.Domain.Enums;

namespace BuenaTierra.Domain.Entities;

// ══════════════════════════════════════════════════════
// Configuración IVA ↔ Recargo de Equivalencia
// ══════════════════════════════════════════════════════

/// <summary>
/// Tabla de tramos IVA → RE legales. Se configura por empresa.
/// Tramos vigentes en España:
///   IVA 4%  → RE 0,5%
///   IVA 10% → RE 1,4%
///   IVA 21% → RE 5,2%
/// </summary>
public class TipoIvaRe : BaseEntity
{
    public int EmpresaId { get; set; }
    public decimal IvaPorcentaje { get; set; }
    public decimal RecargoEquivalenciaPorcentaje { get; set; }
    public string? Descripcion { get; set; }
    public bool Activo { get; set; } = true;

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
}

// ══════════════════════════════════════════════════════
// Plantilla de Etiquetas (editor visual)
// ══════════════════════════════════════════════════════

public class PlantillaEtiqueta : TenantEntity
{
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }

    /// <summary>Ancho de la etiqueta en milímetros.</summary>
    public decimal AnchoMm { get; set; } = 105;

    /// <summary>Alto de la etiqueta en milímetros.</summary>
    public decimal AltoMm { get; set; } = 57;

    /// <summary>Tipo de impresora destino.</summary>
    public TipoImpresora TipoImpresora { get; set; } = TipoImpresora.A4;

    /// <summary>JSON con la definición de elementos del editor (canvas + elements[])</summary>
    public string ContenidoJson { get; set; } = "{}";

    /// <summary>HTML generado para previsualización (cache render del JSON)</summary>
    public string? ContenidoHtml { get; set; }

    public bool Activa { get; set; } = true;

    /// <summary>Si es una plantilla de sistema (preset) no se puede eliminar.</summary>
    public bool EsPlantillaBase { get; set; } = false;

    public int? UsuarioId { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Usuario? Usuario { get; set; }
}

// ══════════════════════════════════════════════════════
// Etiquetas importadas (archivos .docx, .odt, .pdf, etc.)
// ══════════════════════════════════════════════════════

public class EtiquetaImportada : TenantEntity
{
    public string Nombre { get; set; } = string.Empty;
    public string RutaArchivo { get; set; } = string.Empty;
    public FormatoEtiqueta Formato { get; set; } = FormatoEtiqueta.Pdf;
    public long TamanoBytes { get; set; }
    public int? UsuarioId { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual Usuario? Usuario { get; set; }
}

// ══════════════════════════════════════════════════════
// Cola de impresión de etiquetas
// ══════════════════════════════════════════════════════

public class TrabajoImpresionEtiqueta : BaseEntity
{
    public int EmpresaId { get; set; }
    public int PlantillaEtiquetaId { get; set; }
    public int? ProductoId { get; set; }
    public int? LoteId { get; set; }
    public int Copias { get; set; } = 1;
    public EstadoImpresion Estado { get; set; } = EstadoImpresion.Pendiente;
    public int UsuarioId { get; set; }

    // Navegación
    public virtual Empresa Empresa { get; set; } = null!;
    public virtual PlantillaEtiqueta PlantillaEtiqueta { get; set; } = null!;
    public virtual Producto? Producto { get; set; }
    public virtual Lote? Lote { get; set; }
    public virtual Usuario Usuario { get; set; } = null!;
}
