using BuenaTierra.Application.Common;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Exceptions;
using BuenaTierra.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BuenaTierra.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ClientesController : ControllerBase
{
    private readonly IUnitOfWork _uow;

    public ClientesController(IUnitOfWork uow) => _uow = uow;

    private int EmpresaId => int.Parse(User.FindFirstValue("empresa_id")!);

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IEnumerable<Cliente>>>> GetAll(
        [FromQuery] bool soloActivos = true, CancellationToken ct = default)
    {
        var clientes = await _uow.Clientes.GetByEmpresaAsync(EmpresaId, soloActivos, ct);
        return Ok(ApiResponse<IEnumerable<Cliente>>.Ok(clientes));
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
        [FromBody] Cliente cliente, CancellationToken ct)
    {
        cliente.EmpresaId = EmpresaId;
        await _uow.Clientes.AddAsync(cliente, ct);
        await _uow.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = cliente.Id }, ApiResponse<Cliente>.Ok(cliente));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<Cliente>>> Update(
        int id, [FromBody] Cliente cliente, CancellationToken ct)
    {
        var existente = await _uow.Clientes.GetByIdAsync(id, ct)
            ?? throw new EntidadNotFoundException(nameof(Cliente), id);

        existente.Nombre = cliente.Nombre;
        existente.Apellidos = cliente.Apellidos;
        existente.RazonSocial = cliente.RazonSocial;
        existente.Nif = cliente.Nif;
        existente.Telefono = cliente.Telefono;
        existente.Email = cliente.Email;
        existente.Direccion = cliente.Direccion;
        existente.CondicionesPago = cliente.CondicionesPago;
        existente.DescuentoGeneral = cliente.DescuentoGeneral;
        existente.Notas = cliente.Notas;
        existente.Activo = cliente.Activo;

        await _uow.Clientes.UpdateAsync(existente, ct);
        await _uow.SaveChangesAsync(ct);
        return Ok(ApiResponse<Cliente>.Ok(existente));
    }
}
