# ADR-003 — EF Core con convención snake_case para PostgreSQL

**Estado:** ACEPTADO  
**Fecha:** 2025 (sesión de diseño de base de datos)  
**Decididores:** AI architect  

---

## Contexto

EF Core usa PascalCase por defecto para nombres de tablas y columnas. PostgreSQL trata los identificadores como lowercase por defecto, y la convención estándar en PostgreSQL es `snake_case`. Mezclar convenciones genera SQL con comillas escapadas o errores silenciosos de mapeo.

## Opciones consideradas

1. **Convención por defecto de EF Core (PascalCase)** — Tablas como `Clientes`, columnas como `NombreCompleto`. Requiere comillas en PG.
2. **`UseSnakeCaseNamingConvention()` de EF Core + Npgsql** — Mapeo automático a `clientes`, `nombre_completo`. Estándar PostgreSQL.
3. **Configuración manual por entidad con `[Column(...)]` / `ToTable(...)`** — Granular pero verboso.

## Decisión

**Opción 2 — `UseSnakeCaseNamingConvention()`** configurado en `AppDbContext.cs` via `NpgsqlDbContextOptionsBuilder`.

## Consecuencias

**Positivas:**
- SQL nativo de PostgreSQL legible sin comillas
- Consultas manuales en psql/DBeaver directamente sobre nombres snake_case
- Consistencia total entre ORM y esquema físico
- `01_schema.sql` refleja exactamente los nombres que usa EF Core

**Negativas:**
- Dos advertencias de deprecación en build al usar `HasCheckConstraint` — no bloquean, pendiente de resolución en próxima versión de EF Core (ver `known-issues.md`)
- Los desarrolladores deben recordar que las propiedades `C#` (PascalCase) mapean automáticamente — no añadir atributos `[Column]` manuales que puedan contradecir la convención
