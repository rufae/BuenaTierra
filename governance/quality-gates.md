# QUALITY GATES — CRITERIOS DE "DONE"

> El agente AI verifica estos criterios antes de marcar cualquier tarea como completada.
> "¿Aprobaría esto un Staff Engineer?" — Si la respuesta es no, no está hecho.

---

## GATE 1 — FEATURE BACKEND (nuevo endpoint o servicio)

**Completado cuando:**

- [ ] Build sin errores (`dotnet build` → 0 errors)
- [ ] Endpoint responde correctamente en Swagger o Postman
- [ ] Validación de inputs (400 para datos inválidos)
- [ ] Manejo de not-found (404 para entidades inexistentes)
- [ ] DTO de respuesta definido (no exponer entidad de dominio directamente)
- [ ] Autorización correcta (`[Authorize(Roles = "...")]` o anonimizado con justificación)
- [ ] Sin N+1 queries (revisar con `.Include()` o proyección en EF)
- [ ] Logging con Serilog en operaciones críticas (creación, modificación, eliminación)
- [ ] Si modifica stock o lotes: trazabilidad registrada

---

## GATE 2 — MIGRACIÓN DE BASE DE DATOS

**Completado cuando:**

- [ ] `dotnet ef migrations add [Nombre]` ejecutado sin errores
- [ ] `dotnet ef database update` aplicado y confirmado
- [ ] `database/01_schema.sql` actualizado para reflejar el nuevo estado del esquema
- [ ] Migración reversible documentada (si tiene riesgo de pérdida de datos)
- [ ] Build continúa en 0 errores post-migración
- [ ] API arranca correctamente con el nuevo esquema

---

## GATE 3 — FEATURE FRONTEND (nueva página o componente)

**Completado cuando:**

- [ ] Sin errores TypeScript (`tsc --noEmit`)
- [ ] Sin errores de consola en navegador
- [ ] Tipos definidos en `frontend/src/types/index.ts` (no `any` sin justificación)
- [ ] TanStack Query usado para fetch de datos (no `useEffect + fetch` manual)
- [ ] Estados de carga y error manejados visualmente (spinner / mensaje de error)
- [ ] Estado vacío manejado (mensaje cuando no hay datos)
- [ ] Formularios con validación básica antes de submit
- [ ] Ruta añadida a `App.tsx` si es página nueva
- [ ] Nav item añadido al sidebar con visibilidad por rol correcta

---

## GATE 4 — CORRECCIÓN DE BUG

**Completado cuando:**

- [ ] Causa raíz identificada (no solo el síntoma)
- [ ] Fix aplicado en la capa correcta (no parche en la capa equivocada)
- [ ] Build 0 errores post-fix
- [ ] Comportamiento corregido demostrado (Swagger / navegador / log)
- [ ] Sin regresiones en funcionalidad adyacente
- [ ] Lección documentada en `tasks/lessons.md` si el error fue del agente

---

## GATE 5 — CAMBIO DE ARQUITECTURA / REFACTORING

**Completado cuando:**

- [ ] ADR creado en `tasks/decisions/` documentando la decisión
- [ ] Todos los tests existentes pasan post-refactor (`dotnet test`)
- [ ] Build 0 errores
- [ ] No se han introducido dependencias circulares entre proyectos
- [ ] La regla de dependencias de Clean Architecture se mantiene:
  - `Domain` → sin dependencias externas
  - `Application` → solo depende de `Domain`
  - `Infrastructure` → depende de `Application` + `Domain`
  - `API` → depende de `Infrastructure` (para DI) + `Application`
- [ ] `governance/CHANGELOG.md` actualizado

---

## GATE 6 — MÓDULO COMPLETO (fase de producto terminada)

**Completado cuando:**

- [ ] Todos los Gates 1-4 cumplidos para cada componente del módulo
- [ ] `check_list.md` actualizado con ítems completados
- [ ] `tasks/backlog.md` actualizado (eliminar o cerrar ítems completados)
- [ ] `governance/CHANGELOG.md` con entrada de versión
- [ ] `.github/memory/context.md` actualizado con nuevo estado del sistema
- [ ] Documentación de usuario actualizada si el módulo es visible al usuario final

---

## GATE 7 — DESPLIEGUE A PRODUCCIÓN

**Completado cuando:**

- [ ] Gate 6 cumplido para todos los módulos desplegados
- [ ] Tests de integración ejecutados contra BD de staging
- [ ] Backup manual de BD de producción previo al despliegue
- [ ] Variables de entorno de producción verificadas (`.env` != `.env.example`)
- [ ] nginx configurado y probado
- [ ] Health check endpoint responde 200
- [ ] Plan de rollback documentado y probado
- [ ] Formación a usuarios completada o agendada
