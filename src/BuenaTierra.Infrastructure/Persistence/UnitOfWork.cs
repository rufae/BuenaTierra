using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Infrastructure.Persistence;
using BuenaTierra.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore.Storage;

namespace BuenaTierra.Infrastructure.Persistence;

/// <summary>
/// Implementación del Unit of Work. Coordina todos los repositorios y gestiona
/// las transacciones de base de datos.
/// </summary>
public class UnitOfWork : IUnitOfWork
{
    private readonly AppDbContext _context;
    private IDbContextTransaction? _transaction;

    private IProductoRepository? _productos;
    private IClienteRepository? _clientes;
    private ILoteRepository? _lotes;
    private IStockRepository? _stock;
    private IFacturaRepository? _facturas;
    private IProduccionRepository? _producciones;
    private IRepository<Empresa>? _empresas;
    private IRepository<Usuario>? _usuarios;
    private IAlbaranRepository? _albaranes;
    private IPedidoRepository? _pedidos;
    private IRepository<Trazabilidad>? _trazabilidades;
    private IRepository<MovimientoStock>? _movimientosStock;
    private IRepository<SerieFacturacion>? _seriesFacturacion;
    private IRepository<Ingrediente>? _ingredientes;
    private IRepository<Alergeno>? _alergenos;
    private IRepository<IngredienteAlergeno>? _ingredienteAlergenos;
    private IRepository<ProductoIngrediente>? _productoIngredientes;
    private IRepository<Categoria>? _categorias;

    public UnitOfWork(AppDbContext context) => _context = context;

    public IProductoRepository Productos => _productos ??= new ProductoRepository(_context);
    public IClienteRepository Clientes => _clientes ??= new ClienteRepository(_context);
    public ILoteRepository Lotes => _lotes ??= new LoteRepository(_context);
    public IStockRepository Stock => _stock ??= new StockRepository(_context);
    public IFacturaRepository Facturas => _facturas ??= new FacturaRepository(_context);
    public IProduccionRepository Producciones => _producciones ??= new ProduccionRepository(_context);
    public IRepository<Empresa> Empresas => _empresas ??= new Repository<Empresa>(_context);
    public IRepository<Usuario> Usuarios => _usuarios ??= new Repository<Usuario>(_context);
    public IAlbaranRepository Albaranes => _albaranes ??= new AlbaranRepository(_context);
    public IPedidoRepository Pedidos => _pedidos ??= new PedidoRepository(_context);
    public IRepository<Trazabilidad> Trazabilidades => _trazabilidades ??= new Repository<Trazabilidad>(_context);
    public IRepository<MovimientoStock> MovimientosStock => _movimientosStock ??= new Repository<MovimientoStock>(_context);
    public IRepository<SerieFacturacion> SeriesFacturacion => _seriesFacturacion ??= new Repository<SerieFacturacion>(_context);
    public IRepository<Ingrediente> Ingredientes => _ingredientes ??= new Repository<Ingrediente>(_context);
    public IRepository<Alergeno> Alergenos => _alergenos ??= new Repository<Alergeno>(_context);
    public IRepository<IngredienteAlergeno> IngredienteAlergenos => _ingredienteAlergenos ??= new Repository<IngredienteAlergeno>(_context);
    public IRepository<ProductoIngrediente> ProductoIngredientes => _productoIngredientes ??= new Repository<ProductoIngrediente>(_context);
    public IRepository<Categoria> Categorias => _categorias ??= new Repository<Categoria>(_context);

    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
        => await _context.SaveChangesAsync(ct);

    public async Task BeginTransactionAsync(CancellationToken ct = default)
        => _transaction = await _context.Database.BeginTransactionAsync(ct);

    public async Task CommitTransactionAsync(CancellationToken ct = default)
    {
        if (_transaction != null)
        {
            await _transaction.CommitAsync(ct);
            await _transaction.DisposeAsync();
            _transaction = null;
        }
    }

    public async Task RollbackTransactionAsync(CancellationToken ct = default)
    {
        if (_transaction != null)
        {
            await _transaction.RollbackAsync(ct);
            await _transaction.DisposeAsync();
            _transaction = null;
        }
    }

    public void Dispose()
    {
        _transaction?.Dispose();
        _context.Dispose();
    }
}
