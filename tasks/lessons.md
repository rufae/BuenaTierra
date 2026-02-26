# LECCIONES APRENDIDAS — AGENTE AI

> Registro cronológico de errores cometidos, corregidos por el usuario.
> El agente DEBE leer este archivo al inicio de cada sesión del proyecto BuenaTierra.
> Formato por entrada: Fecha / Error / Causa raíz / Regla nueva.

---

## REGLAS ACTIVAS (extraídas de lecciones)

> Estas reglas son la destilación de todas las lecciones. Leer primero.

1. **No doblar lógica FIFO.** Al convertir albarán → factura, usar los lotes ya asignados en el albarán. No volver a ejecutar FIFO desde el stock. Causa: doble consumo de stock.

2. **Los DTOs de lista deben incluir campos de control de navegación.** `noRealizarFacturas` debe viajar desde el controlador en el DTO de resumen para evitar cargas adicionales al renderizar listas con guards.

3. **Verificar migraciones EF antes de asumir que la columna existe.** Antes de usar cualquier campo nuevo en consultas, confirmar que `dotnet ef migrations add` + `dotnet ef database update` se ejecutaron sin error.

4. **No modificar `check_list.md` sin que el usuario lo pida explícitamente.** Es un artefacto de referencia histórica. Las tareas nuevas van a `tasks/todo.md` y `tasks/backlog.md`.

5. **Siempre leer `tasks/lessons.md` al inicio de sesión** antes de cualquier planificación. Las reglas aquí tienen prioridad sobre el razonamiento por defecto.

---

## LOG DE LECCIONES

### 2025-06-XX — Doble consumo de lotes en conversión albarán→factura

**Error cometido:** Al implementar `convertir-factura`, el servicio ejecutaba de nuevo el algoritmo FIFO sobre el stock disponible en lugar de referenciar los lotes ya asignados en las líneas del albarán de origen.

**Impacto:** Doble descuento de stock. Facturas con lotes diferentes a los del albarán. Ruptura de trazabilidad.

**Causa raíz:** Reutilización incorrecta de `LoteAsignacionService` en un contexto donde la asignación ya estaba hecha.

**Corrección aplicada:** `convertir-factura` lee `AlbaranLineas` del albarán existente y copia directamente sus lotes a las líneas de factura.

**Regla nueva:** Ver Regla #1 arriba.

---

### 2025-06-XX — `noRealizarFacturas` causaba carga extra en listas

**Error cometido:** El guard de "no realizar facturas" requería cargar el detalle completo de cada albarán desde la lista para leer el flag.

**Impacto:** N+1 queries en la vista de albaranes. Degradación de rendimiento en listas largas.

**Causa raíz:** El campo `noRealizarFacturas` no estaba incluido en el DTO de resumen del controlador.

**Corrección aplicada:** Campo añadido al DTO de lista en `AlbaranesController` y en `frontend/src/types/index.ts`.

**Regla nueva:** Ver Regla #2 arriba.

---

<!-- PLANTILLA PARA NUEVAS ENTRADAS:

### YYYY-MM-DD — [Título corto del error]

**Error cometido:** [Qué hizo mal el agente]

**Impacto:** [Qué rompió o qué consecuencia tuvo]

**Causa raíz:** [Por qué ocurrió]

**Corrección aplicada:** [Cómo se resolvió]

**Regla nueva:** [Regla concisa para evitar que vuelva a ocurrir — añadir también a REGLAS ACTIVAS arriba]

-->
