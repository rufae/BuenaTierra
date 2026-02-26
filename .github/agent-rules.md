# REGLAS DEL AGENTE AI — BUENATIERRA

> **INICIO DE CADA SESIÓN:** Leer en orden antes de planificar:
> 1. `tasks/lessons.md` — reglas activas y errores pasados
> 2. `.github/memory/context.md` — estado actual del sistema
> 3. `.github/memory/known-issues.md` — problemas conocidos activos

---

## Orquestación del Flujo de Trabajo

### 1. Modo Planificación por Defecto
Entra en modo planificación para CUALQUIER tarea no trivial (más de 3 pasos o decisiones arquitectónicas).
Si algo sale mal, PARA y vuelve a planificar de inmediato; no sigas forzando.
Usa el modo planificación para los pasos de verificación, no solo para la construcción.
Escribe especificaciones detalladas por adelantado para reducir la ambigüedad.

### 2. Estrategia de Subagentes
Usa subagentes con frecuencia para mantener limpia la ventana de contexto principal.
Delega la investigación, exploración y análisis paralelo a subagentes.
Para problemas complejos, dedica más capacidad de cómputo mediante subagentes.
Una tarea por subagente para una ejecución focalizada.

### 3. Bucle de Automejora
Tras CUALQUIER corrección del usuario: actualiza `tasks/lessons.md` con el patrón.
Escribe reglas para ti mismo que eviten el mismo error.
Itera implacablemente sobre estas lecciones hasta que la tasa de errores disminuya.
Revisa las lecciones al inicio de la sesión para el proyecto correspondiente.

### 4. Verificación antes de Finalizar
Nunca marques una tarea como completada sin demostrar que funciona.
Compara el diff de comportamiento entre el estado anterior y tus cambios cuando sea relevante.
Pregúntate: "¿Aprobaría esto un ingeniero senior (Staff Engineer)?"
Ejecuta tests, comprueba los logs y demuestra la corrección del código.

### 5. Exige Elegancia (Equilibrado)
Para cambios no triviales: haz una pausa y pregunta "¿hay una forma más elegante?"
Si un arreglo parece un parche: "Sabiendo todo lo que sé ahora, implementa la solución elegante."
Omite esto para arreglos simples y obvios; no hagas sobreingeniería.
Cuestiona tu propio trabajo antes de presentarlo.

### 6. Corrección de Errores Autónoma
Cuando recibas un informe de error: simplemente arréglalo. No pidas que te lleven de la mano.
Identifica logs, errores o tests que fallan y luego resuélvelos.
Cero necesidad de cambio de contexto por parte del usuario.
Ve a arreglar los tests de CI que fallan sin que te digan cómo.

---

## Gestión de Tareas

1. **Planificar Primero**: Escribe el plan en `tasks/todo.md` con elementos verificables.
2. **Verificar Plan**: Confirma antes de comenzar la implementación.
3. **Seguir el Progreso**: Marca los elementos como completados a medida que avances.
4. **Explicar Cambios**: Resumen de alto nivel en cada paso.
5. **Documentar Resultados**: Añade una sección de revisión a `tasks/todo.md`.
6. **Capturar Lecciones**: Actualiza `tasks/lessons.md` después de las correcciones.

---

## Principios Fundamentales

**Simplicidad Primero**: Haz que cada cambio sea lo más simple posible. Afecta al mínimo código necesario.
**Sin Pereza**: Encuentra las causas raíz. Nada de arreglos temporales. Estándares de desarrollador senior.
**Impacto Mínimo**: Los cambios solo deben tocar lo necesario. Evita introducir errores.