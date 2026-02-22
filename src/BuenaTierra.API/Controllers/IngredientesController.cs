using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alergenos — Listado de alérgenos reglamentarios (CE 1169/2011)
// Sin tenant: son datos de referencia compartidos.
// ─────────────────────────────────────────────────────────────────────────────

[ApiController]
[Route("api/alergenos")]
[Authorize]
public class AlergenosController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    public AlergenosController(IUnitOfWork uow) => _uow = uow;

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct = default)
    {
        var alergenos = await _uow.Alergenos.GetQueryable()
            .OrderBy(a => a.Nombre)
            .Select(a => new { a.Id, a.Codigo, a.Nombre, a.Descripcion })
            .ToListAsync(ct);
        return Ok(alergenos);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/ingredientes — CRUD de ingredientes + gestión de alérgenos por ingrediente
//                     + asignación de ingredientes a productos
// ─────────────────────────────────────────────────────────────────────────────

[ApiController]
[Route("api/ingredientes")]
[Authorize]
public class IngredientesController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    public IngredientesController(IUnitOfWork uow) => _uow = uow;

    // ── GET /api/ingredientes ────────────────────────────────────────────────
    // Lista todos los ingredientes con sus alérgenos asociados.
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct = default)
    {
        var ingredientes = await _uow.Ingredientes.GetQueryable()
            .Where(i => i.EmpresaId == EmpresaId)
            .OrderBy(i => i.Nombre)
            .Include(i => i.IngredienteAlergenos)
                .ThenInclude(ia => ia.Alergeno)
            .Select(i => new
            {
                i.Id,
                i.Nombre,
                i.Descripcion,
                i.Proveedor,
                i.CodigoProveedor,
                i.Activo,
                alergenos = i.IngredienteAlergenos.Select(ia => new
                {
                    ia.AlergenoId,
                    ia.Alergeno.Codigo,
                    ia.Alergeno.Nombre,
                }).ToList(),
            })
            .ToListAsync(ct);

        return Ok(ingredientes);
    }

    // ── GET /api/ingredientes/{id} ───────────────────────────────────────────
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id, CancellationToken ct = default)
    {
        var ing = await _uow.Ingredientes.GetQueryable()
            .Where(i => i.Id == id && i.EmpresaId == EmpresaId)
            .Include(i => i.IngredienteAlergenos)
                .ThenInclude(ia => ia.Alergeno)
            .FirstOrDefaultAsync(ct);

        if (ing is null) return NotFound();

        return Ok(new
        {
            ing.Id,
            ing.Nombre,
            ing.Descripcion,
            ing.Proveedor,
            ing.CodigoProveedor,
            ing.Activo,
            alergenos = ing.IngredienteAlergenos.Select(ia => new
            {
                ia.AlergenoId,
                ia.Alergeno.Codigo,
                ia.Alergeno.Nombre,
            }).ToList(),
        });
    }

    // ── POST /api/ingredientes ───────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateIngredienteRequest req,
        CancellationToken ct = default)
    {
        var ingrediente = new Ingrediente
        {
            EmpresaId = EmpresaId,
            Nombre = req.Nombre.Trim(),
            Descripcion = req.Descripcion?.Trim(),
            Proveedor = req.Proveedor?.Trim(),
            CodigoProveedor = req.CodigoProveedor?.Trim(),
            Activo = true,
        };

        await _uow.Ingredientes.AddAsync(ingrediente, ct);
        await _uow.SaveChangesAsync(ct);

        // Asociar alérgenos si vienen en la petición
        if (req.AlergenoIds?.Count > 0)
        {
            await SyncAlergenos(ingrediente.Id, req.AlergenoIds, ct);
        }

        return CreatedAtAction(nameof(GetById), new { id = ingrediente.Id },
            new { ingrediente.Id, ingrediente.Nombre });
    }

    // ── PUT /api/ingredientes/{id} ───────────────────────────────────────────
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(
        int id,
        [FromBody] UpdateIngredienteRequest req,
        CancellationToken ct = default)
    {
        var ing = await _uow.Ingredientes.GetQueryable()
            .FirstOrDefaultAsync(i => i.Id == id && i.EmpresaId == EmpresaId, ct);

        if (ing is null) return NotFound();

        ing.Nombre = req.Nombre.Trim();
        ing.Descripcion = req.Descripcion?.Trim();
        ing.Proveedor = req.Proveedor?.Trim();
        ing.CodigoProveedor = req.CodigoProveedor?.Trim();
        ing.Activo = req.Activo;
        ing.UpdatedAt = DateTime.UtcNow;

        await _uow.Ingredientes.UpdateAsync(ing, ct);

        // Sincronizar alérgenos
        if (req.AlergenoIds is not null)
        {
            await SyncAlergenos(id, req.AlergenoIds, ct);
        }
        else
        {
            await _uow.SaveChangesAsync(ct);
        }

        return NoContent();
    }

    // ── DELETE /api/ingredientes/{id} ────────────────────────────────────────
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
    {
        var ing = await _uow.Ingredientes.GetQueryable()
            .FirstOrDefaultAsync(i => i.Id == id && i.EmpresaId == EmpresaId, ct);

        if (ing is null) return NotFound();

        // Verificar que no está en uso en ningún producto
        var enUso = await _uow.ProductoIngredientes.GetQueryable()
            .AnyAsync(pi => pi.IngredienteId == id, ct);

        if (enUso)
            return BadRequest(new { error = "El ingrediente está asignado a uno o más productos. Retíralo primero." });

        await _uow.Ingredientes.DeleteAsync(ing, ct);
        await _uow.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── PUT /api/ingredientes/{id}/alergenos ─────────────────────────────────
    // Reemplaza completamente los alérgenos del ingrediente.
    [HttpPut("{id:int}/alergenos")]
    public async Task<IActionResult> SetAlergenos(
        int id,
        [FromBody] SetAlergenosRequest req,
        CancellationToken ct = default)
    {
        var ing = await _uow.Ingredientes.GetQueryable()
            .FirstOrDefaultAsync(i => i.Id == id && i.EmpresaId == EmpresaId, ct);

        if (ing is null) return NotFound();

        await SyncAlergenos(id, req.AlergenoIds, ct);
        return NoContent();
    }

    // ── GET /api/ingredientes/producto/{productoId} ──────────────────────────
    // Lista ingredientes asignados al producto con sus alérgenos.
    [HttpGet("producto/{productoId:int}")]
    public async Task<IActionResult> GetByProducto(int productoId, CancellationToken ct = default)
    {
        var lineas = await _uow.ProductoIngredientes.GetQueryable()
            .Where(pi => pi.ProductoId == productoId)
            .Include(pi => pi.Ingrediente)
                .ThenInclude(i => i.IngredienteAlergenos)
                    .ThenInclude(ia => ia.Alergeno)
            .OrderBy(pi => pi.Ingrediente.Nombre)
            .Select(pi => new
            {
                pi.Id,
                pi.ProductoId,
                pi.IngredienteId,
                ingredienteNombre = pi.Ingrediente.Nombre,
                pi.CantidadGr,
                pi.EsPrincipal,
                alergenos = pi.Ingrediente.IngredienteAlergenos.Select(ia => new
                {
                    ia.AlergenoId,
                    ia.Alergeno.Codigo,
                    ia.Alergeno.Nombre,
                }).ToList(),
            })
            .ToListAsync(ct);

        // Calcular alérgenos únicos del producto (unión de todos los ingredientes)
        var alergenosProducto = lineas
            .SelectMany(l => l.alergenos)
            .GroupBy(a => a.AlergenoId)
            .Select(g => new { g.First().AlergenoId, g.First().Codigo, g.First().Nombre })
            .OrderBy(a => a.Nombre)
            .ToList();

        return Ok(new
        {
            ingredientes = lineas,
            alergenosProducto,
        });
    }

    // ── PUT /api/ingredientes/producto/{productoId} ──────────────────────────
    // Sincroniza los ingredientes asignados a un producto.
    // Reemplaza completamente la lista.
    [HttpPut("producto/{productoId:int}")]
    public async Task<IActionResult> SetIngredientesProducto(
        int productoId,
        [FromBody] SetIngredientesProductoRequest req,
        CancellationToken ct = default)
    {
        // Eliminar asignaciones actuales
        var existentes = await _uow.ProductoIngredientes.GetQueryable()
            .Where(pi => pi.ProductoId == productoId)
            .ToListAsync(ct);

        foreach (var e in existentes)
            await _uow.ProductoIngredientes.DeleteAsync(e, ct);

        // Insertar nuevas asignaciones
        foreach (var item in req.Ingredientes)
        {
            await _uow.ProductoIngredientes.AddAsync(new ProductoIngrediente
            {
                ProductoId = productoId,
                IngredienteId = item.IngredienteId,
                CantidadGr = item.CantidadGr,
                EsPrincipal = item.EsPrincipal,
            }, ct);
        }

        await _uow.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── GET /api/ingredientes/producto/{productoId}/ficha-alergenos ──────────
    // Ficha completa de alérgenos para etiquetado / auditoría.
    [HttpGet("producto/{productoId:int}/ficha-alergenos")]
    public async Task<IActionResult> GetFichaAlergenos(int productoId, CancellationToken ct = default)
    {
        // Todos los alérgenos reglamentarios
        var todosAlergenos = await _uow.Alergenos.GetQueryable()
            .OrderBy(a => a.Nombre)
            .ToListAsync(ct);

        // Alérgenos presentes en el producto (via ingredientes)
        var presentes = await _uow.ProductoIngredientes.GetQueryable()
            .Where(pi => pi.ProductoId == productoId)
            .Include(pi => pi.Ingrediente)
                .ThenInclude(i => i.IngredienteAlergenos)
            .SelectMany(pi => pi.Ingrediente.IngredienteAlergenos.Select(ia => ia.AlergenoId))
            .Distinct()
            .ToListAsync(ct);

        var ficha = todosAlergenos.Select(a => new
        {
            a.Id,
            a.Codigo,
            a.Nombre,
            presente = presentes.Contains(a.Id),
        }).ToList();

        // Producto info
        var producto = await _uow.Productos.GetQueryable()
            .Where(p => p.Id == productoId && p.EmpresaId == EmpresaId)
            .Select(p => new { p.Id, p.Nombre, p.Codigo })
            .FirstOrDefaultAsync(ct);

        return Ok(new
        {
            producto,
            ficha,
            totalAlergenos = ficha.Count(f => f.presente),
        });
    }

    // ── Helper: sincronizar alérgenos de un ingrediente ──────────────────────
    private async Task SyncAlergenos(int ingredienteId, List<int> alergenoIds, CancellationToken ct)
    {
        var existentes = await _uow.IngredienteAlergenos.GetQueryable()
            .Where(ia => ia.IngredienteId == ingredienteId)
            .ToListAsync(ct);

        foreach (var e in existentes)
            await _uow.IngredienteAlergenos.DeleteAsync(e, ct);

        foreach (var alergenoId in alergenoIds.Distinct())
        {
            await _uow.IngredienteAlergenos.AddAsync(new IngredienteAlergeno
            {
                IngredienteId = ingredienteId,
                AlergenoId = alergenoId,
            }, ct);
        }

        await _uow.SaveChangesAsync(ct);
    }
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

public record CreateIngredienteRequest(
    string Nombre,
    string? Descripcion,
    string? Proveedor,
    string? CodigoProveedor,
    List<int>? AlergenoIds
);

public record UpdateIngredienteRequest(
    string Nombre,
    string? Descripcion,
    string? Proveedor,
    string? CodigoProveedor,
    bool Activo,
    List<int>? AlergenoIds
);

public record SetAlergenosRequest(List<int> AlergenoIds);

public record IngredienteProductoItem(int IngredienteId, decimal? CantidadGr, bool EsPrincipal);

public record SetIngredientesProductoRequest(List<IngredienteProductoItem> Ingredientes);
