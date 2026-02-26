# PROBLEMAS CONOCIDOS ACTIVOS

> Registro de issues conocidos con workaround documentado.
> Estado: Abierto / Cerrado / En progreso.
> El agente debe consultar este archivo antes de trabajar en áreas afectadas.

---

## ABIERTOS

### KI-001 — Deprecation warning: `HasCheckConstraint` en EF Core 9

**Severidad:** Baja (warning de compilación, no bloquea)  
**Área:** `BuenaTierra.Infrastructure` / `AppDbContext.cs`  
**Síntoma:** 2 advertencias en `dotnet build`:
```
warning CS0618: 'RelationalEntityTypeBuilderExtensions.HasCheckConstraint(...)' is obsolete
```
**Causa raíz:** EF Core 9 cambió la API para check constraints. La llamada anterior usaba la sobrecarga obsoleta.  
**Workaround activo:** Ignorar. No afecta funcionalidad ni runtime.  
**Solución pendiente:** Migrar a la nueva API cuando se actualice EF Core (ver docs de EF Core 9 → 10 migration guide). Tarea en `backlog.md`.  
**Referencia ADR:** ADR-003-ef-core-snakecase.md

---

### KI-002 — Tests de integración con BD real no implementados

**Severidad:** Media (riesgo para refactoring futuro)  
**Área:** `tests/BuenaTierra.Tests/`  
**Síntoma:** 23 tests xUnit existentes son unitarios (sin BD). No hay cobertura de endpoints críticos contra PostgreSQL real.  
**Causa raíz:** Prioridad de velocidad en MVP. Tests de integración requieren `WebApplicationFactory` + BD de test.  
**Workaround activo:** Pruebas manuales vía Swagger + frontend durante desarrollo.  
**Solución pendiente:** Implementar suite de integración. Ver `backlog.md` TST-01.  
**Riesgo:** Un refactor en `LoteAsignacionService` o `FacturaService` podría romperse sin detección automática.

---

### KI-003 — `api_err.txt` y `api_out.txt` sueltos en raíz

**Severidad:** Baja (orden del repositorio)  
**Área:** Raíz del repositorio  
**Síntoma:** Archivos de output de API en desarrollo quedan en el directorio raíz.  
**Causa raíz:** Redireccionamiento de stdout/stderr al arrancar API como background job PowerShell.  
**Workaround activo:** Ignorar. No afectan el sistema.  
**Solución pendiente:** Redirigir output a `tasks/logs/` o añadir al `.gitignore` si no están ya. Baja prioridad.

---

### KI-004 — Sin backup automático de PostgreSQL en desarrollo local

**Severidad:** Alta en datos de cliente real (actualmente solo desarrollo)  
**Área:** Infraestructura / Docker  
**Síntoma:** No hay cron ni script automático de `pg_dump`.  
**Workaround activo:** Dump manual cuando sea necesario:
```bash
docker exec buenatierra-postgres pg_dump -U buenatierra buenatierra > backup_$(date +%Y%m%d).sql
```
**Solución pendiente:** Implementar backup automático antes de despliegue en producción. Ver `backlog.md` INF-02.

---

## CERRADOS

<!-- Mover aquí cuando se resuelva un issue activo, con fecha de cierre.

### KI-XXX — [título]
**Cerrado:** YYYY-MM-DD
**Resolución:** [descripción]

-->
