using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuenaTierra.Infrastructure.Repositories;

public class ProductoRepository : Repository<Producto>, IProductoRepository
{
    public ProductoRepository(AppDbContext ctx) : base(ctx) { }

    public async Task<IEnumerable<Producto>> GetByEmpresaAsync(int empresaId, bool soloActivos = true, CancellationToken ct = default)
    {
        var q = _set.Where(p => p.EmpresaId == empresaId);
        if (soloActivos) q = q.Where(p => p.Activo);
        return await q.Include(p => p.Categoria).OrderBy(p => p.Nombre).ToListAsync(ct);
    }

    public async Task<Producto?> GetByCodigoAsync(int empresaId, string codigo, CancellationToken ct = default)
        => await _set.FirstOrDefaultAsync(p => p.EmpresaId == empresaId && p.Codigo == codigo, ct);

    public async Task<IEnumerable<Producto>> SearchAsync(int empresaId, string termino, CancellationToken ct = default)
        => await _set.Where(p => p.EmpresaId == empresaId && p.Activo &&
            (EF.Functions.ILike(p.Nombre, $"%{termino}%") ||
             (p.Codigo != null && EF.Functions.ILike(p.Codigo, $"%{termino}%"))))
            .OrderBy(p => p.Nombre).Take(50).ToListAsync(ct);

    public async Task<Producto?> GetConIngredientesYAlergenosAsync(int id, CancellationToken ct = default)
        => await _set
            .Include(p => p.ProductoIngredientes)
                .ThenInclude(pi => pi.Ingrediente)
                    .ThenInclude(i => i.IngredienteAlergenos)
                        .ThenInclude(ia => ia.Alergeno)
            .FirstOrDefaultAsync(p => p.Id == id, ct);
}

public class ClienteRepository : Repository<Cliente>, IClienteRepository
{
    public ClienteRepository(AppDbContext ctx) : base(ctx) { }

    public async Task<IEnumerable<Cliente>> GetByEmpresaAsync(int empresaId, bool soloActivos = true, CancellationToken ct = default)
    {
        var q = _set.Where(c => c.EmpresaId == empresaId);
        if (soloActivos) q = q.Where(c => c.Activo);
        return await q.OrderBy(c => c.Nombre).ToListAsync(ct);
    }

    public async Task<IEnumerable<Cliente>> GetByRepartidorAsync(int repartidorEmpresaId, CancellationToken ct = default)
        => await _set.Where(c => c.RepartidorEmpresaId == repartidorEmpresaId && c.Activo)
            .OrderBy(c => c.Nombre).ToListAsync(ct);

    public async Task<IEnumerable<Cliente>> SearchAsync(int empresaId, string termino, CancellationToken ct = default)
        => await _set.Where(c => c.EmpresaId == empresaId && c.Activo &&
            (EF.Functions.ILike(c.Nombre, $"%{termino}%") ||
             (c.Apellidos != null && EF.Functions.ILike(c.Apellidos, $"%{termino}%")) ||
             (c.RazonSocial != null && EF.Functions.ILike(c.RazonSocial, $"%{termino}%")) ||
             (c.Nif != null && EF.Functions.ILike(c.Nif, $"%{termino}%"))))
            .OrderBy(c => c.Nombre).Take(50).ToListAsync(ct);
}

public class LoteRepository : Repository<Lote>, ILoteRepository
{
    public LoteRepository(AppDbContext ctx) : base(ctx) { }

    /// <summary>
    /// Obtiene lotes disponibles para asignación FIFO:
    /// - No bloqueados
    /// - No caducados
    /// - Con stock disponible > reservado
    /// - Ordenados por fecha fabricación ASC, luego ID ASC
    /// </summary>
    public async Task<IEnumerable<Lote>> GetDisponiblesFIFOAsync(int empresaId, int productoId, CancellationToken ct = default)
        => await _context.Lotes
            .Include(l => l.Stock)
            .Where(l => l.EmpresaId == empresaId
                     && l.ProductoId == productoId
                     && !l.Bloqueado
                     && (l.FechaCaducidad == null || l.FechaCaducidad > DateOnly.FromDateTime(DateTime.Today))
                     && l.Stock != null
                     && (l.Stock.CantidadDisponible - l.Stock.CantidadReservada) > 0)
            .OrderBy(l => l.FechaFabricacion).ThenBy(l => l.Id)
            .ToListAsync(ct);

