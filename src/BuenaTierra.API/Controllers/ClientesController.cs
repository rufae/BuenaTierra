using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Enums;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using BuenaTierra.Infrastructure.Persistence;

namespace BuenaTierra.API.Controllers;

// ── DTOs ─────────────────────────────────────────────────────────────────────

public record CreateClienteDto(
    // Identificación (CodigoClienteInterno lo genera el servidor; FechaAlta la pone el servidor)
    TipoCliente Tipo,
    string Nombre,
    string? Apellidos,
    string? RazonSocial,
    string? NombreComercial,
    string? NombreFiscal,
    string? Nif,
    string? AliasCliente,
    // Domicilio
    string? Direccion,
    string? CodigoPostal,
    string? Ciudad,
    string? Provincia,
    string? Pais,
    // Contacto
    string? Telefono,
    string? Telefono2,
    string? Email,
    string? PersonaContacto,
    string? ObservacionesContacto,
    // Datos Bancarios
    string? Ccc,
    string? Iban,
    string? Banco,
    string? Bic,
    // Comercial
    FormaPago FormaPago,
    int DiasPago,
    TipoImpuesto TipoImpuesto,
    bool AplicarImpuesto,
    bool RecargoEquivalencia,
    bool NoAplicarRetenciones,
    decimal PorcentajeRetencion,
    decimal DescuentoGeneral,
    int? TarifaId,
    // Otros Datos
    EstadoCliente EstadoCliente,
    bool Activo,
    EstadoSincronizacion EstadoSincronizacion,
    bool NoRealizarFacturas,
    string? Notas,
    // Vinculación
    int? RepartidorEmpresaId
);

public record UpdateClienteDto(
    TipoCliente Tipo,
    string? CodigoClienteInterno,
    string Nombre,
    string? Apellidos,
    string? RazonSocial,
    string? NombreComercial,
    string? NombreFiscal,
    string? Nif,
    string? AliasCliente,
    string? Direccion,
    string? CodigoPostal,
    string? Ciudad,
    string? Provincia,
    string? Pais,
    string? Telefono,
    string? Telefono2,
    string? Email,
    string? PersonaContacto,
    string? ObservacionesContacto,
    string? Ccc,
    string? Iban,
    string? Banco,
    string? Bic,
    FormaPago FormaPago,
    int DiasPago,
    TipoImpuesto TipoImpuesto,
    bool AplicarImpuesto,
    bool RecargoEquivalencia,
    bool NoAplicarRetenciones,
    decimal PorcentajeRetencion,
    decimal DescuentoGeneral,
    int? TarifaId,
    EstadoCliente EstadoCliente,
    bool Activo,
    DateOnly? FechaAlta,
    EstadoSincronizacion EstadoSincronizacion,
    bool NoRealizarFacturas,
    string? Notas,
    int? RepartidorEmpresaId
);

public record UpsertCondicionEspecialDto(
    TipoArticuloFamilia ArticuloFamilia,
    string Codigo,
    string? Descripcion,
    TipoCondicionEspecial Tipo,
    decimal Precio,
    decimal Descuento
);

