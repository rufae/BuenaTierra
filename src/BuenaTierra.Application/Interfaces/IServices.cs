namespace BuenaTierra.Application.Interfaces;

// ============================================================
// Auth
// ============================================================

public interface IAuthService
{
    Task<AuthResult> LoginAsync(string email, string password, int empresaId, CancellationToken ct = default);
    Task<AuthResult> RefreshTokenAsync(string refreshToken, CancellationToken ct = default);
    Task LogoutAsync(int usuarioId, CancellationToken ct = default);
}

public record AuthResult(bool Success, string? Token, string? RefreshToken, DateTime? Expira, string? Error = null);

// ============================================================
// Lotes (FIFO Motor)
// ============================================================

public interface ILoteAsignacionService
{
    /// <summary>
    /// Asigna lotes automáticamente por FIFO para la cantidad solicitada.
    /// Lanza StockInsuficienteException si no hay stock suficiente.
    /// </summary>
    Task<List<LoteAsignado>> AsignarLotesAsync(int empresaId, int productoId, decimal cantidad, CancellationToken ct = default);

    /// <summary>
    /// Consulta stock disponible real (sin lotes caducados ni bloqueados).
    /// </summary>
    Task<decimal> GetDisponibleAsync(int empresaId, int productoId, CancellationToken ct = default);
}

public record LoteAsignado(
    int LoteId,
    string CodigoLote,
    int ProductoId,
    decimal Cantidad,
    DateOnly FechaFabricacion,
    DateOnly? FechaCaducidad
);

// ============================================================
// Stock
// ============================================================

public interface IStockService
{
    Task<StockResumen> GetResumenAsync(int empresaId, int productoId, CancellationToken ct = default);
    Task AjustarAsync(int empresaId, int productoId, int loteId, decimal cantidad, string motivo, int usuarioId, CancellationToken ct = default);
    Task<IEnumerable<StockAlerta>> GetAlertasAsync(int empresaId, CancellationToken ct = default);
}

public record StockResumen(int ProductoId, string ProductoNombre, decimal TotalDisponible, int NumLotes);
public record StockAlerta(int ProductoId, string ProductoNombre, decimal Disponible, decimal Minimo);

// ============================================================
// Facturas
// ============================================================

public interface IFacturaService
{
    Task<FacturaCreada> CrearFacturaAsync(CrearFacturaRequest request, CancellationToken ct = default);
    Task<FacturaDto> GetFacturaAsync(int id, int empresaId, CancellationToken ct = default);
    Task<IEnumerable<FacturaDto>> GetListAsync(int empresaId, DateOnly? desde, DateOnly? hasta, CancellationToken ct = default);
    Task<string> GenerarPdfAsync(int facturaId, CancellationToken ct = default);
    Task<byte[]> GetPdfBytesAsync(int facturaId, int empresaId, CancellationToken ct = default);
    Task<byte[]> GetExcelBytesAsync(int facturaId, int empresaId, CancellationToken ct = default);
    Task<byte[]> GetExcelTrazabilidadAsync(int empresaId, DateOnly desde, DateOnly hasta, CancellationToken ct = default);
}

public class CrearFacturaRequest
{
    public int EmpresaId { get; set; }
    public int ClienteId { get; set; }
    public int SerieId { get; set; }
    public DateOnly FechaFactura { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public bool EsSimplificada { get; set; } = false;
    public int UsuarioId { get; set; }
    public string? Notas { get; set; }
    public List<LineaFacturaRequest> Items { get; set; } = new();
}

public class LineaFacturaRequest
{
    public int ProductoId { get; set; }
    public decimal Cantidad { get; set; }
    public decimal? PrecioUnitario { get; set; }  // Si null, usa precio del producto
    public decimal Descuento { get; set; } = 0;
}

public record FacturaCreada(int FacturaId, string NumeroFactura, decimal Total);

public class FacturaDto
{
    public int Id { get; set; }
    public string NumeroFactura { get; set; } = string.Empty;
    public DateOnly FechaFactura { get; set; }
    public string Estado { get; set; } = string.Empty;
    public bool EsSimplificada { get; set; }
    public EmpresaInfo? Empresa { get; set; }
    public ClienteResumen Cliente { get; set; } = new();
    public decimal BaseImponible { get; set; }
    public decimal IvaTotal { get; set; }
    public decimal Total { get; set; }
    public List<FacturaLineaDto> Lineas { get; set; } = new();
    public string? PdfUrl { get; set; }
}

public class FacturaLineaDto
{
    public int ProductoId { get; set; }
    public string ProductoNombre { get; set; } = string.Empty;
    public string? CodigoLote { get; set; }
    public DateOnly? FechaFabricacion { get; set; }
    public DateOnly? FechaCaducidad { get; set; }
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
    public decimal Descuento { get; set; }
    public decimal IvaPorcentaje { get; set; }
    public decimal Subtotal { get; set; }
    public decimal IvaImporte { get; set; }
}

public record ClienteResumen(int Id = 0, string Nombre = "", string? Nif = null);
public record EmpresaInfo(string Nombre, string Nif, string? RazonSocial, string? Direccion, string? CodigoPostal, string? Ciudad, string? Telefono, string? Email);

// ============================================================
// Produccion
// ============================================================

public interface IProduccionService
{
    Task<ProduccionCreada> CrearProduccionAsync(CrearProduccionRequest request, CancellationToken ct = default);
    Task FinalizarProduccionAsync(int produccionId, int empresaId, int usuarioId, CancellationToken ct = default);
    Task CancelarProduccionAsync(int produccionId, int empresaId, string motivo, CancellationToken ct = default);
}

public class CrearProduccionRequest
{
    public int EmpresaId { get; set; }
    public int ProductoId { get; set; }
    public int UsuarioId { get; set; }
    public DateOnly FechaProduccion { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public decimal CantidadProducida { get; set; }
    public decimal CantidadMerma { get; set; } = 0;
    public string? Notas { get; set; }
    /// <summary>Código de lote sugerido por el usuario (ej: 20022026). Se usará al Finalizar producción. Si null, se autogenera como ddMMyyyy.</summary>
    public string? CodigoLoteSugerido { get; set; }
}

public record ProduccionCreada(int ProduccionId, int? LoteId, string? CodigoLote);

// ============================================================
// Series de Facturación
// ============================================================

public interface ISerieFacturacionService
{
    Task<string> SiguienteNumeroAsync(int empresaId, int serieId, CancellationToken ct = default);
    Task<IEnumerable<SerieDto>> GetSeriesAsync(int empresaId, CancellationToken ct = default);
}

public record SerieDto(int Id, string Codigo, string? Descripcion, string? Prefijo, int UltimoNumero, bool Activa);
