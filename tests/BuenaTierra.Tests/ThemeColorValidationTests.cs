using System.Text.RegularExpressions;

namespace BuenaTierra.Tests;

/// <summary>
/// Tests unitarios para la validación de colores hexadecimales del sistema de temas.
/// Replica la lógica de validación del endpoint PUT /api/empresa/configuracion/tema.
/// </summary>
public class ThemeColorValidationTests
{
    // Regex idéntico al utilizado en EmpresaController
    private static readonly Regex HexRegex = new(@"^#[0-9a-fA-F]{6}$");

    private static bool IsValidHex(string? value) =>
        value is not null && HexRegex.IsMatch(value);

    // ─── Valores válidos ──────────────────────────────────────────────────────

    [Theory]
    [InlineData("#c4541a")]   // terracota BuenaTierra
    [InlineData("#e0b355")]   // trigo BuenaTierra
    [InlineData("#000000")]   // negro
    [InlineData("#FFFFFF")]   // blanco (mayúsculas)
    [InlineData("#1e3a8a")]   // azul marino
    [InlineData("#a1B2c3")]   // case mixed
    public void IsValidHex_ColorHexadecimalValido_RetornaTrue(string color)
    {
        Assert.True(IsValidHex(color));
    }

    // ─── Valores inválidos ────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]          // null
    [InlineData("")]            // vacío
    [InlineData("c4541a")]      // sin #
    [InlineData("#c4541")]      // 5 dígitos
    [InlineData("#c4541aaa")]   // 8 dígitos (RGBA)
    [InlineData("#gggggg")]     // caracteres no hex
    [InlineData("#GG0000")]     // caracteres no hex mayúsculas
    [InlineData("rgb(0,0,0)")]  // formato CSS alternativo
    [InlineData("#")]           // solo hash
    [InlineData("##c4541a")]    // doble hash
    public void IsValidHex_ColorInvalido_RetornaFalse(string? color)
    {
        Assert.False(IsValidHex(color));
    }

    // ─── Casos límite ─────────────────────────────────────────────────────────

    [Fact]
    public void IsValidHex_ColoresBuenaTierraDefecto_SonValidos()
    {
        const string primario   = "#c4541a";
        const string secundario = "#e0b355";

        Assert.True(IsValidHex(primario),   "El color primario por defecto de BuenaTierra debe ser válido");
        Assert.True(IsValidHex(secundario), "El color secundario por defecto de BuenaTierra debe ser válido");
    }

    [Theory]
    [InlineData("#1e3a8a", "#3b82f6")]   // azul marino
    [InlineData("#065f46", "#34d399")]   // esmeralda
    [InlineData("#7c1d41", "#f472b6")]   // vino
    [InlineData("#4338ca", "#818cf8")]   // índigo
    [InlineData("#b45309", "#fbbf24")]   // ámbar
    public void IsValidHex_PaletasPredefinidas_TodasSonValidas(string primario, string secundario)
    {
        Assert.True(IsValidHex(primario),   $"{primario} debe ser hex válido");
        Assert.True(IsValidHex(secundario), $"{secundario} debe ser hex válido");
    }
}
