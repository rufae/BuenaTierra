using BuenaTierra.Application.Common;
using BuenaTierra.Application.Interfaces;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/buenatierr-ai")]
[Authorize]
public class BuenaTierrAIController : ControllerBase
{
    private readonly IBuenaTierrAIService _aiService;
    private readonly IUnitOfWork _uow;
    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    public BuenaTierrAIController(IBuenaTierrAIService aiService, IUnitOfWork uow)
    {
        _aiService = aiService;
        _uow = uow;
    }

    /// <summary>GET /api/buenatierr-ai/status — Estado de configuración segura de IA</summary>
    [HttpGet("status")]
    public async Task<ActionResult<ApiResponse<BuenaTierrAIStatusResponse>>> GetStatus(CancellationToken ct)
    {
        var status = await _aiService.GetStatusAsync(ct);
        return Ok(ApiResponse<BuenaTierrAIStatusResponse>.Ok(status));
    }

    /// <summary>GET /api/buenatierr-ai/context — Contexto agregado seguro para IA sin acceso directo a BD</summary>
    [HttpGet("context")]
    public async Task<ActionResult<ApiResponse<BuenaTierrAIContextResponse>>> GetContext(CancellationToken ct)
    {
        var response = new BuenaTierrAIContextResponse();
        var logger = HttpContext.RequestServices.GetRequiredService<ILogger<BuenaTierrAIController>>();

        // ── Productos con categoría ──
        try
        {
            var productos = await _uow.Productos.GetQueryable()
                .Where(p => p.EmpresaId == EmpresaId && p.Activo)
                .Include(p => p.Categoria)
                .OrderBy(p => p.Nombre)
                .Take(200)
                .ToListAsync(ct);

            response.Productos = productos.Select(p => new
            {
                p.Id,
                p.Codigo,
                p.Nombre,
                Categoria = p.Categoria?.Nombre,
                p.PrecioVenta,
                p.PrecioCoste,
                p.IvaPorcentaje,
                p.UnidadMedida,
                p.VidaUtilDias,
                p.StockMinimo,
                p.IngredientesTexto,
                p.Trazas
            }).ToList();
        }
        catch (Exception ex)
        {
            response.Warnings.Add("No se pudo cargar productos para el contexto IA.");
            logger.LogWarning(ex, "BuenaTierrAI context: fallo cargando productos");
        }

        // ── Categorías ──
        try
        {
            var categorias = await _uow.Categorias.GetQueryable()
                .Where(c => c.EmpresaId == EmpresaId && c.Activa)
                .OrderBy(c => c.Nombre)
                .ToListAsync(ct);

            response.Categorias = categorias.Select(c => new
            {
                c.Id,
                c.Nombre,
                c.Descripcion
            }).ToList();
        }
        catch (Exception ex)
        {
            response.Warnings.Add("No se pudo cargar categorías para el contexto IA.");
            logger.LogWarning(ex, "BuenaTierrAI context: fallo cargando categorías");
        }

        // ── Ingredientes con alérgenos ──
        try
        {
            var ingredientes = await _uow.Ingredientes.GetQueryable()
                .Where(i => i.EmpresaId == EmpresaId && i.Activo)
                .Include(i => i.IngredienteAlergenos)
                    .ThenInclude(ia => ia.Alergeno)
                .OrderBy(i => i.Nombre)
                .ToListAsync(ct);

            response.IngredientesConAlergenos = ingredientes.Select(i => new
            {
                i.Id,
                i.Nombre,
                i.Proveedor,
                Alergenos = i.IngredienteAlergenos.Select(ia => ia.Alergeno.Nombre).ToList()
            }).ToList();
        }
        catch (Exception ex)
        {
            response.Warnings.Add("No se pudo cargar ingredientes/alérgenos para el contexto IA.");
            logger.LogWarning(ex, "BuenaTierrAI context: fallo cargando ingredientes");
        }

        // ── Clientes ──
        try
        {
            var clientes = await _uow.Clientes.GetQueryable()
                .Where(c => c.EmpresaId == EmpresaId)
                .OrderBy(c => c.RazonSocial ?? c.NombreComercial ?? c.Nombre)
                .Take(100)
                .ToListAsync(ct);

            response.Clientes = clientes.Select(c => new
            {
                c.Id,
                NombreCompleto = c.NombreCompleto,
                c.Nif,
                Tipo = c.Tipo.ToString(),
                Estado = c.EstadoCliente.ToString(),
                c.Activo,
                FormaPago = c.FormaPago.ToString(),
                c.DescuentoGeneral,
                c.NoRealizarFacturas,
                c.RecargoEquivalencia
            }).ToList();
        }
        catch (Exception ex)
        {
            response.Warnings.Add("No se pudo cargar clientes para el contexto IA.");
            response.Clientes = Array.Empty<object>();
            logger.LogWarning(ex, "BuenaTierrAI context: fallo cargando clientes");
        }

        try
        {
            response.Stock = (await _uow.Stock.GetAllConDetalleAsync(EmpresaId, ct))
                .Take(150)
                .Select(s => new
                {
                    s.ProductoId,
                    s.ProductoNombre,
                    s.LoteId,
                    s.CodigoLote,
                    s.FechaLote,
                    s.FechaCaducidad,
                    s.CantidadDisponible,
                    s.CantidadReservada
                })
                .ToList();
        }
        catch (Exception ex)
        {
            response.Warnings.Add("No se pudo cargar stock para el contexto IA.");
            response.Stock = Array.Empty<object>();
            logger.LogWarning(ex, "BuenaTierrAI context: fallo cargando stock");
        }

        try
        {
            var pedidos = await _uow.Pedidos.GetQueryable()
                .Where(p => p.EmpresaId == EmpresaId)
                .Include(p => p.Cliente)
                .OrderByDescending(p => p.FechaPedido)
                .Take(100)
                .ToListAsync(ct);

            response.Pedidos = pedidos.Select(p => new
            {
                p.Id,
                p.NumeroPedido,
                p.FechaPedido,
                Estado = p.Estado.ToString(),
                Cliente = p.Cliente?.NombreCompleto ?? string.Empty,
                p.Total
            }).ToList();
        }
        catch (Exception ex)
        {
            response.Warnings.Add("No se pudo cargar pedidos para el contexto IA.");
            response.Pedidos = Array.Empty<object>();
            logger.LogWarning(ex, "BuenaTierrAI context: fallo cargando pedidos");
        }

        try
        {
            var facturas = await _uow.Facturas.GetQueryable()
                .Where(f => f.EmpresaId == EmpresaId)
                .Include(f => f.Cliente)
                .OrderByDescending(f => f.FechaFactura)
                .Take(100)
                .ToListAsync(ct);

            response.Facturas = facturas.Select(f => new
            {
                f.Id,
                f.NumeroFactura,
                f.FechaFactura,
                Estado = f.Estado.ToString(),
                Cliente = f.Cliente?.NombreCompleto ?? string.Empty,
                f.Total
            }).ToList();
        }
        catch (Exception ex)
        {
            response.Warnings.Add("No se pudo cargar facturas para el contexto IA.");
            response.Facturas = Array.Empty<object>();
            logger.LogWarning(ex, "BuenaTierrAI context: fallo cargando facturas");
        }

        // ── Producciones recientes ──
        try
        {
            var producciones = await _uow.Producciones.GetQueryable()
                .Where(p => p.EmpresaId == EmpresaId)
                .Include(p => p.Producto)
                .OrderByDescending(p => p.FechaProduccion)
                .Take(50)
                .ToListAsync(ct);

            response.Producciones = producciones.Select(p => new
            {
                p.Id,
                Producto = p.Producto?.Nombre,
                p.FechaProduccion,
                p.CantidadProducida,
                p.CantidadMerma,
                Estado = p.Estado.ToString()
            }).ToList();
        }
        catch (Exception ex)
        {
            response.Warnings.Add("No se pudo cargar producciones para el contexto IA.");
            logger.LogWarning(ex, "BuenaTierrAI context: fallo cargando producciones");
        }

        return Ok(ApiResponse<BuenaTierrAIContextResponse>.Ok(response));
    }

    /// <summary>POST /api/buenatierr-ai/chat — Chat IA con contexto solo por API autorizada</summary>
    [HttpPost("chat")]
    public async Task<ActionResult<ApiResponse<BuenaTierrAIChatResponse>>> Chat(
        [FromBody] BuenaTierrAIChatRequest request,
        CancellationToken ct)
    {
        var result = await _aiService.ChatAsync(request, ct);
        return Ok(ApiResponse<BuenaTierrAIChatResponse>.Ok(result));
    }
}
