using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProductosController : ControllerBase
{
    private readonly IUnitOfWork _uow;

    public ProductosController(IUnitOfWork uow) => _uow = uow;

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<Producto>>>> GetAll(
        [FromQuery] bool soloActivos = true, CancellationToken ct = default)
    {
        var productos = await _uow.Productos.GetByEmpresaAsync(EmpresaId, soloActivos, ct);
        return Ok(ApiResponse<IEnumerable<Producto>>.Ok(productos));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<Producto>>> Get(int id, CancellationToken ct)
    {
        var producto = await _uow.Productos.GetConIngredientesYAlergenosAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), id);
        return Ok(ApiResponse<Producto>.Ok(producto));
    }

    [HttpGet("buscar")]
    public async Task<ActionResult<ApiResponse<IEnumerable<Producto>>>> Buscar(
        [FromQuery] string q, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(ApiResponse<IEnumerable<Producto>>.Fail("El parametro q es requerido"));
        var productos = await _uow.Productos.SearchAsync(EmpresaId, q, ct);
        return Ok(ApiResponse<IEnumerable<Producto>>.Ok(productos));
    }

    [HttpPost]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<Producto>>> Create(
        [FromBody] Producto producto, CancellationToken ct)
    {
        producto.EmpresaId = EmpresaId;
        await _uow.Productos.AddAsync(producto, ct);
        await _uow.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = producto.Id }, ApiResponse<Producto>.Ok(producto));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<Producto>>> Update(
        int id, [FromBody] Producto producto, CancellationToken ct)
    {
        var existente = await _uow.Productos.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), id);

        existente.Nombre = producto.Nombre;
        existente.Descripcion = producto.Descripcion;
        existente.PrecioVenta = producto.PrecioVenta;
        existente.PrecioCoste = producto.PrecioCoste;
        existente.IvaPorcentaje = producto.IvaPorcentaje;
        existente.UnidadMedida = producto.UnidadMedida;
        existente.VidaUtilDias = producto.VidaUtilDias;
        existente.Activo = producto.Activo;

        await _uow.Productos.UpdateAsync(existente, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<Producto>.Ok(existente));
    }

    [HttpGet("{id:int}/alergenos-directos")]
    public async Task<ActionResult<ApiResponse<object>>> GetAlergenosDirectos(int id, CancellationToken ct)
    {
        string marker = $"__direct_{id}__";
        var ingredienteDirecto = await _uow.Ingredientes.GetQueryable()
            .Where(i => i.EmpresaId == EmpresaId && i.CodigoProveedor == marker)
            .Include(i => i.IngredienteAlergenos)
            .FirstOrDefaultAsync(ct);

        if (ingredienteDirecto is null)
            return Ok(ApiResponse<object>.Ok(new { alergenoIds = Array.Empty<int>() }));

        var ids = ingredienteDirecto.IngredienteAlergenos.Select(ia => ia.AlergenoId).ToList();
        return Ok(ApiResponse<object>.Ok(new { alergenoIds = ids }));
    }

    [HttpPut("{id:int}/alergenos-directos")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> SetAlergenosDirectos(
        int id, [FromBody] SetAlergenosDirectosRequest req, CancellationToken ct)
    {
        var producto = await _uow.Productos.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), id);
        if (producto.EmpresaId != EmpresaId) return Forbid();

        string marker = $"__direct_{id}__";
        string nombre = $"Composicion directa - {producto.Nombre}";

        var ingrediente = await _uow.Ingredientes.GetQueryable()
            .Where(i => i.EmpresaId == EmpresaId && i.CodigoProveedor == marker)
            .Include(i => i.IngredienteAlergenos)
            .FirstOrDefaultAsync(ct);

        if (ingrediente is null)
        {
            ingrediente = new Ingrediente
            {
                EmpresaId = EmpresaId,
                Nombre = nombre,
                Descripcion = "Alergenos asignados directamente al producto.",
                CodigoProveedor = marker,
                Activo = true,
            };
            await _uow.Ingredientes.AddAsync(ingrediente, ct);
            await _uow.SaveChangesAsync(ct);

            await _uow.ProductoIngredientes.AddAsync(new ProductoIngrediente
            {
                ProductoId = id,
                IngredienteId = ingrediente.Id,
                EsPrincipal = false,
            }, ct);
        }
        else
        {
            ingrediente.Nombre = nombre;
            await _uow.Ingredientes.UpdateAsync(ingrediente, ct);

            bool vinculado = await _uow.ProductoIngredientes.GetQueryable()
                .AnyAsync(pi => pi.ProductoId == id && pi.IngredienteId == ingrediente.Id, ct);
            if (!vinculado)
            {
                await _uow.ProductoIngredientes.AddAsync(new ProductoIngrediente
                {
                    ProductoId = id,
                    IngredienteId = ingrediente.Id,
                    EsPrincipal = false,
                }, ct);
            }
        }

        var actuales = await _uow.IngredienteAlergenos.GetQueryable()
            .Where(ia => ia.IngredienteId == ingrediente.Id)
            .ToListAsync(ct);
        foreach (var a in actuales)
            await _uow.IngredienteAlergenos.DeleteAsync(a, ct);

        foreach (var alergenoId in (req.AlergenoIds ?? new List<int>()).Distinct())
        {
            await _uow.IngredienteAlergenos.AddAsync(new IngredienteAlergeno
            {
                IngredienteId = ingrediente.Id,
                AlergenoId = alergenoId,
            }, ct);
        }

        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("OK", "Alergenos actualizados correctamente"));
    }
}

public record SetAlergenosDirectosRequest(List<int>? AlergenoIds);
