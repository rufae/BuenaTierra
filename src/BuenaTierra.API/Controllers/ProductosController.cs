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
    public async Task<ActionResult> GetAll(
        [FromQuery] bool soloActivos = true,
        [FromQuery] int? page = null, [FromQuery] int? pageSize = null,
        CancellationToken ct = default)
    {
        var productos = (await _uow.Productos.GetByEmpresaAsync(EmpresaId, soloActivos, ct)).ToList();
        var p = new PaginationParams(page, pageSize);
        if (p.HasPagination)
        {
            var paged = productos.Skip((p.SafePage - 1) * p.SafePageSize).Take(p.SafePageSize);
            return Ok(PagedResponse<Producto>.Ok(paged, productos.Count, p.SafePage, p.SafePageSize));
        }
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

    // ── Categorias (familias) ──────────────────────────────────────────────────

    [HttpGet("categorias")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetCategorias(CancellationToken ct)
    {
        var cats = await _uow.Categorias.GetQueryable()
            .Where(c => c.EmpresaId == EmpresaId && c.Activa)
            .OrderBy(c => c.Nombre)
            .Select(c => new { c.Id, c.Nombre })
            .ToListAsync(ct);
        return Ok(ApiResponse<IEnumerable<object>>.Ok(cats.Cast<object>()));
    }

    [HttpPost("categorias")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> CreateCategoria([FromBody] CrearCategoriaRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Nombre))
            return BadRequest(ApiResponse<string>.Fail("Nombre requerido"));

        var cat = new Categoria
        {
            EmpresaId = EmpresaId,
            Nombre = req.Nombre.Trim(),
            Activa = true,
        };
        await _uow.Categorias.AddAsync(cat, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { cat.Id, cat.Nombre }));
    }

    // ── CRUD Productos ────────────────────────────────────────────────────────

    [HttpPost]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<Producto>>> Create(
        [FromBody] ProductoRequest req, CancellationToken ct)
    {
        var p = new Producto { EmpresaId = EmpresaId };
        MapRequest(req, p);
        await _uow.Productos.AddAsync(p, ct);
        await _uow.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = p.Id }, ApiResponse<Producto>.Ok(p));
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<ActionResult<ApiResponse<Producto>>> Update(
        int id, [FromBody] ProductoRequest req, CancellationToken ct)
    {
        var existente = await _uow.Productos.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), id);
        if (existente.EmpresaId != EmpresaId) return Forbid();
        MapRequest(req, existente);
        await _uow.Productos.UpdateAsync(existente, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<Producto>.Ok(existente));
    }

    private static string NormalizeVidaUtilUnidad(string? unidad, string? fallback = null)
    {
        var raw = (unidad ?? fallback ?? "Dias").Trim();
        return raw.StartsWith("Mes", StringComparison.OrdinalIgnoreCase) ? "Meses" : "Dias";
    }

    private static void MapRequest(ProductoRequest r, Producto p)
    {
        var vidaUtilUnidad = NormalizeVidaUtilUnidad(r.VidaUtilUnidad, p.VidaUtilUnidad);

        p.Codigo                 = r.Codigo;
        p.CodigoBarras           = r.CodigoBarras;
        p.Nombre                 = r.Nombre ?? string.Empty;
        p.Descripcion            = r.Descripcion;
        p.CategoriaId            = r.CategoriaId;
        p.PrecioVenta            = r.PrecioVenta;
        p.PrecioCoste            = r.PrecioCoste;
        p.IvaPorcentaje          = r.IvaPorcentaje;
        p.UnidadMedida           = r.UnidadMedida ?? "ud";
        p.PesoUnitarioGr         = r.PesoUnitarioGr;
        p.VidaUtilDias           = r.VidaUtilDias;
        p.VidaUtilUnidad         = vidaUtilUnidad;
        p.DescuentoPorDefecto    = r.DescuentoPorDefecto;
        p.ProveedorHabitual      = r.ProveedorHabitual;
        p.Referencia             = r.Referencia;
        p.Fabricante             = r.Fabricante;
        p.StockMinimo            = r.StockMinimo;
        p.StockMaximo            = r.StockMaximo;
        p.RequiereLote           = r.RequiereLote;
        p.CompartidoRepartidores = r.CompartidoRepartidores;
        p.Activo                 = r.Activo;
        p.Conservacion           = r.Conservacion;
        p.TemperaturaMin         = r.TemperaturaMin;
        p.TemperaturaMax         = r.TemperaturaMax;
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var existente = await _uow.Productos.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), id);
        if (existente.EmpresaId != EmpresaId) return Forbid();

        // Guard: no permitir borrado si tiene lotes activos con stock
        var tieneStock = await _uow.Stock.GetQueryable()
            .AnyAsync(s => s.ProductoId == id && s.EmpresaId == EmpresaId && s.CantidadDisponible > 0, ct);
        if (tieneStock)
            return UnprocessableEntity(ApiResponse<string>.Fail(
                "No se puede eliminar: el producto tiene stock activo en uno o más lotes. " +
                "Agote o ajuste el stock antes de eliminarlo."));

        // Guard: no permitir borrado si tiene facturas/albaranes asociados
        var tieneFacturas = await _uow.Facturas.GetQueryable()
            .SelectMany(f => f.Lineas)
            .AnyAsync(l => l.ProductoId == id, ct);
        if (tieneFacturas)
            return UnprocessableEntity(ApiResponse<string>.Fail(
                "No se puede eliminar: el producto aparece en facturas existentes. " +
                "Desactívelo en su lugar."));

        await _uow.Productos.DeleteAsync(existente, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("Eliminado"));
    }

    // ── Export Excel ──────────────────────────────────────────────────────────

    /// <summary>GET /api/productos/exportar-excel — Exporta catálogo filtrado a Excel</summary>
    [HttpGet("exportar-excel")]
    public async Task<IActionResult> ExportarExcel(
        [FromQuery] bool soloActivos = true,
        [FromQuery] int? categoriaId = null,
        [FromQuery] string? q = null,
        CancellationToken ct = default)
    {
        var todos = (await _uow.Productos.GetByEmpresaAsync(EmpresaId, soloActivos, ct)).ToList();

        if (categoriaId.HasValue)
            todos = todos.Where(p => p.CategoriaId == categoriaId.Value).ToList();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            todos = todos.Where(p =>
                p.Nombre.ToLowerInvariant().Contains(term) ||
                (p.Codigo ?? "").ToLowerInvariant().Contains(term) ||
                (p.CodigoBarras ?? "").ToLowerInvariant().Contains(term)
            ).ToList();
        }

        OfficeOpenXml.ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");
        using var package = new OfficeOpenXml.ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Productos");

        string[] headers = {
            "Código", "Cód. Barras", "Nombre", "Descripción", "Familia",
            "Precio Venta", "Precio Coste", "IVA %", "Unidad",
            "Peso Unitario (g)", "Vida Útil", "Unidad Vida Útil", "Dto. Defecto %",
            "Stock Mínimo", "Stock Máximo", "Requiere Lote", "Activo"
        };

        for (int i = 0; i < headers.Length; i++)
            ws.Cells[1, i + 1].Value = headers[i];

        using (var hr = ws.Cells[1, 1, 1, headers.Length])
        {
            hr.Style.Font.Bold = true;
            hr.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            hr.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(41, 128, 185));
            hr.Style.Font.Color.SetColor(System.Drawing.Color.White);
        }

        int row = 2;
        foreach (var p in todos)
        {
            ws.Cells[row, 1].Value  = p.Codigo;
            ws.Cells[row, 2].Value  = p.CodigoBarras;
            ws.Cells[row, 3].Value  = p.Nombre;
            ws.Cells[row, 4].Value  = p.Descripcion;
            ws.Cells[row, 5].Value  = p.Categoria?.Nombre;
            ws.Cells[row, 6].Value  = p.PrecioVenta;
            ws.Cells[row, 7].Value  = p.PrecioCoste;
            ws.Cells[row, 8].Value  = p.IvaPorcentaje;
            ws.Cells[row, 9].Value  = p.UnidadMedida;
            ws.Cells[row, 10].Value = p.PesoUnitarioGr;
            ws.Cells[row, 11].Value = p.VidaUtilDias;
            ws.Cells[row, 12].Value = p.VidaUtilUnidad;
            ws.Cells[row, 13].Value = p.DescuentoPorDefecto;
            ws.Cells[row, 14].Value = p.StockMinimo;
            ws.Cells[row, 15].Value = p.StockMaximo;
            ws.Cells[row, 16].Value = p.RequiereLote ? "Sí" : "No";
            ws.Cells[row, 17].Value = p.Activo ? "Sí" : "No";

            ws.Cells[row, 6].Style.Numberformat.Format = "#,##0.0000 €";
            ws.Cells[row, 7].Style.Numberformat.Format = "#,##0.0000 €";
            row++;
        }

        ws.Cells.AutoFitColumns();

        var bytes = package.GetAsByteArray();
        return File(bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "productos.xlsx");
    }

    // ── Ingredientes del producto ─────────────────────────────────────────────

    [HttpGet("{id:int}/ingredientes")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetIngredientes(
        int id, CancellationToken ct)
    {
        var pis = await _uow.ProductoIngredientes.GetQueryable()
            .Where(pi => pi.ProductoId == id)
            .Include(pi => pi.Ingrediente)
                .ThenInclude(i => i.IngredienteAlergenos)
                    .ThenInclude(ia => ia.Alergeno)
            .OrderBy(pi => pi.EsPrincipal ? 0 : 1)
                .ThenBy(pi => pi.Ingrediente.Nombre)
            .Select(pi => new
            {
                id = pi.Id,
                ingredienteId = pi.IngredienteId,
                nombre = pi.Ingrediente.Nombre,
                cantidadGr = pi.CantidadGr,
                esPrincipal = pi.EsPrincipal,
                esDirecto = pi.Ingrediente.CodigoProveedor != null &&
                            pi.Ingrediente.CodigoProveedor.StartsWith("__direct_"),
                alergenos = pi.Ingrediente.IngredienteAlergenos
                    .Select(ia => new { alergenoId = ia.AlergenoId, nombre = ia.Alergeno.Nombre, codigo = ia.Alergeno.Codigo }),
            })
            .ToListAsync(ct);

        return Ok(ApiResponse<IEnumerable<object>>.Ok(pis.Cast<object>()));
    }

    /// <summary>PUT reemplaza TODOS los ingredientes no-directos del producto.</summary>
    [HttpPut("{id:int}/ingredientes")]
    [Authorize(Policy = "ObradorOrAdmin")]
    public async Task<IActionResult> SetIngredientes(
        int id, [FromBody] SetIngredientesRequest req, CancellationToken ct)
    {
        var producto = await _uow.Productos.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Producto), id);
        if (producto.EmpresaId != EmpresaId) return Forbid();

        // Obtener ingredientes actuales
        var actuales = await _uow.ProductoIngredientes.GetQueryable()
            .Where(pi => pi.ProductoId == id)
            .Include(pi => pi.Ingrediente)
            .ToListAsync(ct);

        // Eliminar solo los no-directos
        foreach (var pi in actuales.Where(pi =>
            pi.Ingrediente.CodigoProveedor == null ||
            !pi.Ingrediente.CodigoProveedor.StartsWith("__direct_")))
        {
            await _uow.ProductoIngredientes.DeleteAsync(pi, ct);
        }

        // Añadir la nueva lista
        foreach (var item in (req.Ingredientes ?? []).DistinctBy(x => x.IngredienteId))
        {
            await _uow.ProductoIngredientes.AddAsync(new ProductoIngrediente
            {
                ProductoId = id,
                IngredienteId = item.IngredienteId,
                CantidadGr = item.CantidadGr,
                EsPrincipal = item.EsPrincipal,
            }, ct);
        }

        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<string>.Ok("Ingredientes actualizados"));
    }

    // ── Alérgenos directos ────────────────────────────────────────────────────

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
public record CrearCategoriaRequest(string Nombre);
public record IngredienteLineaRequest(int IngredienteId, decimal? CantidadGr, bool EsPrincipal);
public record SetIngredientesRequest(List<IngredienteLineaRequest>? Ingredientes);

public record ProductoRequest(
    string?  Codigo,
    string?  CodigoBarras,
    string?  Nombre,
    string?  Descripcion,
    int?     CategoriaId,
    decimal  PrecioVenta,
    decimal? PrecioCoste,
    decimal  IvaPorcentaje,
    string?  UnidadMedida,
    decimal? PesoUnitarioGr,
    int?     VidaUtilDias,
    string?  VidaUtilUnidad,
    decimal? DescuentoPorDefecto,
    string?  ProveedorHabitual,
    string?  Referencia,
    string?  Fabricante,
    decimal? StockMinimo,
    decimal? StockMaximo,
    bool     RequiereLote,
    bool     CompartidoRepartidores,
    bool     Activo,
    string?  Conservacion = null,
    decimal? TemperaturaMin = null,
    decimal? TemperaturaMax = null
);
