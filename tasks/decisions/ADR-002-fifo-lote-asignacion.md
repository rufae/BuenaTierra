# ADR-002 — FIFO como algoritmo de asignación automática de lotes

**Estado:** ACEPTADO  
**Fecha:** 2025 (sesión de automatización de lotes)  
**Decididores:** Cliente (obrador) / AI architect  

---

## Contexto

El obrador produce el mismo producto en múltiples lotes activos simultáneamente (ej: 3 lotes de palmeras en stock con cantidades distintas). Cuando se genera un albarán o factura, el usuario NO debe seleccionar lotes manualmente — el sistema debe asignarlos automáticamente y hacer split de líneas si hay varios lotes involucrados.

El reglamento CE 178/2002 exige trazabilidad completa lote → cliente, lo que obliga a registrar qué lote específico fue vendido a quién.

## Opciones consideradas

1. **FIFO (First In, First Out)** — Usar primero el lote producido antes (por fecha de producción).
2. **FEFO (First Expired, First Out)** — Usar primero el lote con menor fecha de caducidad.
3. **Selección manual** — El usuario elige el lote en cada línea.
4. **LIFO** — No aplica en alimentación por motivos legales/sanitarios.

## Decisión

**FIFO** implementado en `LoteAsignacionService.cs` (`BuenaTierra.Infrastructure.Services`).

Lógica:
1. Ordenar lotes disponibles del producto por `fecha_produccion ASC`
2. Consumir cantidades del lote más antiguo hasta agotarlo
3. Si la cantidad pedida supera el lote, continuar con el siguiente lote (split automático)
4. Registrar cada fragmento como una línea independiente con su `lote_id` explícito

## Consecuencias

**Positivas:**
- Trazabilidad legal completa por defecto
- Rotación natural de stock (reduce caducidades)
- Cero escritura manual de lotes en facturas/albaranes
- Split automático invisible para el usuario

**Negativas:**
- FEFO sería más seguro en productos con caducidad corta variable (mejora futura — ver `backlog.md` NEW-04)
- El algoritmo debe respetar que **conversión albarán→factura NO re-ejecuta FIFO** (ver `lessons.md` Regla #1)

## Regla crítica derivada

Al convertir un albarán existente a factura, los lotes ya están asignados en las líneas del albarán. La factura copia esos lotes directamente. **Nunca llamar a `LoteAsignacionService` en el flujo de conversión.**
