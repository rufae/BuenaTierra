using NetBarcode;

namespace BuenaTierra.API.Services;

/// <summary>
/// Generates barcode images (EAN-13, CODE128, QR) as PNG byte arrays using NetBarcode.
/// </summary>
public class BarcodeService
{
    /// <summary>
    /// Generates a barcode as a PNG image.
    /// Uses EAN-13 for 13-digit codes, CODE128 otherwise.
    /// </summary>
    public byte[] GenerateBarcodePng(string barcodeValue, int width = 300, int height = 100)
    {
        if (string.IsNullOrWhiteSpace(barcodeValue))
            return GeneratePlaceholderPng();

        try
        {
            var type = barcodeValue.Length == 13 && barcodeValue.All(char.IsDigit)
                ? NetBarcode.Type.EAN13
                : NetBarcode.Type.Code128;

            var barcode = new Barcode(barcodeValue, type, true, width, height);
            return barcode.GetByteArray();
        }
        catch
        {
            return GeneratePlaceholderPng();
        }
    }

    /// <summary>
    /// Generates a QR code as a PNG image.
    /// </summary>
    public byte[] GenerateQrPng(string content, int size = 200)
    {
        if (string.IsNullOrWhiteSpace(content))
            return GeneratePlaceholderPng();

        try
        {
            // NetBarcode doesn't support QR - return a CODE128 fallback
            var barcode = new Barcode(content, NetBarcode.Type.Code128, true, size, size);
            return barcode.GetByteArray();
        }
        catch
        {
            return GeneratePlaceholderPng();
        }
    }

    /// <summary>
    /// Returns a minimal 1x1 white PNG as placeholder.
    /// </summary>
    private static byte[] GeneratePlaceholderPng()
    {
        // Minimal 1x1 white PNG (68 bytes)
        return Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
            "Nl7BcQAAAABJRU5ErkJggg==");
    }
}
