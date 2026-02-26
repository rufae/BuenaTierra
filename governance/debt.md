# DEUDA TÉCNICA — BUENATIERRA

> Registro de compromisos diferidos aceptados conscientemente.
> No es una lista de TODOs — es deuda con propietario, impacto y plan de pago.
> Clasificación: Impacto (Alto/Medio/Bajo) × Urgencia (Alta/Media/Baja) × Esfuerzo (S/M/L/XL)

---

## DEUDA CRÍTICA (Impacto Alto)

### DT-001 — Sin tests de integración contra BD real

**Tipo:** Testing  
**Impacto:** Alto — Un refactor en `LoteAsignacionService` o `FacturaService` puede romperse sin detección  
**Urgencia:** Media — No bloquea desarrollo actual, riesgo crece con cada feature  
**Esfuerzo:** L  
**Causa:** Prioridad de velocidad en MVP. Tests unitarios cubren lógica de dominio pero no flujos end-to-end.  
**Plan de pago:** Implementar `WebApplicationFactory` con PostgreSQL de test antes del primer despliegue en producción. Ver `backlog.md` TST-01.  
**Referencia:** `known-issues.md` KI-002

---

### DT-002 — Sin backup automático de PostgreSQL

**Tipo:** Infraestructura / Operacional  
**Impacto:** Alto — Pérdida de datos en caso de fallo de disco o error de mantenimiento  
**Urgencia:** Alta antes de producción  
**Esfuerzo:** M  
**Causa:** Solo hay entorno de desarrollo. El backup manual es suficiente para desarrollo.  
**Plan de pago:** Script `pg_dump` + cron en Docker antes de despliegue. Ver `backlog.md` INF-02.

---

### DT-003 — Sin CI/CD pipeline

**Tipo:** DevOps  
**Impacto:** Alto — Despliegues manuales → riesgo de error humano → downtime  
**Urgencia:** Media — Crítico para producción multi-usuario  
**Esfuerzo:** M  
**Causa:** Proyecto en fase de diseño/desarrollo uniusuario. CI/CD innecesario hasta despliegue real.  
**Plan de pago:** GitHub Actions: build + test + docker push. Ver `backlog.md` NEW-01.

---

## DEUDA MEDIA (Impacto Medio)

### DT-004 — `HasCheckConstraint` API obsoleta en EF Core 9

**Tipo:** Tooling  
**Impacto:** Medio — Genera ruido en build, puede romperse en EF Core 10  
**Urgencia:** Baja — 2 warnings no bloquean  
**Esfuerzo:** S  
**Causa:** API de EF Core cambió en v9. No había documentación clara al implementar.  
**Plan de pago:** Actualizar a nueva sintaxis en próxima sesión de mantenimiento técnico. Ver `known-issues.md` KI-001.

---

### DT-005 — `check_list.md` en raíz con ítems mezclados (histórico + pendiente)

**Tipo:** Gobernanza  
**Impacto:** Medio — Confunde estado real del sistema. Mezcla ítems completados con deuda real.  
**Urgencia:** Baja — Resuelto parcialmente con `tasks/backlog.md`  
**Esfuerzo:** S  
**Causa:** El archivo fue creciendo durante el MVP sin separación de concerns.  
**Plan de pago:** Mantener `check_list.md` como archivo histórico de referencia. No añadir ítems nuevos ahí — usar `tasks/backlog.md`. Sin fecha urgente.

---

### DT-006 — Algoritmo FIFO no considera fecha de caducidad (FEFO)

**Tipo:** Lógica de negocio  
**Impacto:** Medio — En productos con caducidad corta variable, FIFO puede dejar caducar lotes más próximos a vencer si hay lotes de misma fecha producción pero distinta caducidad  
**Urgencia:** Baja — No afecta al negocio actual dado el modelo de producción diaria estándar  
**Esfuerzo:** M  
**Causa:** FEFO requiere registrar `fecha_caducidad` por lote además de `fecha_produccion`. No se incluyó en MVP.  
**Plan de pago:** Evaluar cuando el cliente identifique un caso real de problema. Migración de datos mínima. Ver `backlog.md` (no añadido aún).

---

### DT-007 — Sin auditoría de accesos en base de datos

**Tipo:** Seguridad / Trazabilidad legal  
**Impacto:** Medio — En caso de auditoría regulatoria, no hay traza de quién accedió a qué  
**Urgencia:** Media — Requerimiento implícito CE 178/2002 para trazabilidad completa  
**Esfuerzo:** M  
**Causa:** Serilog registra logs de aplicación pero no persiste quién hizo qué operación sobre qué entidad.  
**Plan de pago:** Tabla `audit_log` con trigger EF Core o interceptor. Ver `backlog.md` NEW-03.

---

## DEUDA BAJA (Impacto Bajo)

### DT-008 — Archivos `api_err.txt` y `api_out.txt` sueltos en raíz

**Tipo:** Orden del repositorio  
**Impacto:** Bajo — No afecta funcionalidad  
**Urgencia:** Baja  
**Esfuerzo:** S  
**Plan de pago:** Añadir al `.gitignore` si no están presentes. Redirigir a `tasks/logs/` en `iniciar_proyecto.md`.

---

## RESUMEN DE ESTADO

| ID | Área | Impacto | Urgencia | Esfuerzo | Estado |
|----|------|---------|----------|----------|--------|
| DT-001 | Testing | Alto | Media | L | Abierta |
| DT-002 | Infra | Alto | Alta (pre-prod) | M | Abierta |
| DT-003 | DevOps | Alto | Media | M | Abierta |
| DT-004 | Tooling | Medio | Baja | S | Abierta |
| DT-005 | Gobernanza | Medio | Baja | S | Mitigada |
| DT-006 | Lógica | Medio | Baja | M | Abierta |
| DT-007 | Seguridad | Medio | Media | M | Abierta |
| DT-008 | Orden | Bajo | Baja | S | Abierta |
