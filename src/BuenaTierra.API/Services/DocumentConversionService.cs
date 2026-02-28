using PuppeteerSharp;
using PuppeteerSharp.Media;
using System.Diagnostics;

namespace BuenaTierra.API.Services;

/// <summary>
/// Converts HTML templates to PDF (PuppeteerSharp) and ODT to PDF (LibreOffice headless).
/// </summary>
public class DocumentConversionService : IDisposable
{
    private readonly ILogger<DocumentConversionService> _log;
    private IBrowser? _browser;
    private readonly SemaphoreSlim _browserLock = new(1, 1);
    private bool _chromiumDownloaded;

    public DocumentConversionService(ILogger<DocumentConversionService> log)
    {
        _log = log;
    }

    // ═══════════════════════════════════════════════════════
    // HTML → PDF  (PuppeteerSharp / Chromium)
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Renders HTML content to a PDF file with specified label dimensions.
    /// </summary>
    public async Task<byte[]> ConvertHtmlToPdfAsync(
        string html, decimal widthMm, decimal heightMm, CancellationToken ct = default)
    {
        var browser = await GetBrowserAsync();
        await using var page = await browser.NewPageAsync();

        await page.SetContentAsync(html, new NavigationOptions { WaitUntil = [WaitUntilNavigation.Networkidle0] });

        var pdfBytes = await page.PdfDataAsync(new PdfOptions
        {
            Width = $"{widthMm}mm",
            Height = $"{heightMm}mm",
            PrintBackground = true,
            MarginOptions = new MarginOptions
            {
                Top = "0mm",
                Bottom = "0mm",
                Left = "0mm",
                Right = "0mm",
            },
        });

        return pdfBytes;
    }

    /// <summary>
    /// Renders HTML content to a full A4 PDF (for preview).
    /// </summary>
    public async Task<byte[]> ConvertHtmlToA4PdfAsync(string html, CancellationToken ct = default)
    {
        var browser = await GetBrowserAsync();
        await using var page = await browser.NewPageAsync();

        await page.SetContentAsync(html, new NavigationOptions { WaitUntil = [WaitUntilNavigation.Networkidle0] });

        var pdfBytes = await page.PdfDataAsync(new PdfOptions
        {
            Format = PaperFormat.A4,
            PrintBackground = true,
            MarginOptions = new MarginOptions
            {
                Top = "10mm",
                Bottom = "10mm",
                Left = "10mm",
                Right = "10mm",
            },
        });

        return pdfBytes;
    }

    // ═══════════════════════════════════════════════════════
    // ODT → PDF  (LibreOffice headless)
    // ═══════════════════════════════════════════════════════

    /// <summary>
    /// Converts an ODT file to PDF using LibreOffice in headless mode.
    /// Returns null if LibreOffice is not available.
    /// </summary>
    public async Task<byte[]?> ConvertOdtToPdfAsync(Stream odtStream, CancellationToken ct = default)
    {
        var sofficePath = FindLibreOffice();
        if (sofficePath == null)
        {
            _log.LogWarning("LibreOffice no encontrado. Conversión ODT→PDF no disponible.");
            return null;
        }

        var tempDir = Path.Combine(Path.GetTempPath(), $"bt_odt_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            var inputPath = Path.Combine(tempDir, "input.odt");
            await using (var fs = new FileStream(inputPath, FileMode.Create))
            {
                await odtStream.CopyToAsync(fs, ct);
            }

            // soffice --headless --convert-to pdf --outdir <dir> <file>
            var psi = new ProcessStartInfo
            {
                FileName = sofficePath,
                Arguments = $"--headless --convert-to pdf --outdir \"{tempDir}\" \"{inputPath}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = Process.Start(psi)!;
            // Wait up to 30 seconds
            var completed = process.WaitForExit(30_000);
            if (!completed)
            {
                process.Kill();
                _log.LogError("LibreOffice timeout al convertir ODT→PDF");
                return null;
            }

            var pdfPath = Path.Combine(tempDir, "input.pdf");
            if (!File.Exists(pdfPath))
            {
                var stderr = await process.StandardError.ReadToEndAsync(ct);
                _log.LogError("LibreOffice no generó PDF. stderr: {StdErr}", stderr);
                return null;
            }

            return await File.ReadAllBytesAsync(pdfPath, ct);
        }
        finally
        {
            try { Directory.Delete(tempDir, recursive: true); } catch { /* ignore cleanup errors */ }
        }
    }

    /// <summary>
    /// Checks if LibreOffice is available on this machine.
    /// </summary>
    public bool IsLibreOfficeAvailable() => FindLibreOffice() != null;

    // ═══════════════════════════════════════════════════════
    // INTERNALS
    // ═══════════════════════════════════════════════════════

    private async Task<IBrowser> GetBrowserAsync()
    {
        await _browserLock.WaitAsync();
        try
        {
            if (_browser is { IsClosed: false })
                return _browser;

            if (!_chromiumDownloaded)
            {
                _log.LogInformation("Descargando Chromium para PuppeteerSharp (primera vez)...");
                var fetcher = new BrowserFetcher();
                await fetcher.DownloadAsync();
                _chromiumDownloaded = true;
                _log.LogInformation("Chromium descargado correctamente.");
            }

            _browser = await Puppeteer.LaunchAsync(new LaunchOptions
            {
                Headless = true,
                Args = ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            return _browser;
        }
        finally
        {
            _browserLock.Release();
        }
    }

    private static string? FindLibreOffice()
    {
        // Windows: check common install paths
        var candidates = new[]
        {
            @"C:\Program Files\LibreOffice\program\soffice.exe",
            @"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        };

        foreach (var path in candidates)
        {
            if (File.Exists(path)) return path;
        }

        // Linux/macOS
        if (!OperatingSystem.IsWindows())
        {
            try
            {
                var psi = new ProcessStartInfo("which", "soffice")
                {
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                using var proc = Process.Start(psi);
                var output = proc?.StandardOutput.ReadToEnd()?.Trim();
                proc?.WaitForExit(5000);
                if (!string.IsNullOrEmpty(output) && File.Exists(output))
                    return output;
            }
            catch { /* not found */ }
        }

        return null;
    }

    public void Dispose()
    {
        _browser?.Dispose();
        _browserLock.Dispose();
        GC.SuppressFinalize(this);
    }
}
