namespace BuenaTierra.Application.Common;

/// <summary>
/// Respuesta standard de la API. Facilita consistencia en todos los endpoints.
/// </summary>
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Message { get; set; }
    public List<string> Errors { get; set; } = new();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public static ApiResponse<T> Ok(T data, string? message = null)
        => new() { Success = true, Data = data, Message = message };

    public static ApiResponse<T> Fail(string error)
        => new() { Success = false, Errors = [error] };

    public static ApiResponse<T> Fail(IEnumerable<string> errors)
        => new() { Success = false, Errors = errors.ToList() };
}

/// <summary>
/// Respuesta paginada.
/// </summary>
public class PagedResponse<T> : ApiResponse<IEnumerable<T>>
{
    public PaginationMeta Pagination { get; set; } = new();

    public static PagedResponse<T> Ok(IEnumerable<T> data, int total, int page, int pageSize)
        => new()
        {
            Success = true,
            Data = data,
            Pagination = new PaginationMeta
            {
                Total = total,
                Page = page,
                PageSize = pageSize,
                TotalPages = (int)Math.Ceiling((double)total / pageSize)
            }
        };
}

public class PaginationMeta
{
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages { get; set; }
}