    public async Task<IEnumerable<Lote>> GetByProductoAsync(int empresaId, int productoId, CancellationToken ct = default)
        => await _set.Include(l => l.Stock)
            .Where(l => l.EmpresaId == empresaId && l.ProductoId == productoId)
            .OrderByDescending(l => l.FechaFabricacion).ToListAsync(ct);

    public async Task<Lote?> GetByCodigoAsync(int empresaId, string codigoLote, CancellationToken ct = default)
        => await _set.FirstOrDefaultAsync(l => l.EmpresaId == empresaId && l.CodigoLote == codigoLote, ct);
}

public class StockRepository : Repository<Stock>, IStockRepository
{
    public StockRepository(AppDbContext ctx) : base(ctx) { }

    public async Task<Stock?> GetByProductoLoteAsync(int empresaId, int productoId, int loteId, CancellationToken ct = default)
        => await _set.FirstOrDefaultAsync(s => s.EmpresaId == empresaId && s.ProductoId == productoId && s.LoteId == loteId, ct);

    public async Task<IEnumerable<Stock>> GetByProductoAsync(int empresaId, int productoId, CancellationToken ct = default)
        => await _set.Include(s => s.Lote).Where(s => s.EmpresaId == empresaId && s.ProductoId == productoId).ToListAsync(ct);

    public async Task<decimal> GetTotalDisponibleAsync(int empresaId, int productoId, CancellationToken ct = default)
    {
        var lotes = await _context.Lotes
            .Where(l => l.EmpresaId == empresaId && l.ProductoId == productoId && !l.Bloqueado
                     && (l.FechaCaducidad == null || l.FechaCaducidad > DateOnly.FromDateTime(DateTime.Today)))
            .Select(l => l.Id).ToListAsync(ct);

        return await _set
            .Where(s => s.EmpresaId == empresaId && s.ProductoId == productoId && lotes.Contains(s.LoteId))
            .SumAsync(s => s.CantidadDisponible - s.CantidadReservada, ct);
    }

    public async Task<IEnumerable<Stock>> GetStockBajoMinimoAsync(int empresaId, CancellationToken ct = default)
        => await _set.Include(s => s.Producto).Include(s => s.Lote)
            .Where(s => s.EmpresaId == empresaId && s.CantidadDisponible <= s.StockMinimo && s.StockMinimo > 0)
            .ToListAsync(ct);

    public async Task<IEnumerable<StockDetalle>> GetAllConDetalleAsync(int empresaId, CancellationToken ct = default)
        => await _set
            .Include(s => s.Lote)
            .Include(s => s.Producto)
            .Where(s => s.EmpresaId == empresaId && s.CantidadDisponible > 0)
            .OrderBy(s => s.Producto!.Nombre).ThenBy(s => s.Lote!.FechaFabricacion)
            .Select(s => new StockDetalle(
                s.EmpresaId,
                s.ProductoId,
                s.Producto!.Nombre,
                s.LoteId,
                s.Lote!.CodigoLote,
                s.Lote.FechaFabricacion.ToString("dd/MM/yyyy"),
                s.Lote.FechaCaducidad != null ? s.Lote.FechaCaducidad.Value.ToString("dd/MM/yyyy") : null,
                s.CantidadDisponible,
                s.CantidadReservada
            ))
            .ToListAsync(ct);
}

public class FacturaRepository : Repository<Factura>, IFacturaRepository
{
    public FacturaRepository(AppDbContext ctx) : base(ctx) { }