// ── Controller ────────────────────────────────────────────────────────────────

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ClientesController : ControllerBase
{
    private readonly IUnitOfWork _uow;
    private readonly AppDbContext _db;

    public ClientesController(IUnitOfWork uow, AppDbContext db)
    {
        _uow = uow;
        _db = db;
    }

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    // ── CLIENTES ─────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<ActionResult> GetAll(
        [FromQuery] bool soloActivos = true,
        [FromQuery] int? page = null, [FromQuery] int? pageSize = null,
        CancellationToken ct = default)
    {
        var clientes = (await _uow.Clientes.GetByEmpresaAsync(EmpresaId, soloActivos, ct)).ToList();
        var p = new PaginationParams(page, pageSize);
        if (p.HasPagination)
        {
            var paged = clientes.Skip((p.SafePage - 1) * p.SafePageSize).Take(p.SafePageSize);
            return Ok(PagedResponse<Cliente>.Ok(paged, clientes.Count, p.SafePage, p.SafePageSize));
        }
        return Ok(ApiResponse<IEnumerable<Cliente>>.Ok(clientes));
    }

    /// <summary>GET /api/clientes/exportar-excel — Exporta lista de clientes a Excel</summary>
    [HttpGet("exportar-excel")]
    public async Task<IActionResult> ExportarExcel(CancellationToken ct)
    {
        var clientes = await _uow.Clientes.GetByEmpresaAsync(EmpresaId, false, ct);
        var list = clientes.ToList();

        OfficeOpenXml.ExcelPackage.License.SetNonCommercialPersonal("BuenaTierra");
        using var package = new OfficeOpenXml.ExcelPackage();
        var ws = package.Workbook.Worksheets.Add("Clientes");

        string[] headers = { "Código", "Tipo", "Nombre", "NIF", "Teléfono", "Email", "Ciudad", "Estado", "R.E.", "Activo" };
        for (int i = 0; i < headers.Length; i++)
            ws.Cells[1, i + 1].Value = headers[i];

        using (var hr = ws.Cells[1, 1, 1, headers.Length])
        {
            hr.Style.Font.Bold = true;
            hr.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            hr.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(68, 114, 196));
            hr.Style.Font.Color.SetColor(System.Drawing.Color.White);
        }

        int row = 2;
        foreach (var c in list)
        {
            ws.Cells[row, 1].Value = c.CodigoClienteInterno;
            ws.Cells[row, 2].Value = c.Tipo.ToString();
            ws.Cells[row, 3].Value = c.NombreCompleto;
            ws.Cells[row, 4].Value = c.Nif;
            ws.Cells[row, 5].Value = c.Telefono;
            ws.Cells[row, 6].Value = c.Email;
            ws.Cells[row, 7].Value = c.Ciudad;
            ws.Cells[row, 8].Value = c.EstadoCliente.ToString();
            ws.Cells[row, 9].Value = c.RecargoEquivalencia ? "Sí" : "No";
            ws.Cells[row, 10].Value = c.Activo ? "Sí" : "No";
            row++;
        }
        ws.Cells.AutoFitColumns();

        var bytes = package.GetAsByteArray();
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "clientes.xlsx");
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<Cliente>>> Get(int id, CancellationToken ct)
    {
        var cliente = await _uow.Clientes.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), id);
        return Ok(ApiResponse<Cliente>.Ok(cliente));
    }

    [HttpGet("buscar")]
    public async Task<ActionResult<ApiResponse<IEnumerable<Cliente>>>> Buscar(
        [FromQuery] string q, CancellationToken ct)
    {
        var clientes = await _uow.Clientes.SearchAsync(EmpresaId, q, ct);
        return Ok(ApiResponse<IEnumerable<Cliente>>.Ok(clientes));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<Cliente>>> Create(
        [FromBody] CreateClienteDto dto, CancellationToken ct)
    {
        // Validación NIF/CIF/NIE
        if (!string.IsNullOrWhiteSpace(dto.Nif))
        {
            var (nifValido, nifError) = NifValidator.Validate(dto.Nif);
            if (!nifValido)
                return UnprocessableEntity(ApiResponse<Cliente>.Fail($"NIF/CIF/NIE no válido: {nifError}"));

            // Verificar NIF duplicado dentro de la misma empresa
            var nifNormalizado = dto.Nif.Trim().ToUpperInvariant();
            var nifDuplicado = await _db.Clientes.AnyAsync(
                c => c.EmpresaId == EmpresaId && c.Nif == nifNormalizado && c.Activo, ct);
            if (nifDuplicado)
                return Conflict(ApiResponse<Cliente>.Fail($"Ya existe un cliente activo con el NIF/CIF '{nifNormalizado}' en esta empresa."));
        }

        var cliente = MapToEntity(new Cliente(), dto);
        cliente.EmpresaId = EmpresaId;
        cliente.FechaAlta = DateOnly.FromDateTime(DateTime.Today);  // Fecha de alta = hoy
        await _uow.Clientes.AddAsync(cliente, ct);
        await _uow.SaveChangesAsync(ct);

        // Generar código interno único basado en ID: CLI-000001
        cliente.CodigoClienteInterno = $"CLI-{cliente.Id:D6}";
        await _uow.Clientes.UpdateAsync(cliente, ct);
        await _uow.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = cliente.Id }, ApiResponse<Cliente>.Ok(cliente));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<Cliente>>> Update(
        int id, [FromBody] UpdateClienteDto dto, CancellationToken ct)
    {
        // Validación NIF/CIF/NIE
        if (!string.IsNullOrWhiteSpace(dto.Nif))
        {
            var (nifValido, nifError) = NifValidator.Validate(dto.Nif);
            if (!nifValido)
                return UnprocessableEntity(ApiResponse<Cliente>.Fail($"NIF/CIF/NIE no válido: {nifError}"));

            // Verificar NIF duplicado dentro de la misma empresa (excluir el cliente actual)
            var nifNormalizado = dto.Nif.Trim().ToUpperInvariant();
            var nifDuplicado = await _db.Clientes.AnyAsync(
                c => c.EmpresaId == EmpresaId && c.Nif == nifNormalizado && c.Id != id && c.Activo, ct);
            if (nifDuplicado)
                return Conflict(ApiResponse<Cliente>.Fail($"Ya existe otro cliente activo con el NIF/CIF '{nifNormalizado}' en esta empresa."));
        }

        var existente = await _uow.Clientes.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), id);

        MapToEntity(existente, dto);

        await _uow.Clientes.UpdateAsync(existente, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<Cliente>.Ok(existente));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<ApiResponse<bool>>> Delete(int id, CancellationToken ct)
    {
        var existente = await _uow.Clientes.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), id);
        existente.Activo = false;
        existente.EstadoCliente = EstadoCliente.Inactivo;
        await _uow.Clientes.UpdateAsync(existente, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<bool>.Ok(true));
    }

    // ── CONDICIONES ESPECIALES ────────────────────────────────────────────────

    [HttpGet("{id:int}/condiciones")]
    public async Task<ActionResult<ApiResponse<IEnumerable<ClienteCondicionEspecial>>>> GetCondiciones(
        int id, CancellationToken ct)
    {
        var condiciones = await _db.ClienteCondicionesEspeciales
            .Where(c => c.ClienteId == id)
            .ToListAsync(ct);
        return Ok(ApiResponse<IEnumerable<ClienteCondicionEspecial>>.Ok(condiciones));
    }

    [HttpPost("{id:int}/condiciones")]
    public async Task<ActionResult<ApiResponse<ClienteCondicionEspecial>>> AddCondicion(
        int id, [FromBody] UpsertCondicionEspecialDto dto, CancellationToken ct)
    {
        if (dto.ArticuloFamilia == TipoArticuloFamilia.Familia)
            return BadRequest(ApiResponse<ClienteCondicionEspecial>.Fail("No se admite alcance por familia/categoría. Use producto específico o '*' para todos los productos."));

        var condicion = new ClienteCondicionEspecial
        {
            ClienteId = id,
            ArticuloFamilia = dto.ArticuloFamilia,
            Codigo = dto.Codigo,
            Descripcion = dto.Descripcion,
            Tipo = dto.Tipo,
            Precio = dto.Precio,
            Descuento = dto.Descuento
        };
        await _db.ClienteCondicionesEspeciales.AddAsync(condicion, ct);
        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<ClienteCondicionEspecial>.Ok(condicion));
    }

    [HttpPut("{id:int}/condiciones/{condicionId:int}")]
    public async Task<ActionResult<ApiResponse<ClienteCondicionEspecial>>> UpdateCondicion(
        int id, int condicionId, [FromBody] UpsertCondicionEspecialDto dto, CancellationToken ct)
    {
        if (dto.ArticuloFamilia == TipoArticuloFamilia.Familia)
            return BadRequest(ApiResponse<ClienteCondicionEspecial>.Fail("No se admite alcance por familia/categoría. Use producto específico o '*' para todos los productos."));

        var condicion = await _db.ClienteCondicionesEspeciales
            .FirstOrDefaultAsync(c => c.Id == condicionId && c.ClienteId == id, ct)
            ?? throw new EntidadNotFoundException(nameof(ClienteCondicionEspecial), condicionId);

        condicion.ArticuloFamilia = dto.ArticuloFamilia;
        condicion.Codigo = dto.Codigo;
        condicion.Descripcion = dto.Descripcion;
        condicion.Tipo = dto.Tipo;
        condicion.Precio = dto.Precio;
        condicion.Descuento = dto.Descuento;

        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<ClienteCondicionEspecial>.Ok(condicion));
    }

    [HttpDelete("{id:int}/condiciones/{condicionId:int}")]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteCondicion(
        int id, int condicionId, CancellationToken ct)
    {
        var condicion = await _db.ClienteCondicionesEspeciales
            .FirstOrDefaultAsync(c => c.Id == condicionId && c.ClienteId == id, ct)
            ?? throw new EntidadNotFoundException(nameof(ClienteCondicionEspecial), condicionId);

        _db.ClienteCondicionesEspeciales.Remove(condicion);
        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<bool>.Ok(true));
    }

    // ── Historial de documentos del cliente ─────────────────────────────────────

    /// <summary>GET /api/clientes/{id}/facturas — Últimas 50 facturas del cliente</summary>
    [HttpGet("{id:int}/facturas")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetFacturas(
        int id, CancellationToken ct)
    {
        var facturas = await _db.Facturas
            .Where(f => f.ClienteId == id && f.EmpresaId == EmpresaId)
            .OrderByDescending(f => f.FechaFactura)
            .Take(50)
            .Select(f => new
            {
                f.Id,
                f.NumeroFactura,
                f.FechaFactura,
                f.FechaVencimiento,
                Estado = f.Estado.ToString(),
                f.Total,
                f.EsSimplificada,
            })
            .ToListAsync(ct);

        return Ok(ApiResponse<IEnumerable<object>>.Ok(facturas));
    }

    /// <summary>GET /api/clientes/{id}/albaranes — Últimos 50 albaranes del cliente</summary>
    [HttpGet("{id:int}/albaranes")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetAlbaranes(
        int id, CancellationToken ct)
    {
        var albaranes = await _db.Albaranes
            .Where(a => a.ClienteId == id && a.EmpresaId == EmpresaId)
            .OrderByDescending(a => a.FechaAlbaran)
            .Take(50)
            .Select(a => new
            {
                a.Id,
                a.NumeroAlbaran,
                a.FechaAlbaran,
                Estado = a.Estado.ToString(),
                a.Total,
            })
            .ToListAsync(ct);

        return Ok(ApiResponse<IEnumerable<object>>.Ok(albaranes));
    }

    /// <summary>GET /api/clientes/{id}/pedidos — Últimos 50 pedidos del cliente</summary>
    [HttpGet("{id:int}/pedidos")]
    public async Task<ActionResult<ApiResponse<IEnumerable<object>>>> GetPedidos(
        int id, CancellationToken ct)
    {
        var pedidos = await _db.Pedidos
            .Where(p => p.ClienteId == id && p.EmpresaId == EmpresaId)
            .OrderByDescending(p => p.FechaPedido)
            .Take(50)
            .Select(p => new
            {
                p.Id,
                NumeroPedido = p.NumeroPedido ?? $"PED-{p.Id}",
                Fecha = p.FechaPedido.ToString("yyyy-MM-dd"),
                FechaEntrega = p.FechaEntrega != null ? p.FechaEntrega.Value.ToString("yyyy-MM-dd") : null,
                Estado = p.Estado.ToString(),
                p.Total,
            })
            .ToListAsync(ct);

        return Ok(ApiResponse<IEnumerable<object>>.Ok(pedidos));
    }

    // ── Saldos pendientes ───────────────────────────────────────────────────────

    /// <summary>GET /api/clientes/saldos-pendientes — Suma de facturas emitidas no cobradas por cliente</summary>
    [HttpGet("saldos-pendientes")]
    public async Task<ActionResult<ApiResponse<Dictionary<int, decimal>>>> GetSaldosPendientes(CancellationToken ct)
    {
        var saldos = await _db.Facturas
            .Where(f => f.EmpresaId == EmpresaId
                     && f.Estado != Domain.Enums.EstadoFactura.Cobrada
                     && f.Estado != Domain.Enums.EstadoFactura.Anulada)
            .GroupBy(f => f.ClienteId)
            .Select(g => new { ClienteId = g.Key, Total = g.Sum(f => f.Total) })
            .ToDictionaryAsync(x => x.ClienteId, x => x.Total, ct);

        return Ok(ApiResponse<Dictionary<int, decimal>>.Ok(saldos));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Cliente MapToEntity(Cliente e, CreateClienteDto dto)
    {
        e.Tipo = dto.Tipo;
        // CodigoClienteInterno se genera después del insert
        e.Nombre = dto.Nombre;
        e.Apellidos = dto.Apellidos;
        e.RazonSocial = dto.RazonSocial;
        e.NombreComercial = dto.NombreComercial;
        e.NombreFiscal = dto.NombreFiscal;
        e.Nif = dto.Nif?.Trim().ToUpperInvariant();
        e.AliasCliente = dto.AliasCliente;
        e.Direccion = dto.Direccion;
        e.CodigoPostal = dto.CodigoPostal;
        e.Ciudad = dto.Ciudad;
        e.Provincia = dto.Provincia;
        e.Pais = dto.Pais;
        e.Telefono = dto.Telefono;
        e.Telefono2 = dto.Telefono2;
        e.Email = dto.Email;
        e.PersonaContacto = dto.PersonaContacto;
        e.ObservacionesContacto = dto.ObservacionesContacto;
        e.Ccc = dto.Ccc;
        e.Iban = dto.Iban;
        e.Banco = dto.Banco;
        e.Bic = dto.Bic;
        e.FormaPago = dto.FormaPago;
        e.DiasPago = dto.DiasPago;
        e.TipoImpuesto = dto.TipoImpuesto;
        e.AplicarImpuesto = dto.AplicarImpuesto;
        e.RecargoEquivalencia = dto.RecargoEquivalencia;
        e.NoAplicarRetenciones = dto.NoAplicarRetenciones;
        e.PorcentajeRetencion = dto.PorcentajeRetencion;
        e.DescuentoGeneral = dto.DescuentoGeneral;
        e.TarifaId = dto.TarifaId;
        e.EstadoCliente = dto.EstadoCliente;
        e.Activo = dto.Activo;
        // FechaAlta se asigna en el action (= hoy)
        e.EstadoSincronizacion = dto.EstadoSincronizacion;
        e.NoRealizarFacturas = dto.NoRealizarFacturas;
        e.Notas = dto.Notas;
        e.RepartidorEmpresaId = dto.RepartidorEmpresaId;
        return e;
    }

    private static Cliente MapToEntity(Cliente e, UpdateClienteDto dto)
    {
        e.Tipo = dto.Tipo;
        e.CodigoClienteInterno = dto.CodigoClienteInterno;
        e.Nombre = dto.Nombre;
        e.Apellidos = dto.Apellidos;
        e.RazonSocial = dto.RazonSocial;
        e.NombreComercial = dto.NombreComercial;
        e.NombreFiscal = dto.NombreFiscal;
        e.Nif = dto.Nif?.Trim().ToUpperInvariant();
        e.AliasCliente = dto.AliasCliente;
        e.Direccion = dto.Direccion;
        e.CodigoPostal = dto.CodigoPostal;
        e.Ciudad = dto.Ciudad;
        e.Provincia = dto.Provincia;
        e.Pais = dto.Pais;
        e.Telefono = dto.Telefono;
        e.Telefono2 = dto.Telefono2;
        e.Email = dto.Email;
        e.PersonaContacto = dto.PersonaContacto;
        e.ObservacionesContacto = dto.ObservacionesContacto;
        e.Ccc = dto.Ccc;
        e.Iban = dto.Iban;
        e.Banco = dto.Banco;
        e.Bic = dto.Bic;
        e.FormaPago = dto.FormaPago;
        e.DiasPago = dto.DiasPago;
        e.TipoImpuesto = dto.TipoImpuesto;
        e.AplicarImpuesto = dto.AplicarImpuesto;
        e.RecargoEquivalencia = dto.RecargoEquivalencia;
        e.NoAplicarRetenciones = dto.NoAplicarRetenciones;
        e.PorcentajeRetencion = dto.PorcentajeRetencion;
        e.DescuentoGeneral = dto.DescuentoGeneral;
        e.TarifaId = dto.TarifaId;
        e.EstadoCliente = dto.EstadoCliente;
        e.Activo = dto.Activo;
        e.FechaAlta = dto.FechaAlta;
        e.EstadoSincronizacion = dto.EstadoSincronizacion;
        e.NoRealizarFacturas = dto.NoRealizarFacturas;
        e.Notas = dto.Notas;
        e.RepartidorEmpresaId = dto.RepartidorEmpresaId;
        return e;
    }
}

// ── Validador NIF / CIF / NIE español ────────────────────────────────────────

public static class NifValidator
{
    private const string Letras = "TRWAGMYFPDXBNJZSQVHLCKE";
    private const string LetrasCif = "JABCDEFGHI";
    private static readonly HashSet<char> CifSoloLetra = new() { 'K', 'P', 'Q', 'S' };
    private static readonly HashSet<char> CifSoloDigito = new() { 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'U', 'V' };

    /// <summary>
    /// Valida NIF personal (8 dígitos + letra control),
    /// NIE (X/Y/Z + 7 dígitos + letra control) y
    /// CIF empresa (letra tipo + 7 dígitos + carácter control).
    /// </summary>
    public static (bool Ok, string? Error) Validate(string valor)
    {
        var v = valor.Trim().ToUpperInvariant();

        if (v.Length < 2)
            return (false, "Demasiado corto");

        // ── NIE: X/Y/Z + 7 dígitos + letra ──────────────────────────────────
        if (v[0] is 'X' or 'Y' or 'Z')
        {
            if (v.Length != 9)
                return (false, "NIE debe tener 9 caracteres (X/Y/Z + 7 dígitos + letra)");
            if (!v[1..8].All(char.IsDigit))
                return (false, "NIE: posiciones 2–8 deben ser dígitos");
            var prefijo = v[0] switch { 'X' => '0', 'Y' => '1', _ => '2' };
            var num = long.Parse(prefijo + v[1..8]);
            if (v[8] != Letras[(int)(num % 23)])
                return (false, "Letra de control NIE incorrecta");
            return (true, null);
        }

        // ── NIF personal: 8 dígitos + letra ──────────────────────────────────
        if (char.IsDigit(v[0]))
        {
            if (v.Length != 9)
                return (false, "NIF debe tener 9 caracteres (8 dígitos + letra)");
            if (!v[0..8].All(char.IsDigit))
                return (false, "NIF: los primeros 8 caracteres deben ser dígitos");
            if (v[8] != Letras[(int)(long.Parse(v[0..8]) % 23)])
                return (false, "Letra de control NIF incorrecta");
            return (true, null);
        }

        // ── CIF empresa: letra tipo + 7 dígitos + carácter control ───────────
        if (char.IsLetter(v[0]))
        {
            if (v.Length != 9)
                return (false, "CIF debe tener 9 caracteres");
            if (!v[1..8].All(char.IsDigit))
                return (false, "CIF: posiciones 2–8 deben ser dígitos");

            var sumPar = 0;
            for (var i = 2; i <= 6; i += 2) sumPar += v[i] - '0';

            var sumImpar = 0;
            for (var i = 1; i <= 7; i += 2)
            {
                var d = (v[i] - '0') * 2;
                sumImpar += d > 9 ? d - 9 : d;
            }

            var total = sumPar + sumImpar;
            var digControl = (10 - (total % 10)) % 10;
            var charControl = v[8];

            if (CifSoloLetra.Contains(v[0]))
            {
                if (charControl != LetrasCif[digControl])
                    return (false, "Carácter de control CIF incorrecto (debe ser letra)");
            }
            else if (CifSoloDigito.Contains(v[0]))
            {
                if (charControl != ('0' + digControl))
                    return (false, "Dígito de control CIF incorrecto");
            }
            else
            {
                // Acepta dígito o letra
                if (charControl != ('0' + digControl) && charControl != LetrasCif[digControl])
                    return (false, "Carácter de control CIF incorrecto");
            }
            return (true, null);
        }

        return (false, "Formato desconocido: debe ser NIF (8d+L), NIE (X/Y/Z+7d+L) o CIF (L+7d+C)");
    }
}

