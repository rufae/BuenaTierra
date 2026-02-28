using System.IO.Compression;
using System.Text.RegularExpressions;
using BuenaTierra.Domain.Entities;

namespace BuenaTierra.API.Services;

/// <summary>
/// Reads an ODT file (ZIP archive), replaces {{variable}} placeholders
/// in content.xml and styles.xml, returns a new ODT with substituted values.
/// </summary>
public partial class OdtVariableService
{
    /// <summary>
    /// Opens the ODT as a ZIP, finds content.xml and styles.xml,
    /// replaces all {{variable}} occurrences with provided values,
    /// returns the modified ODT as a MemoryStream.
    /// </summary>
    public async Task<MemoryStream> RellenarVariablesAsync(
        Stream odtStream,
        Dictionary<string, string> variables,
        CancellationToken ct = default)
    {
        var output = new MemoryStream();

        // Copy the input stream to output so we can modify it
        await odtStream.CopyToAsync(output, ct);
        output.Position = 0;

        // Block-scoped using so the archive is disposed (and central directory written)
        // BEFORE we reset Position = 0 for the caller.
        using (var archive = new ZipArchive(output, ZipArchiveMode.Update, leaveOpen: true))
        {
            var xmlFiles = new[] { "content.xml", "styles.xml", "meta.xml" };

            foreach (var xmlFileName in xmlFiles)
            {
                var entry = archive.GetEntry(xmlFileName);
                if (entry == null) continue;

                string xmlContent;
                using (var reader = new StreamReader(entry.Open()))
                {
                    xmlContent = await reader.ReadToEndAsync(ct);
                }

                // Replace {{variable}} patterns
                var modified = ReplaceVariables(xmlContent, variables);

                if (modified != xmlContent)
                {
                    // Delete old entry and create new one with modified content
                    entry.Delete();
                    var newEntry = archive.CreateEntry(xmlFileName);
                    using (var writer = new StreamWriter(newEntry.Open()))
                    {
                        await writer.WriteAsync(modified);
                    } // writer flushes and closes here
                }
            }
        } // archive disposes here → writes central directory to output

        output.Position = 0;
        return output;
    }

    /// <summary>
    /// Builds a dictionary of template variable values from domain entities.
    /// </summary>
    public Dictionary<string, string> BuildVariables(
        Producto? producto,
        Lote? lote,
        Empresa? empresa)
    {
        var vars = new Dictionary<string, string>();

        if (producto != null)
        {
            vars["producto.nombre"] = producto.Nombre ?? "";
            vars["producto.codigo"] = producto.Codigo ?? "";
            vars["producto.codigoBarras"] = producto.CodigoBarras ?? "";
            vars["producto.precioVenta"] = producto.PrecioVenta != 0
                ? $"{producto.PrecioVenta:F2} €" : "";
            vars["producto.pesoUnitarioGr"] = producto.PesoUnitarioGr?.ToString("F0") ?? "";
            vars["producto.unidadMedida"] = producto.UnidadMedida ?? "";
            vars["producto.ingredientesTexto"] = producto.IngredientesTexto ?? "";
            vars["producto.trazas"] = producto.Trazas ?? "";
            vars["producto.conservacion"] = producto.Conservacion ?? "";
            vars["producto.valorEnergeticoKj"] = producto.ValorEnergeticoKj?.ToString("F2") ?? "";
            vars["producto.valorEnergeticoKcal"] = producto.ValorEnergeticoKcal?.ToString("F2") ?? "";
            vars["producto.grasas"] = producto.Grasas?.ToString("F2") ?? "";
            vars["producto.grasasSaturadas"] = producto.GrasasSaturadas?.ToString("F2") ?? "";
            vars["producto.hidratosCarbono"] = producto.HidratosCarbono?.ToString("F2") ?? "";
            vars["producto.azucares"] = producto.Azucares?.ToString("F2") ?? "";
            vars["producto.proteinas"] = producto.Proteinas?.ToString("F2") ?? "";
            vars["producto.sal"] = producto.Sal?.ToString("F2") ?? "";
        }

        if (lote != null)
        {
            vars["lote.codigoLote"] = lote.CodigoLote ?? "";
            vars["lote.fechaFabricacion"] = lote.FechaFabricacion.ToString("dd/MM/yy");
            vars["lote.fechaCaducidad"] = lote.FechaCaducidad?.ToString("dd/MM/yy") ?? "";
        }

        if (empresa != null)
        {
            vars["empresa.nombre"] = empresa.Nombre ?? "";
            vars["empresa.cif"] = empresa.Nif ?? "";
            vars["empresa.direccion"] = empresa.Direccion ?? "";
            vars["empresa.nrgs"] = empresa.NumeroRgseaa ?? "";
        }

        return vars;
    }

    private static string ReplaceVariables(string xml, Dictionary<string, string> variables)
    {
        var result = xml;

        foreach (var (key, value) in variables)
        {
            // Direct replacement: {{key}} as a single text run
            var placeholder = "{{" + key + "}}";
            result = result.Replace(placeholder, EscapeXml(value));
        }

        // Also handle cases where LibreOffice splits {{ and }} across XML tags
        // Pattern: {{variable.name}} may appear as:
        // <text:span>{{</text:span><text:span>producto.nombre</text:span><text:span>}}</text:span>
        // Use regex to find and replace these split patterns
        foreach (var (key, value) in variables)
        {
            var pattern = BuildSplitPattern(key);
            result = Regex.Replace(result, pattern, EscapeXml(value));
        }

        return result;
    }

    /// <summary>
    /// Build a regex pattern that matches {{key}} even when split across XML tags.
    /// Matches: {{ optionally split by XML tags, then the key, then }} optionally split by XML tags.
    /// </summary>
    private static string BuildSplitPattern(string key)
    {
        const string tagPattern = @"(?:<[^>]*>)*";
        var escapedKey = Regex.Escape(key);
        // Allow each character of the key to be optionally separated by XML tags
        var flexibleKey = string.Join(tagPattern, escapedKey.Select(c => Regex.Escape(c.ToString())));
        return $@"\{{\{{{tagPattern}{flexibleKey}{tagPattern}\}}\}}";
    }

    private static string EscapeXml(string value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        return value
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");
    }
}