    public async Task<Factura?> GetConLineasAsync(int id, CancellationToken ct = default)
        => await _set
            .Include(f => f.Lineas).ThenInclude(l => l.Producto)
            .Include(f => f.Lineas).ThenInclude(l => l.Lote)
            .Include(f => f.Cliente)
            .Include(f => f.Serie)
            .FirstOrDefaultAsync(f => f.Id == id, ct);

    public async Task<IEnumerable<Factura>> GetByEmpresaAsync(int empresaId, DateOnly? desde = null, DateOnly? hasta = null, CancellationToken ct = default)
    {
        IQueryable<Factura> q = _set.Where(f => f.EmpresaId == empresaId).Include(f => f.Cliente);
        if (desde.HasValue) q = q.Where(f => f.FechaFactura >= desde.Value);
        if (hasta.HasValue) q = q.Where(f => f.FechaFactura <= hasta.Value);
        return await q.OrderByDescending(f => f.FechaFactura).ToListAsync(ct);
    }

    public async Task<IEnumerable<Factura>> GetByClienteAsync(int clienteId, CancellationToken ct = default)
        => await _set.Where(f => f.ClienteId == clienteId)
            .OrderByDescending(f => f.FechaFactura).ToListAsync(ct);

    public async Task<bool> ExisteNumeroAsync(int empresaId, string numero, CancellationToken ct = default)
        => await _set.AnyAsync(f => f.EmpresaId == empresaId && f.NumeroFactura == numero, ct);
}

public class ProduccionRepository : Repository<Produccion>, IProduccionRepository
{
    public ProduccionRepository(AppDbContext ctx) : base(ctx) { }

    public async Task<IEnumerable<Produccion>> GetByFechaAsync(int empresaId, DateOnly fecha, CancellationToken ct = default)
        => await _set
            .Include(p => p.Producto)
            .Include(p => p.Lotes)
            .Where(p => p.EmpresaId == empresaId && p.FechaProduccion == fecha)
            .ToListAsync(ct);

    public async Task<IEnumerable<Produccion>> GetByProductoAsync(int empresaId, int productoId, CancellationToken ct = default)
        => await _set.Where(p => p.EmpresaId == empresaId && p.ProductoId == productoId)
            .OrderByDescending(p => p.FechaProduccion).ToListAsync(ct);
}

public class AlbaranRepository : Repository<Albaran>, IAlbaranRepository
{
    public AlbaranRepository(AppDbContext ctx) : base(ctx) { }

    public async Task<Albaran?> GetConLineasAsync(int id, CancellationToken ct = default)
        => await _set
            .Include(a => a.Lineas).ThenInclude(l => l.Producto)
            .Include(a => a.Lineas).ThenInclude(l => l.Lote)
            .Include(a => a.Cliente)
            .FirstOrDefaultAsync(a => a.Id == id, ct);

    public async Task<IEnumerable<Albaran>> GetByEmpresaAsync(int empresaId, DateOnly? desde = null, DateOnly? hasta = null, CancellationToken ct = default)
    {
        IQueryable<Albaran> q = _set.Where(a => a.EmpresaId == empresaId).Include(a => a.Cliente);
        if (desde.HasValue) q = q.Where(a => a.FechaAlbaran >= desde.Value);
        if (hasta.HasValue) q = q.Where(a => a.FechaAlbaran <= hasta.Value);
        return await q.OrderByDescending(a => a.FechaAlbaran).ToListAsync(ct);
    }
}

public class PedidoRepository : Repository<Pedido>, IPedidoRepository
{
    public PedidoRepository(AppDbContext ctx) : base(ctx) { }

    public async Task<Pedido?> GetConLineasAsync(int id, CancellationToken ct = default)
        => await _set
            .Include(p => p.Lineas).ThenInclude(l => l.Producto)
            .Include(p => p.Cliente)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<IEnumerable<Pedido>> GetByEmpresaAsync(int empresaId, CancellationToken ct = default)
        => await _set.Where(p => p.EmpresaId == empresaId)
            .Include(p => p.Cliente)
            .OrderByDescending(p => p.FechaPedido).ToListAsync(ct);
}
