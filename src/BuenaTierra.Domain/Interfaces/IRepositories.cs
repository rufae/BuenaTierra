using BuenaTierra.Domain.Entities;
using System.Linq.Expressions;

namespace BuenaTierra.Domain.Interfaces;

/// <summary>
/// Repositorio genérico base.
/// </summary>
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<IEnumerable<T>> GetAllAsync(CancellationToken ct = default);
    Task<IEnumerable<T>> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default);
    IQueryable<T> GetQueryable();
    Task<T> AddAsync(T entity, CancellationToken ct = default);
    Task UpdateAsync(T entity, CancellationToken ct = default);
    Task DeleteAsync(T entity, CancellationToken ct = default);
    Task<bool> ExistsAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default);
    Task<int> CountAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default);
}

/// <summary>
/// Repositorio de Productos con operaciones específicas.
/// </summary>
public interface IProductoRepository : IRepository<Producto>
{
    Task<IEnumerable<Producto>> GetByEmpresaAsync(int empresaId, bool soloActivos = true, CancellationToken ct = default);
    Task<Producto?> GetByCodigoAsync(int empresaId, string codigo, CancellationToken ct = default);
    Task<IEnumerable<Producto>> SearchAsync(int empresaId, string termino, CancellationToken ct = default);
    Task<Producto?> GetConIngredientesYAlergenosAsync(int id, CancellationToken ct = default);
}

/// <summary>
/// Repositorio de Clientes.
/// </summary>
public interface IClienteRepository : IRepository<Cliente>
{
    Task<IEnumerable<Cliente>> GetByEmpresaAsync(int empresaId, bool soloActivos = true, CancellationToken ct = default);
    Task<IEnumerable<Cliente>> GetByRepartidorAsync(int repartidorEmpresaId, CancellationToken ct = default);
    Task<IEnumerable<Cliente>> SearchAsync(int empresaId, string termino, CancellationToken ct = default);
}

/// <summary>
/// Repositorio de Lotes.
/// </summary>
public interface ILoteRepository : IRepository<Lote>
{
    Task<IEnumerable<Lote>> GetDisponiblesFIFOAsync(int empresaId, int productoId, CancellationToken ct = default);
    Task<IEnumerable<Lote>> GetByProductoAsync(int empresaId, int productoId, CancellationToken ct = default);
    Task<Lote?> GetByCodigoAsync(int empresaId, string codigoLote, CancellationToken ct = default);
}

/// <summary>
/// Repositorio de Stock.
/// </summary>
public interface IStockRepository : IRepository<Stock>
{
    Task<Stock?> GetByProductoLoteAsync(int empresaId, int productoId, int loteId, CancellationToken ct = default);
    Task<IEnumerable<Stock>> GetByProductoAsync(int empresaId, int productoId, CancellationToken ct = default);
    Task<decimal> GetTotalDisponibleAsync(int empresaId, int productoId, CancellationToken ct = default);
    Task<IEnumerable<Stock>> GetStockBajoMinimoAsync(int empresaId, CancellationToken ct = default);
    Task<IEnumerable<StockDetalle>> GetAllConDetalleAsync(int empresaId, CancellationToken ct = default);
}

/// <summary>
/// Repositorio de Facturas.
/// </summary>
public interface IFacturaRepository : IRepository<Factura>
{
    Task<Factura?> GetConLineasAsync(int id, CancellationToken ct = default);
    Task<IEnumerable<Factura>> GetByEmpresaAsync(int empresaId, DateOnly? desde = null, DateOnly? hasta = null, CancellationToken ct = default);
    Task<IEnumerable<Factura>> GetByClienteAsync(int clienteId, CancellationToken ct = default);
    Task<bool> ExisteNumeroAsync(int empresaId, string numero, CancellationToken ct = default);
}

/// <summary>
/// Repositorio de Albaranes.
/// </summary>
public interface IAlbaranRepository : IRepository<Albaran>
{
    Task<Albaran?> GetConLineasAsync(int id, CancellationToken ct = default);
    Task<IEnumerable<Albaran>> GetByEmpresaAsync(int empresaId, DateOnly? desde = null, DateOnly? hasta = null, CancellationToken ct = default);
}

/// <summary>
/// Repositorio de Pedidos.
/// </summary>
public interface IPedidoRepository : IRepository<Pedido>
{
    Task<Pedido?> GetConLineasAsync(int id, CancellationToken ct = default);
    Task<IEnumerable<Pedido>> GetByEmpresaAsync(int empresaId, CancellationToken ct = default);
}

/// <summary>
/// Repositorio de Producciones.
/// </summary>
public interface IProduccionRepository : IRepository<Produccion>
{
    Task<IEnumerable<Produccion>> GetByFechaAsync(int empresaId, DateOnly fecha, CancellationToken ct = default);
    Task<IEnumerable<Produccion>> GetByProductoAsync(int empresaId, int productoId, CancellationToken ct = default);
    Task<IEnumerable<Produccion>> GetFiltradoAsync(
        int empresaId,
        DateOnly? fechaDesde = null,
        DateOnly? fechaHasta = null,
        string? estadoStr = null,
        string? busqueda = null,
        CancellationToken ct = default);
    Task<Produccion?> GetPendienteMismoLoteAsync(int empresaId, int productoId, string codigoLote, DateOnly fecha, CancellationToken ct = default);
    Task<Produccion?> GetFinalizadaMismoLoteAsync(int empresaId, int productoId, string codigoLote, int excludeId, CancellationToken ct = default);
}

/// <summary>
/// Unit of Work: gestiona el contexto y commit transaccional.
/// </summary>
public interface IUnitOfWork : IDisposable
{
    IProductoRepository Productos { get; }
    IClienteRepository Clientes { get; }
    ILoteRepository Lotes { get; }
    IStockRepository Stock { get; }
    IFacturaRepository Facturas { get; }
    IProduccionRepository Producciones { get; }
    IRepository<Empresa> Empresas { get; }
    IRepository<Usuario> Usuarios { get; }
    IAlbaranRepository Albaranes { get; }
    IPedidoRepository Pedidos { get; }
    IRepository<Trazabilidad> Trazabilidades { get; }
    IRepository<MovimientoStock> MovimientosStock { get; }
    IRepository<SerieFacturacion> SeriesFacturacion { get; }
    IRepository<Ingrediente> Ingredientes { get; }
    IRepository<Alergeno> Alergenos { get; }
    IRepository<IngredienteAlergeno> IngredienteAlergenos { get; }
    IRepository<ProductoIngrediente> ProductoIngredientes { get; }
    IRepository<Categoria> Categorias { get; }
    IRepository<ControlMateriaPrima> ControlMatPrimas { get; }
    IRepository<TipoIvaRe> TiposIvaRe { get; }
    IRepository<PlantillaEtiqueta> PlantillasEtiqueta { get; }
    IRepository<EtiquetaImportada> EtiquetasImportadas { get; }
    IRepository<TrabajoImpresionEtiqueta> TrabajosImpresion { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);
    Task BeginTransactionAsync(CancellationToken ct = default);
    Task CommitTransactionAsync(CancellationToken ct = default);
    Task RollbackTransactionAsync(CancellationToken ct = default);
}

public record StockDetalle(
    int EmpresaId,
    int ProductoId,
    string ProductoNombre,
    int LoteId,
    string CodigoLote,
    string FechaLote,
    string? FechaCaducidad,
    decimal CantidadDisponible,
    decimal CantidadReservada
);
