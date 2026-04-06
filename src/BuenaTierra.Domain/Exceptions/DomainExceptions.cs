namespace BuenaTierra.Domain.Exceptions;

/// <summary>
/// Stock insuficiente para completar la operación solicitada.
/// </summary>
public class StockInsuficienteException : DomainException
{
    public int ProductoId { get; }
    public string? ProductoNombre { get; }
    public decimal CantidadSolicitada { get; }
    public decimal CantidadDisponible { get; }

    public StockInsuficienteException(int productoId, decimal solicitada, decimal disponible, string? productoNombre = null)
        : base(string.IsNullOrWhiteSpace(productoNombre)
            ? $"Stock insuficiente para producto {productoId}. Solicitado: {solicitada}, Disponible: {disponible}"
            : $"Stock insuficiente para '{productoNombre}'. Solicitado: {solicitada}, Disponible: {disponible}")
    {
        ProductoId = productoId;
        ProductoNombre = productoNombre;
        CantidadSolicitada = solicitada;
        CantidadDisponible = disponible;
    }
}

/// <summary>
/// No hay lotes disponibles (vigentes, no bloqueados) para el producto.
/// </summary>
public class NoHayLotesDisponiblesException : DomainException
{
    public int ProductoId { get; }

    public NoHayLotesDisponiblesException(int productoId)
        : base($"No hay lotes disponibles para el producto {productoId}")
    {
        ProductoId = productoId;
    }
}

/// <summary>
/// Entidad no encontrada.
/// </summary>
public class EntidadNotFoundException : DomainException
{
    public EntidadNotFoundException(string entidad, object id)
        : base($"{entidad} con id '{id}' no encontrado/a") { }
}

/// <summary>
/// Operación no permitida en el estado actual de la entidad.
/// </summary>
public class EstadoInvalidoException : DomainException
{
    public EstadoInvalidoException(string entidad, string estadoActual, string operacion)
        : base($"No se puede ejecutar '{operacion}' sobre {entidad} en estado '{estadoActual}'") { }
}

/// <summary>
/// Base para todas las excepciones de dominio.
/// </summary>
public class DomainException : Exception
{
    public DomainException(string message) : base(message) { }
    public DomainException(string message, Exception inner) : base(message, inner) { }
}
