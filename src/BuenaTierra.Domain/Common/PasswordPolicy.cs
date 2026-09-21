using System.Text.RegularExpressions;

namespace BuenaTierra.Domain.Common;

/// <summary>
/// Política central de validación de contraseñas.
/// Aplicada de forma uniforme en el alta de usuarios y en los cambios de contraseña.
/// </summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;

    /// <summary>
    /// Valida la contraseña. Devuelve el mensaje de error (en español) o null si es válida.
    /// Reglas: mínimo 8 caracteres y al menos una letra y un número.
    /// </summary>
    public static string? Validate(string? password)
    {
        if (string.IsNullOrWhiteSpace(password))
            return "La contraseña es obligatoria";

        if (password.Length < MinLength)
            return $"La contraseña debe tener al menos {MinLength} caracteres";

        if (!Regex.IsMatch(password, @"[A-Za-z]"))
            return "La contraseña debe contener al menos una letra";

        if (!Regex.IsMatch(password, @"\d"))
            return "La contraseña debe contener al menos un número";

        return null;
    }
}
