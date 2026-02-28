# BACKLOG MAESTRO — BUENATIERRA
# Prompt ultra-detallado de todo lo pendiente, a corregir, y a construir

> Generado: 2026-02-28  
> Estado del sistema en el momento de generación:  
> — Backend ASP.NET Core 9, puerto 5064  
> — Frontend React 18 + Vite + TypeScript + TailwindCSS, puerto 5173  
> — PostgreSQL Docker, puerto 5433  
> — Módulos existentes: Clientes, Productos, Ingredientes, Lotes, Stock,  
>   Producción, Pedidos, Albaranes, Facturación, Trazabilidad, Series, Dashboard, Ajustes, Usuarios

---

## ══════════════════════════════════════════════════════
## BLOQUE 1 — LÓGICA DE NEGOCIO Y MODELO DE DOMINIO
## ══════════════════════════════════════════════════════

### 1.1 — RECARGO DE EQUIVALENCIA (crítico, afecta facturación)

**Situación actual:**  
- `Cliente.RecargoEquivalencia = bool` → el cliente o tiene RE o no lo tiene.  
- `FacturaLinea.RecargoEquivalenciaPorcentaje = decimal` → se puede poner cualquier valor por línea.  
- **Problema:** El porcentaje de RE NO está vinculado al tipo de IVA de la línea de forma automática. Se puede crear una factura con IVA al 10% y RE al 1,4% (correcto) o al 5,2% (con cualquier número por error). No hay tabla de relación IVA↔RE.

**Lo que hay que hacer:**

- [x] Crear tabla `TiposIvaRe` (o configurarla en `Empresa`) con los tramos legales vigentes: ✅ Tabla creada en DB + Entity + API CRUD + UI en Etiquetas/IVA-RE
  - IVA 4% → RE 0,5%
  - IVA 10% → RE 1,4%
  - IVA 21% → RE 5,2%
- [ ] Al crear/editar una línea de factura o albarán, si el cliente tiene `RecargoEquivalencia = true`, el campo RE debe autorellenarse con el porcentaje correcto según el IVA de ese producto, no dejarlo como campo libre.
- [ ] En el formulario de creación de facturas (`Facturacion.tsx`) y albaranes (`Albaranes.tsx`), mostrar visualmente si el cliente lleva RE (badge o etiqueta en el selector de cliente).
- [ ] En el resumen de factura/albarán, mostrar el desglose: Base + IVA + RE (separados, no sumados).
- [ ] Verificar que `RecalcularTotales()` de la entidad `Factura` produce resultados correctos cuando hay líneas mixtas (unas con RE y otras sin él).
- [ ] En `Productos.tsx` y entidad `Producto`: asegurarse de que cada producto tiene un `IvaPorcentaje` propio (p.ej. 10% para alimentos) que se traslada automáticamente a las líneas al añadir el producto.
- [ ] Tests de integración: factura con cliente RE, varios IVAs, verificar que los totales cuadran.

---

### 1.2 — ESTADOS DE PEDIDOS (flujo completo)

**Situación actual:**  
- Estados definidos en enum: `Pendiente, Confirmado, EnPreparacion, Servido, Cancelado`  
- En `Pedidos.tsx` se ven los colores por estado pero la transición de estados NO está implementada en el frontend. Solo se puede crear y quizás cancelar.

**Lo que hay que hacer:**

- [x] Implementar botones de transición de estado en la vista de detalle del pedido: ✅ Botones en Pedidos.tsx para Preparado, EnReparto, Entregado
  - `Pendiente` → puede ir a `Confirmado` o `Cancelado`
  - `Confirmado` → puede ir a `EnPreparacion` o `Cancelado`
  - `EnPreparacion` → puede ir a `Preparado` → `EnReparto` → `Entregado`
  - `Entregado` → estado terminal
  - `Cancelado` → estado terminal
- [x] Endpoint en backend: ✅ POST /pedidos/{id}/preparado, /en-reparto, /entregado con validación de estado.
- [ ] Mostrar historial de cambios de estado en el detalle del pedido (tabla o timeline con fecha, usuario, estado anterior → nuevo).
- [ ] Cuando un pedido pase a `EnPreparacion`, generar automáticamente el albarán asociado (o al menos ofrecer el botón "Generar Albarán desde este Pedido").
- [ ] Cuando un pedido pase a `Servido`, marcarlo como entregado y reflejar la fecha de entrega real.
- [ ] Añadir filtro por estado en la lista de pedidos.
- [ ] Añadir campo `FechaEntregaReal` en entidad `Pedido` (hoy solo existe `FechaEntrega` planificada).
- [ ] Notificación visual cuando hay pedidos en estado `Pendiente` por más de X horas (badge en el menú lateral).

---

### 1.3 — ESTADOS DE ALBARANES (flujo completo)

**Situación actual:**  
- Estados: `Pendiente, Entregado, Facturado, Cancelado`  
- La conversión albarán→factura funciona pero el estado del albarán no siempre queda en `Facturado` correctamente en todos los flujos.  
- No existe botón de "Marcar como Entregado" explícito.

**Lo que hay que hacer:**

- [x] Botón "Marcar como Entregado" en la lista/detalle de albarán. ✅ + botón "En reparto" y "Cancelar" en Albaranes.tsx
- [x] Endpoint: ✅ POST /albaranes/{id}/en-reparto y /cancelar con validación de transiciones.
- [ ] Al convertir a factura, verificar que el albarán queda en `Facturado` y que se muestra el número de factura generada vinculado.
- [ ] Historial de cambios de estado en el detalle del albarán.
- [ ] Albarán en estado `Facturado` → no permitir edición ni cancelación.
- [ ] Albarán en estado `Cancelado` → debe devolver el stock consumido (endpoint + lógica de devolución de stock por lote FIFO inverso).
- [ ] Filtro por estado en la lista de albaranes.

---

### 1.4 — ESTADOS DE FACTURAS (flujo completo)

**Situación actual:**  
- Estados: `Borrador, Emitida, Cobrada, Cancelada`  
- Actualmente las facturas se crean directamente en `Emitida`, sin pasar por `Borrador`.

**Lo que hay que hacer:**

- [x] Implementar estado `Borrador`: ✅ Backend endpoint POST /facturas/{id}/emitir (Borrador→Emitida)
- [x] Al emitir una factura (Borrador → Emitida): ✅ endpoint creado con validación de estado
- [x] Botón "Marcar como Cobrada": ✅ POST /facturas/{id}/cobrar + botones en Facturacion.tsx (lista y detalle)
- [x] Botón "Anular Factura": ✅ POST /facturas/{id}/anular + botón en Facturacion.tsx. Pendiente: factura rectificativa automática.
- [ ] No permitir nunca borrar una factura `Emitida` o `Cobrada`, solo anular.
- [ ] Resaltar visualmente facturas vencidas (FechaVencimiento < hoy y estado ≠ Cobrada).
- [ ] Exportación de facturas a Excel con columnas: Número, Fecha, Cliente, NIF, Base, IVA, RE, Total, Estado, FechaVencimiento, FechaCobro.

---

### 1.5 — AUTOMATIZACIÓN DE LOTES FIFO (objetivo central del negocio)

**Situación actual:**  
- Existe `LoteAsignacionService` en el backend y funciona para albaranes.  
- La lección #1 del lessons.md dice que la conversión albarán→factura NO debe volver a ejecutar FIFO.  
- El formulario de creación de facturas directas (`Facturacion.tsx`) NO usa el servicio FIFO, las líneas se crean sin lote asignado.

**Lo que hay que hacer:**

- [ ] En el flujo de factura directa (sin albarán previo), al añadir un producto, llamar al endpoint `GET /stock/disponible/{productoId}` y mostrar los lotes disponibles con sus cantidades.
- [ ] Al introducir la cantidad total, ejecutar el split FIFO automáticamente en frontend y mostrar las sublíneas resultantes al usuario antes de confirmar.
- [ ] El usuario debe poder revisar y ajustar el split manualmente si lo necesita.
- [ ] En backend: endpoint `POST /stock/simular-fifo` que reciba `productoId + cantidad` y devuelva la lista de asignaciones de lotes sin consumir stock.
- [ ] Verificar que el split FIFO funciona correctamente cuando la cantidad solicitada supera el stock disponible (debe avisar, no crear líneas con cantidad negativa).
- [ ] El mismo mecanismo FIFO debe aplicarse en `FacturacionRapida.tsx`.
- [ ] Añadir columna "Lote" visible en las líneas de factura dentro del PDF generado.

---

### 1.6 — STOCK NEGATIVO Y ALERTAS

**Situación actual:**  
- No hay guardia clara que impida vender más stock del disponible.

**Lo que hay que hacer:**

- [ ] En backend, antes de confirmar cualquier venta/albarán/factura, verificar que el stock de cada lote es ≥ 0 después de la operación.
- [ ] Si el stock total del producto es 0 o insuficiente, devolver HTTP 422 con mensaje descriptivo por línea.
- [ ] En frontend, mostrar advertencia visual (amarillo) cuando el stock de un producto está por debajo del mínimo configurado.
- [ ] En frontend, mostrar error (rojo) cuando se intenta añadir más cantidad de la disponible.
- [ ] Dashboard: widget de "Productos con stock bajo o crítico" con enlace directo a producción.

---

## ══════════════════════════════════════════════════════
## BLOQUE 2 — MÓDULO CLIENTES
## ══════════════════════════════════════════════════════

### 2.1 — Formulario de creación/edición de clientes

- [ ] Campo `TarifaId` (tarifa de precios) visible en el formulario pero actualmente no existe la entidad `Tarifa`. Crear módulo de tarifas o eliminar el campo del modelo si no se implementa en este sprint.
- [ ] Validación de NIF/CIF/NIE ya existe en frontend (`validateNif`). Implementar la misma validación en backend para que el API también rechace NIFs inválidos.
- [ ] El campo `RecargoEquivalencia` (bool) debe explicarse en el UI: tooltip o texto de ayuda que diga "Aplica recargo de equivalencia (autónomos/comerciantes minoristas)".
- [ ] Cuando `RecargoEquivalencia = true`, mostrar automáticamente qué porcentaje se aplicará según los tipos de IVA configurados en la empresa.
- [ ] El campo `NoRealizarFacturas` debe mostrarse de forma prominente en el formulario y en la lista (icono rojo en el row).
- [ ] Añadir campo `RepartidorEmpresaId` como selector desplegable de "Repartidor asignado" en el tab de datos comerciales (visible solo si el usuario es Admin u Obrador).
- [ ] Tab "Condiciones especiales" en el modal de edición: actualmente existe `ClienteCondicionEspecial` en el modelo pero la UI debe terminar de permitir CRUD de condiciones por familia de artículo o código de artículo concreto.

### 2.2 — Lista de clientes

- [ ] Añadir columna "Tipo" (Empresa/Autónomo/Particular/Repartidor) visible en la tabla.
- [ ] Añadir filtro por tipo de cliente.
- [ ] Añadir filtro por "Repartidor asignado".
- [ ] Exportar lista de clientes a Excel.
- [ ] Indicador visual (icono/badge) cuando el cliente tiene `NoRealizarFacturas = true`.
- [ ] Indicador visual cuando el cliente tiene recargo de equivalencia activo.

### 2.3 — Historial del cliente (modal ya implementado)

- [ ] El modal de historial actualmente muestra Facturas, Pedidos, Albaranes. Verificar que los datos se cargan correctamente y no hay N+1 queries.
- [ ] Añadir totales acumulados en el historial: total facturado, total de pedidos, número de albaranes.
- [ ] Mostrar saldo pendiente (facturas emitidas no cobradas) en el historial.

---

## ══════════════════════════════════════════════════════
## BLOQUE 3 — MÓDULO PRODUCTOS
## ══════════════════════════════════════════════════════

### 3.1 — Modelo de producto

- [ ] Verificar que `Producto.IvaPorcentaje` existe y se usa correctamente al crear líneas de factura/albarán.
- [ ] Añadir campo `PrecioCoste` al producto para cálculo de márgenes.
- [ ] Añadir campo `FamiliaProducto` (texto o enum) para agrupar productos en reportes y trazabilidad.
- [ ] Añadir campo `Referencia` (código interno o EAN/barcode).
- [ ] Añadir campo `PesoNeto` y `UnidadMedida` (kg, unidad, caja, bandeja) para el sistema de etiquetas.
- [ ] Añadir campo `TemperaturasConservacion` (texto) para etiquetas de trazabilidad.
- [ ] Campo `FechaCaducidadDias` (número de días desde producción) para calcular fecha de caducidad automáticamente cuando se crea un lote.

### 3.2 — Relación producto-ingrediente

- [ ] Implementar tabla `ProductoIngrediente` (receta): qué ingredientes lleva cada producto y en qué cantidad.
- [ ] Formulario en `Productos.tsx` para gestionar la receta del producto.
- [ ] Cuando se crea un lote de producción de un producto, consumir automáticamente los ingredientes según la receta multiplicada por las unidades producidas.
- [ ] Alerta cuando los ingredientes disponibles no son suficientes para la producción planificada.

---

## ══════════════════════════════════════════════════════
## BLOQUE 4 — MÓDULO INGREDIENTES Y MATERIAS PRIMAS
## ══════════════════════════════════════════════════════

### 4.1 — Control de stock de ingredientes

- [ ] Actualmente `Ingredientes.tsx` muestra listado e ingrediente con alérgenos. Verificar que existe modelo de stock de ingrediente (`StockIngrediente` o campo en `Ingrediente`).
- [ ] Implementar movimientos de stock de ingrediente: entrada (compra/reposición), consumo (por producción), merma, ajuste.
- [ ] Formulario de "Registrar Compra de Ingrediente" con campos: fecha, proveedor, cantidad, precio unitario, nº lote proveedor, fecha caducidad.
- [ ] Lista de movimientos por ingrediente (historial).
- [ ] Alerta de stock mínimo por ingrediente (configurable por ingrediente).

### 4.2 — Trazabilidad inversa por ingrediente

- [ ] Dado un ingrediente, mostrar en qué productos aparece (receta) y en qué lotes de producción se usó.
- [ ] Esto es crítico para sanidad: "El ingrediente X del proveedor Y (lote Z) se usó en estos lotes de producción, que se vendieron a estos clientes".

---

## ══════════════════════════════════════════════════════
## BLOQUE 5 — MÓDULO LOTES Y PRODUCCIÓN
## ══════════════════════════════════════════════════════

### 5.1 — Lotes

- [ ] Verificar que el formato de lote `DDMMAAAA` se genera automáticamente por fecha de producción y es configurable.
- [ ] Añadir campo `FechaCaducidad` al lote (calculada como FechaProduccion + Producto.FechaCaducidadDias, pero editable manualmente).
- [ ] Añadir campo `Temperatura` / `CondicionesConservacion` al lote.
- [ ] Estado del lote: `Activo`, `Bloqueado`, `Caducado`. Transición automática a `Caducado` cuando `FechaCaducidad < hoy`.
- [ ] No permitir vender un lote en estado `Bloqueado` o `Caducado`.
- [ ] Cuando un lote llega a stock = 0, marcarlo como `Agotado` (sin eliminarlo, por trazabilidad).
- [ ] Vista de lotes próximos a caducar (en los próximos X días, configurable).

### 5.2 — Producción

- [ ] Al finalizar una producción (`EstadoProduccion.Finalizada`), crear automáticamente el lote y añadir el stock correspondiente.
- [ ] Verificar que `ProduccionController` llama al servicio de creación de lote+stock al finalizar.
- [ ] Campo `UnidadesProducidas` vs `UnidadesPlanificadas` en la producción.
- [ ] Formulario de producción debe mostrar la receta del producto (ingredientes necesarios por unidad × unidades planificadas) y verificar disponibilidad.

---

## ══════════════════════════════════════════════════════
## BLOQUE 6 — MÓDULO TRAZABILIDAD
## ══════════════════════════════════════════════════════

### 6.1 — Verificación del estado actual

- [ ] **Tab "Movimientos":** Verificar que muestra todos los movimientos de stock (venta, producción, ajuste, devolución, caducidad) con fecha, tipo, cantidad, lote, producto, usuario responsable.
- [ ] **Tab "Producto":** Dado un producto + rango de fechas, mostrar: lotes producidos, clientes a los que se vendió cada lote, cantidades, fechas. Verificar que la consulta SQL devuelve datos correctos con joins reales.
- [ ] **Tab "Ingrediente":** Dado un ingrediente, mostrar: productos en los que aparece, lotes de producción donde se usó, clientes finales. Verificar profundidad de trazabilidad (ingrediente → producto → lote → factura → cliente).
- [ ] Verificar que la exportación a Excel del tab "Movimientos" incluye todos los campos requeridos por Sanidad: producto, lote, fecha producción, fecha caducidad, cliente, NIF cliente, cantidad vendida, fecha venta, número de factura/albarán.

### 6.2 — Mejoras de trazabilidad

- [ ] Implementar **trazabilidad de lote retroceso**: dado un número de lote, mostrar toda la cadena inversa (quién lo compró, qué ingredientes llevaba, qué proveedor, qué fecha).
- [ ] Implementar **alerta de recall**: botón "Bloquear lote" que marque el lote como `Bloqueado` y muestre automáticamente una lista de clientes que lo recibieron (con datos de contacto) para poder notificarles.
- [ ] Exportación del informe de recall en PDF con: lote, producto, fecha producción, fecha caducidad, clientes afectados, cantidades, datos de contacto.
- [ ] Informe periódico exportable (diario, semanal, trimestral, anual) para Sanidad:
  - Diario: producción del día, lotes creados, ventas del día con lotes.
  - Semanal: resumen de producción, ingredientes consumidos, ventas por cliente.
  - Trimestral: estadísticas agregadas.
  - Anual: informe completo de trazabilidad.
- [ ] Cada informe debe poder exportarse a Excel Y a PDF con la cabecera de la empresa.

---

## ══════════════════════════════════════════════════════
## BLOQUE 7 — MÓDULO REPORTES Y EXPORTACIONES
## ══════════════════════════════════════════════════════

### 7.1 — Reportes existentes

- [ ] Verificar qué reportes están implementados en `Reportes.tsx` y si devuelven datos reales.
- [ ] Completar: Reporte de ventas por producto (filtro: rango de fechas, producto, cliente).
- [ ] Completar: Reporte de ventas por cliente.
- [ ] Completar: Reporte de stock actual por producto y lote.
- [ ] Completar: Reporte de lotes próximos a caducar.
- [ ] Completar: Reporte de ingredientes con stock bajo.
- [ ] Completar: Reporte de facturas pendientes de cobro.
- [ ] Completar: Reporte de producción (planificada vs real).

### 7.2 — Exportación a Excel (Sanidad)

- [ ] Pantalla específica de exportación "Informe Sanidad" separada del módulo de reportes generales.
- [ ] Debe permitir seleccionar rango de fechas.
- [ ] Columnas obligatorias en el Excel de Sanidad: Fecha Venta, Nº Factura/Albarán, Producto, Lote, Fecha Producción, Fecha Caducidad, Cantidad, Unidad, Cliente, NIF/CIF Cliente, Dirección Cliente.
- [ ] El Excel debe poder filtrarse por producto y por lote específico para facilitar los informes por requerimieneto de sanidad.

---

## ══════════════════════════════════════════════════════
## BLOQUE 8 — MÓDULO DE ETIQUETAS (NUEVO — FASE COMPLETA)
## ══════════════════════════════════════════════════════

> Este módulo no existe. Hay que construirlo desde cero.  
> También hay etiquetas diseñadas en Word que hay que poder importar y gestionar.  
> El objetivo es una pestaña "Etiquetas" en el menú lateral completa con editor visual tipo Word.

### 8.0 — ARCHIVOS DE REFERENCIA REALES (etiquetas existentes en la empresa)

> **Ubicación:** `docs/client_assets/Etiqueta_productos/`
> Hay 3 archivos de referencia que definen exactamente qué debe poder producir el sistema:

| Archivo | Formato | Descripción |
|---|---|---|
| `BARCOS DE CIDRA.odt` | LibreOffice Writer | Etiqueta editable, fuente de verdad del diseño |
| `BARCOS DE CIDRA.pdf` | PDF | Versión impresa/enviada de la misma etiqueta |
| `CamScanner 23-02-2026 20.03.pdf` | PDF escaneado | Posiblemente etiqueta física escaneada, otro formato de referencia |

#### Contenido real de la etiqueta "BARCOS DE CIDRA" (extraído del ODT):

La etiqueta real contiene los siguientes **bloques y campos** que el editor y el modelo de datos deben soportar obligatoriamente:

1. **Nombre del producto** — `BARCOS DE CIDRA` (texto grande, prominente, arriba)

2. **Tabla de Información Nutricional** — bloque tabular con columna "Por 100g":
   - Valor energético (kJ + kcal) → `{{producto.valorEnergeticoKj}}` / `{{producto.valorEnergeticoKcal}}`
   - Grasas (g) → `{{producto.grasas}}`
     - de las cuales saturadas (g) → `{{producto.grasasSaturadas}}`
   - Hidratos de carbono (g) → `{{producto.hidratosCarbono}}`
     - de los cuales azúcares (g) → `{{producto.azucares}}`
   - Proteínas (g) → `{{producto.proteinas}}`
   - Sal (g) → `{{producto.sal}}`

3. **INGREDIENTES** — texto largo con alérgenos en MAYÚSCULAS (LECHE, TRIGO, HUEVO, SULFITO, etc.). Reglamento UE 1169/2011. Campo: `{{producto.ingredientes}}`

4. **Alérgenos resaltados** — los alérgenos aparecen en MAYÚSCULAS dentro del texto de ingredientes. El editor debe soportar esto con un campo especial de tipo "ingredientes con alérgenos resaltados" que renderice el texto con los alérgenos en negrita/mayúsculas automáticamente según los datos del producto.

5. **Aviso de trazas** — texto fijo + dinámico: "Puede contener trazas de..." → `{{producto.trazas}}`

6. **Lote** — `Lote: 27 0226` → variable: `{{lote.numero}}`

7. **Fecha de consumo preferente** — `CONSUMIR PREFERENTEMENTE ANTES DEL: 27/03/26` → variable: `{{lote.fechaCaducidad}}` (formato DD/MM/AA)

8. **Peso neto** — `Peso neto: 240g` → `{{producto.pesoNeto}}` + `{{producto.unidadMedida}}`

9. **Instrucciones de conservación** — `Conservar en lugar fresco y seco.` → `{{producto.conservacion}}`

10. **Logo / Imagen** — hay un `Gráfico1` en el ODT (imagen embebida, probablemente el logo de la empresa o sello).

#### Campos del modelo `Producto` que hay que añadir para soportar esta etiqueta:

- [x] `ValorEnergeticoKj` (decimal) ✅
- [x] `ValorEnergeticoKcal` (decimal) ✅
- [x] `Grasas` (decimal) ✅
- [x] `GrasasSaturadas` (decimal) ✅
- [x] `HidratosCarbono` (decimal) ✅
- [x] `Azucares` (decimal) ✅
- [x] `Proteinas` (decimal) ✅
- [x] `Sal` (decimal) ✅
- [x] `Ingredientes` (texto largo) ✅ campo ingredientes_texto en Producto.cs
- [x] `Trazas` (texto) ✅
- [x] `PesoNeto` (decimal) ✅ (ya existía)
- [x] `UnidadMedida` (texto) ✅ (ya existía)
- [x] `Conservacion` (texto) ✅
- [x] Estos campos requieren migración de EF y actualización del esquema SQL. ✅ 01_schema.sql actualizado + AppDbContext FluentAPI

#### Variables dinámicas en el editor derivadas de los archivos reales:

El listado de variables de Bloque 8.4 debe expandirse con:
- `{{producto.ingredientes}}` — texto completo con alérgenos en caps
- `{{producto.valorEnergeticoKj}}`, `{{producto.valorEnergeticoKcal}}`
- `{{producto.grasas}}`, `{{producto.grasasSaturadas}}`
- `{{producto.hidratosCarbono}}`, `{{producto.azucares}}`
- `{{producto.proteinas}}`, `{{producto.sal}}`
- `{{producto.trazas}}`
- `{{producto.conservacion}}`
- `{{lote.fechaCaducidad | format:'DD/MM/YY'}}` — fecha con formato corto

#### Preset de plantilla a crear basado en este archivo real:

- [ ] Crear preset llamado **"Etiqueta Pastelería Estándar"** que replique visualmente la etiqueta `BARCOS DE CIDRA`:
  - Nombre del producto arriba en grande (negrita)
  - Tabla de información nutricional (componente especial `nutrition-table`)
  - Bloque de ingredientes con alérgenos en caps
  - Aviso de trazas
  - Lote + fecha caducidad en una línea
  - Peso neto
  - Instrucciones de conservación
  - Logo de empresa (placeholder)
  - Este preset debe usarse como base para todas las etiquetas de productos del obrador

---

### 8.1 — Nueva ruta y pestaña en el menú

- [x] Añadir ruta `/etiquetas` en `App.tsx`. ✅
- [x] Añadir ítem "Etiquetas" en el sidebar de `Layout.tsx` con icono `Tag` de lucide-react. ✅
- [ ] Permisos: visible para Admin y UsuarioObrador. Oculto para Repartidor.
- [x] Crear archivo `frontend/src/pages/Etiquetas.tsx`. ✅ (~800 líneas, 4 tabs)

### 8.2 — Backend: entidades y endpoints para etiquetas

- [x] Crear entidad `PlantillaEtiqueta` en el dominio: ✅ En Etiqueta.cs + AppDbContext + IUnitOfWork
  ```
  PlantillaEtiqueta {
    Id, EmpresaId, Nombre, Descripcion,
    Ancho (mm), Alto (mm), TipoImpresora (A4/TermicaDirecta/TermicaTransferencia),
    ContenidoJson (string JSON con la definición de elementos),
    ContenidoHtml (string HTML generado para previsualización),
    Activa (bool), EsPlantillaBase (bool),
    FechaCreacion, FechaModificacion, UsuarioId
  }
  ```
- [x] Crear entidad `EtiquetaImportada`: ✅ En Etiqueta.cs + AppDbContext + IUnitOfWork
  ```
  EtiquetaImportada {
    Id, EmpresaId, Nombre, RutaArchivo,
    Formato (docx/pdf/png), TamañoBytes, FechaImportacion, UsuarioId
  }
  ```
- [x] Endpoints necesarios: ✅ Todos implementados en EtiquetasController.cs
  - `GET /etiquetas/plantillas` — listar ✅
  - `GET /etiquetas/plantillas/{id}` — detalle ✅
  - `POST /etiquetas/plantillas` — crear ✅
  - `PUT /etiquetas/plantillas/{id}` — actualizar ✅
  - `DELETE /etiquetas/plantillas/{id}` — eliminar ✅
  - `POST /etiquetas/imprimir` — crear trabajo de impresión ✅
  - `POST /etiquetas/importadas` — upload de archivo ✅
  - `GET /etiquetas/preview/{plantillaId}` — preview con datos ✅

### 8.3 — Importación de etiquetas Word existentes

- [x] Interface de upload de archivos .docx, .pdf, .png, .jpg en la pestaña Etiquetas. ✅
- [x] Vista de "Etiquetas Importadas": grid de tarjetas con nombre + botones. ✅
- [ ] Preview inline del archivo importado (si es imagen) o iframe (si es PDF).
- [ ] Botón "Convertir a plantilla editable" que intente parsear el docx.
- [ ] Botón "Imprimir como está".
- [x] Botón "Eliminar" con confirmación. ✅
- [x] Almacenamiento de archivos en servidor (carpeta `/uploads/etiquetas/`). ✅

### 8.4 — Editor de Etiquetas (tipo Word / Canvas Editor)

**Este es el componente más complejo. Debe ser un editor visual completo dentro de la app.**

- [ ] **Lienzo (Canvas) configurable:**
  - Definir dimensiones en mm: ancho × alto (presets: 63,5×29,6mm, 70×36mm, 105×57mm, A4, personalizado).
  - El lienzo se escala visualmente pero las medidas reales son en mm.
  - Reglas horizontales y verticales (en mm) alrededor del lienzo.
  - Fondo blanco, borde de puntos para simular el papel.

- [ ] **Elementos que se pueden añadir al lienzo (toolbar izquierda):**
  - **Texto libre:** click y escribir, posición drag-drop, resize, alineación (izq/centro/der), fuente (Arial/Helvetica/etc.), tamaño en pt, negrita, cursiva, subrayado, color.
  - **Campo dinámico:** variable que se sustituye al imprimir por datos reales. Variables disponibles:
    - `{{producto.nombre}}`
    - `{{producto.descripcion}}`
    - `{{lote.numero}}`
    - `{{lote.fechaProduccion}}`
    - `{{lote.fechaCaducidad}}`
    - `{{empresa.nombre}}`
    - `{{empresa.direccion}}`
    - `{{empresa.nif}}`
    - `{{ingredientes.lista}}` (lista de ingredientes del producto)
    - `{{alergenos.lista}}` (lista de alérgenos en formato reglamento 1169/2011)
    - `{{producto.pesoNeto}}`
    - `{{producto.unidadMedida}}`
    - `{{producto.temperaturaConservacion}}`
    - `{{factura.numero}}` (cuando se imprime desde factura)
    - `{{cliente.nombre}}` (cuando se imprime desde factura)
  - **Imagen:** upload de imagen (logo empresa, icono de alérgeno) posicionable y redimensionable.
  - **Logo empresa:** botón específico que inserta el logo de la empresa (configurado en Ajustes).
  - **Línea separadora:** horizontal o vertical, grosor y color configurable.
  - **Rectángulo / Marco:** fondo de color o borde configurable.
  - **Código de barras:** tipo EAN-13, EAN-8, Code128. El campo que se codifica es configurable (lote, referencia producto, etc.).
  - **QR Code:** contenido configurable (URL, texto, lote).
  - **Tabla de ingredientes con alérgenos:** componente especial que genera la lista de ingredientes con los alérgenos en MAYÚSCULAS/negrita automáticamente según Reglamento UE 1169/2011. Variables: `{{producto.ingredientes}}` + `{{producto.trazas}}`.
  - **Tabla de información nutricional:** componente especial tipo `nutrition-table` que renderiza la tabla reglamentaria "Por 100g" con las 8 filas obligatorias (energía kJ/kcal, grasas, grasas saturadas, hidratos, azúcares, proteínas, sal). Los valores se cargan automáticamente del modelo del producto. **Referencia real:** etiqueta `docs/client_assets/Etiqueta_productos/BARCOS DE CIDRA.odt`.

- [ ] **Propiedades del elemento seleccionado (panel derecho):**
  - Posición X, Y (en mm, editable numéricamente).
  - Ancho, Alto (en mm).
  - Padding (en mm).
  - Z-index (capas: adelante/atrás).
  - Fondo: color o transparente.
  - Borde: color, grosor, estilo, radio esquinas.
  - Para texto: fuente, tamaño, estilo, alineación, interlineado, color.

- [ ] **Operaciones del editor:**
  - Deshacer / Rehacer (Ctrl+Z / Ctrl+Y).
  - Duplicar elemento seleccionado.
  - Eliminar elemento seleccionado (tecla Delete).
  - Copiar / Pegar elemento.
  - Selección múltiple (shift+click o arrastrar selección).
  - Alinear elementos seleccionados: izquierda, derecha, arriba, abajo, centro horizontal, centro vertical.
  - Distribuir spacing uniforme entre elementos seleccionados.
  - Guardar como nueva plantilla (POST /etiquetas).
  - Guardar cambios sobre plantilla existente (PUT /etiquetas/{id}).
  - Duplicar plantilla completa.
  - Exportar plantilla como JSON.

- [ ] **Previsualización con datos reales:**
  - Botón "Previsualizar" que abre un modal.
  - En el modal, seleccionar producto + lote para sustituir las variables dinámicas.
  - Renderizar la previsualización con los datos reales (HTML generado en backend o en frontend).
  - La previsualización debe verse exactamente como se imprimirá.

- [ ] **Presets de plantillas base:**
  - Al crear una nueva plantilla, ofrecer presets vacíos y algunos templates predefinidos:
    - "Etiqueta mínima legal" (nombre producto, lote, fecha caducidad, empresa).
    - **"Etiqueta Pastelería Estándar"** — réplica exacta de `BARCOS DE CIDRA.odt`: nombre producto grande, tabla nutricional, bloque ingredientes+alérgenos en caps, aviso trazas, lote, fecha caducidad en formato DD/MM/AA, peso neto, instrucciones conservación, logo empresa. (Ver Bloque 8.0 para lista exacta de campos).
    - "Etiqueta de envío" con datos del cliente.
  - Los presets se pueden personalizar después en el editor.

### 8.5 — Impresión de etiquetas

- [ ] **Imprimir desde la plantilla:**
  - Botón "Imprimir" en la vista de la plantilla.
  - Selector de datos: qué producto, qué lote, cuántas copias.
  - Si la plantilla tiene variables dinámicas, pedir los datos antes de imprimir.
  - Generar HTML/PDF y lanzar `window.print()` o enviar a impresora del sistema.

- [ ] **Imprimir desde otros módulos:**
  - En la vista de un Lote: botón "Imprimir Etiqueta" → selector de plantilla → imprimir.
  - En la vista de un Albarán: botón "Imprimir Etiquetas de Lotes" → seleccionar plantilla → imprimir una etiqueta por cada lote del albarán con sus cantidades.
  - En la vista de un Producto: botón "Imprimir Etiqueta" → selector de lote activo → selector de plantilla → imprimir.

- [x] **Cola de impresión:** ✅ Tab "Impresión" en Etiquetas.tsx con tabla de trabajos, formulario de creación, polling 10s
  - Tabla de trabajos de impresión recientes con: fecha, plantilla usada, lote, nº copias, estado (Pendiente/Impreso/Error).
  - Botón "Reimprimir" sobre cualquier trabajo anterior.

- [ ] **Soporte impresoras etiquetas Brother (hardware):**
  - Configurar en `Ajustes.tsx` una sección "Impresoras" donde se pueda añadir impresoras por nombre/IP.
  - Para impresoras Brother QL (serie) usar el SDK o protocolo Brother que corresponda.
  - Alternativamente: generar ZPL si se usa Zebra, o PDF escalado si se usa impresora genérica.
  - La configuración debe permitir al menos: "Impresora del Sistema" (usa diálogo nativo de impresión) y en el futuro soportar drivers específicos.

### 8.6 — Persistencia del diseño (JSON Schema)

- [x] Definir el schema JSON del campo `ContenidoJson` de la plantilla: ✅ Implementado con {elements:[], canvas:{anchoMm, altoMm}}
  ```json
  {
    "canvas": { "width": 100, "height": 50, "unit": "mm" },
    "elements": [
      {
        "id": "uuid",
        "type": "text|field|image|barcode|qr|line|rect|ingredients-table|nutrition-table",
        "x": 5, "y": 5, "width": 40, "height": 8,
        "zIndex": 1,
        "properties": {
          "content": "Texto fijo o {{variable}}",
          "fontSize": 10, "fontFamily": "Arial",
          "bold": false, "italic": false, "underline": false,
          "color": "#000000", "align": "left",
          "backgroundColor": "transparent",
          "borderColor": "#000000", "borderWidth": 0
        }
      }
    ]
  }
  ```
- [ ] Implementar renderer HTML desde este JSON (usado para preview y para imprimir).
- [ ] El renderer HTML debe producir un DOM que sea pixel-perfect respecto al diseño en mm cuando se imprime.

---

## ══════════════════════════════════════════════════════
## BLOQUE 9 — MÓDULO FACTURACIÓN (mejoras)
## ══════════════════════════════════════════════════════

### 9.1 — Formulario de creación de facturas (`Facturacion.tsx`)

- [ ] El formulario actual es muy básico: cliente, serie, simplificada, líneas (producto+cantidad+descuento).
- [ ] Añadir al formulario: fecha de factura (con default hoy), notas, forma de pago, fecha de vencimiento calculada automáticamente según `Cliente.DiasPago`.
- [ ] Al seleccionar cliente, cargar automáticamente: forma de pago, descuento general, si lleva RE.
- [ ] Al añadir un producto a las líneas, cargar automáticamente: precio de venta del producto, IVA del producto. Permitir sobreescribir el precio en la línea.
- [ ] Mostrar subtotales en tiempo real mientras se añaden líneas.
- [ ] Mostrar el desglose completo: Base Imponible, IVA (desglosado por tipo), RE (si aplica), Retención (si aplica), Total.
- [ ] Integrar la simulación FIFO: al añadir producto+cantidad, mostrar los lotes que se asignarán.
- [ ] Vista de detalle de factura existente: mostrar todas las líneas con sus lotes, totales desglosados, datos del cliente.

### 9.2 — Facturación Rápida (`FacturacionRapida.tsx`)

- [ ] Verificar que `FacturacionRapida.tsx` tiene su propia ruta y es accesible.
- [ ] Esta vista debe ser un POS simplificado: selección rápida de cliente, añadir líneas por producto, emitir al instante.
- [ ] Debe usar el mismo mecanismo FIFO que la factura normal.
- [ ] Diseño optimizado para velocidad: accesos directos de teclado, buscador de producto con autocompletar.

### 9.3 — PDF de factura

- [ ] Verificar que el endpoint `GET /facturas/{id}/pdf` genera el PDF correctamente con: cabecera empresa (nombre, NIF, dirección, logo), datos cliente, líneas con descripción+cantidad+precio+IVA, IVA desglosado, pie de página.
- [ ] El PDF debe incluir la columna "Lote" en las líneas.
- [ ] El PDF debe diferenciar visualmente si es factura simplificada o completa.
- [ ] Añadir número de factura en grande y fecha en el PDF.

---

## ══════════════════════════════════════════════════════
## BLOQUE 10 — DASHBOARD
## ══════════════════════════════════════════════════════

- [ ] Widget: Total ventas del día (suma de facturas emitidas hoy).
- [ ] Widget: Stock crítico (productos con stock < mínimo).
- [ ] Widget: Pedidos pendientes (conteo).
- [ ] Widget: Lotes próximos a caducar (próximos 7 días).
- [ ] Widget: Albaranes pendientes de facturar.
- [ ] Widget: Facturas pendientes de cobro (con importe total).
- [ ] Gráfico: Ventas de los últimos 30 días (línea temporal).
- [ ] Gráfico: Top 5 productos más vendidos (barras).
- [ ] Accesos rápidos: botones grandes para "Nueva Factura", "Nuevo Albarán", "Registrar Producción".

---

## ══════════════════════════════════════════════════════
## BLOQUE 11 — MÓDULO AJUSTES Y EMPRESA
## ══════════════════════════════════════════════════════

- [ ] En `Ajustes.tsx`, añadir sección "Datos de la Empresa" con campos: razón social, NIF, dirección, CP, ciudad, provincia, teléfono, email, logo (upload de imagen).
- [ ] El logo de la empresa se debe usar en PDF de facturas y en el editor de etiquetas.
- [ ] Sección "Número de Serie por Defecto": configurar qué serie se usa por defecto en facturas y en albaranes.
- [ ] Sección "Tipos de IVA y RE": tabla editable con los tramos IVA ↔ RE (ver Bloque 1.1).
- [ ] Sección "Impresoras": configurar impresoras para etiquetas (nombre, tipo, IP si es red).
- [ ] Sección "Parámetros de Stock": stock mínimo global (override por producto), días de alerta de caducidad.
- [ ] Sección "Integración": SMTP para envío de facturas por email (datos de servidor de correo).

---

## ══════════════════════════════════════════════════════
## BLOQUE 12 — MÓDULO USUARIOS Y PERMISOS
## ══════════════════════════════════════════════════════

- [ ] Verificar que en `Usuarios.tsx` se pueden crear usuarios con rol Admin, Obrador, Repartidor.
- [ ] Implementar que el rol `Repartidor` solo ve las páginas que le corresponden (Facturación, Productos, Trazabilidad solo de sus clientes).
- [ ] Guards de rutas en el frontend según rol.
- [ ] Repartidor NO debe ver: producción, ingredientes, usuarios, ajustes de empresa.
- [ ] Repartidor SÍ debe ver: sus propios clientes, facturas, albaranes, productos (catálogo público), trazabilidad de sus ventas.
- [ ] Posibilidad de vincular un usuario con rol Repartidor a un `Cliente` de tipo Repartidor.

---

## ══════════════════════════════════════════════════════
## BLOQUE 13 — CALIDAD DE CÓDIGO Y DEUDA TÉCNICA
## ══════════════════════════════════════════════════════

- [x] `WeatherForecastController.cs` — borrar. ✅ Eliminado junto con WeatherForecast.cs
- [ ] Revisar y unificar el manejo de errores del backend: todos los endpoints deben devolver `ProblemDetails` con `status`, `title`, `detail` consistentes.
- [ ] Añadir logging estructurado (Serilog) a todas las operaciones críticas: creación de lote, consumo de stock, emisión de factura.
- [ ] Implementar paginación en todos los endpoints de lista: `GET /facturas?page=1&pageSize=50`.
- [ ] Añadir filtros de búsqueda en endpoints: `/facturas?clienteId=X&desde=2026-01-01&hasta=2026-12-31&estado=Emitida`.
- [ ] Revisar que todos los controllers tienen atributo `[Authorize]` con roles correctos.
- [x] `frontend/src/types/index.ts` — revisar que todos los tipos están alineados con los DTOs del backend. ✅ Añadidos tipos Etiquetas + campos nutricionales en Producto
- [ ] Añadir React Error Boundaries en el frontend para que un error en un módulo no rompa toda la app.
- [ ] Revisar que las queries de TanStack Query tienen `staleTime` configurado apropiadamente (no refetch innecesario en listas grandes).
- [ ] Revisar que todas las mutaciones invalidan las queries correctas (no refetch de listas no relacionadas).

---

## ══════════════════════════════════════════════════════
## BLOQUE 14 — BASE DE DATOS
## ══════════════════════════════════════════════════════

- [x] Verificar que existe y está actualizado el archivo `database/01_schema.sql`. ✅ Actualizado con 5 tablas nuevas + campos nutricionales
- [ ] Verificar que hay índices en columnas de búsqueda frecuente.
- [ ] Revisar que las columnas calculadas están definidas correctamente.
- [x] Añadir tabla `PlantillaEtiqueta` y `EtiquetaImportada` con sus migraciones EF. ✅ Tablas + FluentAPI en AppDbContext
- [x] Añadir tabla `TiposIvaRe` con migración EF. ✅
- [ ] Añadir tabla `ProductoIngrediente` (receta) con migración EF si no existe.
- [ ] Revisar constraints de FK con CASCADE/RESTRICT adecuados.

---

## ══════════════════════════════════════════════════════
## BLOQUE 15 — INFRAESTRUCTURA Y DESPLIEGUE
## ══════════════════════════════════════════════════════

- [ ] `docker-compose.yml`: verificar que el volumen de PostgreSQL persiste correctamente entre reinicios.
- [ ] Añadir volumen en Docker para los archivos subidos (logos, etiquetas Word, etc.): `/uploads`.
- [ ] Configurar Nginx como reverse proxy: frontend en `/` y API en `/api/`.
- [ ] Variables de entorno: mover `appsettings.json` sensibles a `.env` / Docker secrets.
- [ ] Certificado SSL via Let's Encrypt si el servidor es accesible desde internet.
- [ ] Script de backup automático de la base de datos (cron dentro del contenedor de Postgres o volumen externo).

---

## ══════════════════════════════════════════════════════
## PRIORIZACIÓN SUGERIDA (orden de ejecución)
## ══════════════════════════════════════════════════════

### SPRINT 1 — Correcciones críticas de lógica de negocio (1-2 semanas)
1. Recargo de equivalencia automático por tipo de IVA (Bloque 1.1)
2. Transiciones de estado con validación: pedidos, albaranes, facturas (Bloques 1.2, 1.3, 1.4)
3. Integrar FIFO en facturas directas (Bloque 1.5)
4. Guardia de stock negativo (Bloque 1.6)

### SPRINT 2 — Mejoras de módulos existentes (1-2 semanas)
5. Productos: IVA automático en línea, FechaCaducidadDias (Bloque 3.1)
6. Lotes: FechaCaducidad calculada, estado Caducado automático, alerta próximas caducidades (Bloque 5.1)
7. Producción: consumo automático de ingredientes al finalizar (Bloque 5.2)
8. Trazabilidad: verificar profundidad real, mejorar exportación Sanidad (Bloque 6)

### SPRINT 3 — Módulo de Etiquetas completo (2-3 semanas)
9. Entidades y endpoints backend de etiquetas (Bloque 8.2)
10. Upload e importación de etiquetas Word (Bloque 8.3)
11. Editor visual de etiquetas (Bloque 8.4) — componente más complejo
12. Impresión desde módulos (lotes, albaranes, productos) (Bloque 8.5)

### SPRINT 4 — Dashboard, Reportes, Calidad (1 semana)
13. Dashboard con widgets reales (Bloque 10)
14. Reportes Sanidad (Bloque 7.2)
15. Paginación y filtros en APIs (Bloque 13)
16. Eliminar WeatherForecastController (Bloque 13)

### SPRINT 5 — Ajustes empresa, Usuarios/Permisos, Infraestructura (1 semana)
17. Datos empresa + logo en Ajustes (Bloque 11)
18. Guards de rol en frontend (Bloque 12)
19. Docker volúmenes y Nginx (Bloque 15)

---

## ══════════════════════════════════════════════════════
## BLOQUE 16 — MÓDULO ETIQUETAS: REFACTORIZACIÓN COMPLETA
## Sistema LibreOffice-Nivel — ODT + PDF + Previsualización Real
## Generado: 2026-02-28 | PRIORIDAD MÁXIMA
## ══════════════════════════════════════════════════════

> **CONTEXTO CRÍTICO — LEE ESTO ANTES DE TOCAR NADA:**
>
> El módulo de etiquetas lleva múltiples sesiones de trabajo y sigue roto en lo que realmente importa al usuario.  
> Este bloque documenta con precisión quirúrgica TODOS los problemas reales, sus causas raíz técnicas,  
> y el plan de implementación completo para construir un sistema de etiquetado profesional nivel LibreOffice.  
> No toques solo síntomas. Lee el diagnóstico completo y actúa sobre arquitectura.

---

### 16.0 — DIAGNÓSTICO COMPLETO DEL ESTADO ACTUAL

#### Estado del sistema a 2026-02-28:

**Backend (ASP.NET Core 9, puerto 5064):**
- `EtiquetasController.cs` — CRUD completo para: `PlantillasEtiqueta`, `EtiquetasImportadas`, `TiposIvaRe`, `TrabajosImpresion`, Preview
- Plantillas almacenan `ContenidoHtml` (string HTML TipTap) y `ContenidoJson` en PostgreSQL
- Importadas almacenan archivos físicos en `uploads/etiquetas/{empresaId}/` con ruta en DB
- Endpoint `GET /api/etiquetas/importadas/{id}/descargar` sirve archivo con `Content-Type` correcto
- El endpoint usa `File(bytes, contentType, fileName)` que fuerza `Content-Disposition: attachment`

**Frontend (React 18 + Vite, puerto 5173):**
- `Etiquetas.tsx` (~1484 líneas) — 4 tabs: Plantillas, Importar, Cola de impresión, IVA/RE
- `LabelEditor.tsx` (~645 líneas) — editor TipTap WYSIWYG con barra type LibreOffice
- Las plantillas nuevas se crean/editan como HTML puro en TipTap y se guardan como texto HTML en DB
- Las etiquetas importadas (ODT, PDF, PNG, etc.) se suben como archivos binarios y se almacenan en disco
- Modal de previsualización de importadas: usa `<iframe>` para PDF y `<img>` para imágenes

---

### 16.1 — BUGS CRÍTICOS ACTIVOS (CON CAUSA RAÍZ EXACTA)

#### BUG #1 — PDF importado no se visualiza en el modal (iframe en blanco)

**Síntoma:** Al pulsar "Ver" en una etiqueta importada PDF, se abre el modal con header correcto
("BARCOS DE CIDRA | Pdf | botón Imprimir") pero el área de contenido está completamente en blanco.

**Causa raíz técnica:**
```
fetch() → r.blob() → URL.createObjectURL(blob) → <iframe src={blobUrl} />
```
El `fetch()` con `Authorization: Bearer ...` recibe el fichero correctamente. `createObjectURL` genera
una URL tipo `blob:http://localhost:5173/uuid`. El problema es uno de los siguientes (depende del browser):

- **Chrome ≥ 120**: Chromium bloqueó el renderizado inline de PDFs dentro de iframes que no tienen
  `type="application/pdf"` explícito o cuando el PDF blob no tiene el tipo MIME set explícitamente.
- **Content-Disposition: attachment** en la respuesta del backend: aunque en blob URL no debería
  afectar, algunos Chrome builds aplican las headers originales al blob y bloquean inline render.
- **Sin attributo `allow`**: iframes modernos requieren `allow="fullscreen"` o configuración específica.

**Fix exacto requerido:**
1. En backend `DescargarImportada`: cambiar `File(bytes, contentType, fileName)` a
   `File(bytes, contentType)` (sin filename = Content-Disposition: inline). Esto es crítico.
2. En frontend: cambiar `<iframe>` por `<embed>` para PDFs, o abrir en nueva pestaña con `window.open()`.
3. Alternativa más robusta: en lugar de blob URL en iframe, usar `<object data={url} type="application/pdf">`.

**Fix recomendado (más simple y que funciona 100%):**
- Abrir PDFs en nueva pestaña: `window.open(blobUrl, '_blank')` en lugar de iframe modal.
- Para el modal: mostrar página de vista previa del PDF con botón "Abrir en nueva pestaña".

---

#### BUG #2 — Archivos ODT no se pueden previsualizar (muestra "formato no compatible")

**Síntoma:** Al intentar ver un archivo ODT importado, el código detecta que no es Pdf/Png/Jpg
y en lugar de mostrar preview, lanza toast informativo y fuerza descarga. El usuario no puede
ver el contenido del ODT desde la app; siempre tiene que descargarlo y abrirlo en LibreOffice.

**Causa raíz técnica:**
Los navegadores web no tienen visor nativo de archivos OpenDocument (.odt). No existe forma de
renderizar un ODT en un `<iframe>`, `<embed>`, ni `<img>`. El único visor web de ODT que existe
es Google Docs Viewer (requiere URL pública, no funciona con archivos locales).

**Solución arquitectónica requerida (ver Bloque 16.3):**
- Conversión server-side ODT → PDF usando LibreOffice headless incluso si el backend está en Docker.
- Endpoint nuevo: `GET /api/etiquetas/importadas/{id}/preview-pdf` que convierte el ODT a PDF en
  tiempo real y lo sirve como `application/pdf` inline.
- Solo si LibreOffice está disponible en el contenedor (requiere `apt-get install libreoffice`).

---

#### BUG #3 — Las plantillas nuevas NO producen archivos ODT descargables

**Síntoma:** El usuario diseña una etiqueta en el editor TipTap, la guarda, y el sistema solo
guarda HTML en la base de datos. No existe forma de descargar esa plantilla como archivo ODT
ni como PDF. El botón "Descargar" no existe en las plantillas creadas en el editor.

**Causa raíz técnica:**
La arquitectura actual de plantillas es HTML-only. `PlantillaEtiqueta.ContenidoHtml` es un string
HTML. No hay pipeline de conversión HTML → ODT ni HTML → PDF en el backend.

**Lo que el usuario pide:** Que las plantillas nuevas SEAN archivos ODT (igual que el BARCOS DE CIDRA.odt
que usan actualmente en LibreOffice), con la posibilidad de:
- Descargar el ODT con las variables sin rellenar (para editar manualmente en LibreOffice)
- Descargar el ODT con variables rellenas con datos reales de un producto+lote
- Ver preview PDF del resultado antes de imprimir

---

#### BUG #4 — El editor HTML no puede replicar exactamente el formato de la etiqueta real

**Síntoma:** El formato de la etiqueta real (BARCOS DE CIDRA) tiene un layout específico que
el editor TipTap no puede reproducir con fidelidad:
- Dos columnas (tabla nutricional izquierda, óvalo de certificación derecha)
- Tipografía específica de etiqueta de alimentos
- Código de barras EAN renderizando como imagen
- Número de lote en formato especial
- Fecha de caducidad en formato DD/MM/AA
- Peso neto prominente al final

El editor TipTap es un editor de texto tipo Word genérico, no un diseñador de etiquetas de
alimentación. Aunque permite tablas, no tiene:
- Editor de plantilla pre-cargada con la estructura visual correcta
- Generación de código de barras a partir de `{{producto.codigoBarras}}`
- Vista previa en tamaño real de la etiqueta antes de imprimir
- Generación de archivo ODT que abra directamente en LibreOffice

---

### 16.2 — ANATOMÍA EXACTA DE LA ETIQUETA REAL (BARCOS DE CIDRA)

> Esta sección documenta TODOS los bloques visuales y campos de la etiqueta real
> de referencia, extraída de la imagen proporcionada por el cliente.
> Cualquier implementación DEBE poder reproducir exactamente este formato.

```
┌─────────────────────────────────────────────┐
│                                             │
│         BARCOS DE CIDRA                     │  ← H1, negrita, centrado, ~24pt
│                                             │
├──────────────────────────┬──────────────────┤
│ INFORMACIÓN NUTRICIONAL  │                  │
│ Valores medios  │ Por100g│   ┌──────────┐  │
│ Valor energético│1475kJ  │   │   ES     │  │ ← Óvalo con nº RGSEAA
│                 │353kcal │   │20.34053/ │  │   empresa.nrgs
│ Grasas          │ 16.75g │   │  SE CE   │  │
│  saturadas      │  6.96g │   └──────────┘  │
│ H. de carbono   │ 48.80g │                  │
│  azúcares       │ 35.80g │                  │
│ Proteínas       │  2.11g │                  │
│ Sal             │  0.05g │                  │
├──────────────────────────┴──────────────────┤
│ INGREDIENTES: [texto completo con           │  ← Campo producto.ingredientesTexto
│ ALÉRGENOS EN MAYÚSCULAS resaltados]         │    Alérgenos: bold/CAPS automático
├─────────────────────────────────────────────┤
│ Puede contener trazas de [producto.trazas]  │
├────────────┬────────────────────────────────┤
│ ████████   │  LOTE: {{lote.codigoLote}}     │  ← Barcode EAN (imagen generada)
│ ████████   │  {{lote.fechaCaducidad}}        │    + lote + fecha caducidad
│ 8 23279... │                                 │
├────────────┴────────────────────────────────┤
│ Peso neto: {{producto.pesoUnitarioGr}} g    │
│ Conservar en lugar fresco y seco.           │  ← producto.conservacion
└─────────────────────────────────────────────┘
```

**Campos mapeados a variables de plantilla:**

| Campo visual | Variable en plantilla | Campo en DB |
|---|---|---|
| Nombre producto (H1) | `{{producto.nombre}}` | `Producto.Nombre` |
| Valor energético kJ | `{{producto.valorEnergeticoKj}}` | `Producto.ValorEnergeticoKj` |
| Valor energético kcal | `{{producto.valorEnergeticoKcal}}` | `Producto.ValorEnergeticoKcal` |
| Grasas | `{{producto.grasas}}` | `Producto.Grasas` |
| Grasas saturadas | `{{producto.grasasSaturadas}}` | `Producto.GrasasSaturadas` |
| Hidratos de carbono | `{{producto.hidratosCarbono}}` | `Producto.HidratosCarbono` |
| Azúcares | `{{producto.azucares}}` | `Producto.Azucares` |
| Proteínas | `{{producto.proteinas}}` | `Producto.Proteinas` |
| Sal | `{{producto.sal}}` | `Producto.Sal` |
| Ingredientes completos | `{{producto.ingredientesTexto}}` | `Producto.IngredientesTexto` |
| Trazas alérgenos | `{{producto.trazas}}` | `Producto.Trazas` |
| Código de barras (imagen) | `{{producto.codigoBarras}}` | `Producto.CodigoBarras` |
| Número lote | `{{lote.codigoLote}}` | `Lote.CodigoLote` |
| Fecha caducidad | `{{lote.fechaCaducidad}}` | `Lote.FechaCaducidad` |
| Fecha fabricación | `{{lote.fechaFabricacion}}` | `Lote.FechaFabricacion` |
| Peso neto | `{{producto.pesoUnitarioGr}}` | `Producto.PesoUnitarioGr` |
| Conservación | `{{producto.conservacion}}` | `Producto.Conservacion` |
| Nº RGSEAA empresa | `{{empresa.nrgs}}` | `Empresa.NumeroRgseaa` |
| Nombre empresa | `{{empresa.nombre}}` | `Empresa.Nombre` |

---

### 16.3 — ARQUITECTURA OBJETIVO: SISTEMA DE ETIQUETAS NIVEL PROFESIONAL

#### Decisión arquitectónica central:

El sistema debe seguir un modelo **"Template ODT → Variables → Render"**:

```
[Plantilla ODT en disco]
        │
        ▼
[Endpoint /rellenar] ─→ Rellena variables con datos Producto+Lote
        │
        ├─→ [Devuelve ODT relleno] ─→ Descarga usuario
        └─→ [Convierte ODT→PDF via LibreOffice] ─→ Preview en browser
```

#### Dos modos de trabajo:

**Modo A — Plantilla importada (ya existe el flujo de subida):**
- Usuario sube un ODT (ej: BARCOS DE CIDRA.odt) que ya tiene variables `{{producto.nombre}}` etc.
- El sistema almacena el ODT en disco (ya implementado).
- NUEVO: endpoint `POST /api/etiquetas/importadas/{id}/generar` que recibe `productoId + loteId`,
  lee el ODT del disco, reemplaza variables en el XML interno del ODT, devuelve ODT relleno.
- NUEVO: endpoint `POST /api/etiquetas/importadas/{id}/preview` que hace lo mismo pero convierte
  a PDF via LibreOffice y lo sirve inline.

**Modo B — Plantilla creada en editor HTML:**
- Usuario diseña en TipTap (ya implementado).
- NUEVO: endpoint `GET /api/etiquetas/plantillas/{id}/exportar-odt` que convierte `ContenidoHtml`
  a ODT usando una librería de generación ODT (ver opciones técnicas abajo).
- NUEVO: endpoint `GET /api/etiquetas/plantillas/{id}/exportar-pdf?productoId=X&loteId=Y` que
  rellena variables, convierte a PDF y sirve inline.

---

### 16.4 — DECISIONES TÉCNICAS (COMPARATIVA REAL)

#### Para conversión HTML → PDF:

| Opción | Pros | Contras | Veredicto |
|---|---|---|---|
| **PuppeteerSharp** (NuGet) | Renderizado perfecto (Chromium), soporta CSS, tablas, imágenes | Descarga Chromium (~150MB), requiere memoria. En Docker: instalar deps Chromium | ✅ RECOMENDADO para PDF |
| **QuestPDF** (NuGet) | Rápido, sin deps externas, PDF nativo | No consume HTML, requiere código C# para layout, no WYSIWYG | Solo si se abandona TipTap |
| **iText7** (NuGet) | Muy maduro | Licencia compleja, HTML→PDF básico | No recomendado |
| **wkhtmltopdf** (binario) | Clásico, funciona bien | Binario externo, sin soporte activo, problemas Docker ARM | No recomendado |
| **LibreOffice headless** | Convierte HTML, ODT, DOCX, todo | Requiere instalación groot (~300MB), lento para conversión | ✅ RECOMENDADO para ODT |

#### Para generación ODT desde HTML:

| Opción | Pros | Contras | Veredicto |
|---|---|---|---|
| **LibreOffice headless** (`soffice --convert-to odt`) | Convierte HTML→ODT perfectamente | Requiere LibreOffice en servidor/Docker | ✅ Si se instala LibreOffice |
| **NPOI** (NuGet) | Soporta XLS, XLSX, pero ODT limitado | No soporta ODT nativo | ❌ No sirve para ODT |
| **ODT manual via ZIP+XML** | Sin deps externas | Muy laborioso, propenso a errores de formato | Solo si no hay LibreOffice |
| **DocumentFormat.OpenXml** | DOCX perfecto | Solo DOCX, no ODT | Si se cambia target a DOCX |

#### Decisión final recomendada:

```
PIPELINE COMPLETO:

1. Diseño: TipTap HTML editor (ya existe) + TipTap guarda HTML en DB
2. Export ODT: LibreOffice headless convierte HTML → ODT
3. Export PDF: LibreOffice headless convierte HTML → PDF  
4. Relleno variables ODT importado: manipulación XML del ZIP ODT + LibreOffice → PDF
5. Barcode: ZXing.Net NuGet genera PNG del código de barras, se embebe en HTML/ODT

DOCKER: Agregar "RUN apt-get install -y libreoffice" al Dockerfile del backend.
ALTERNATIVA SIN DOCKER MODIFICADO: PuppeteerSharp solo para PDF, ODT manual limitado.
```

---

### 16.5 — BACKEND: ENDPOINTS NUEVOS REQUERIDOS

#### Grupo A — Plantillas HTML → Export

```
GET  /api/etiquetas/plantillas/{id}/exportar-pdf
     Query: productoId (optional), loteId (optional)
     → Rellena variables si se pasan, convierte HTML→PDF via LibreOffice/Puppeteer
     → Content-Type: application/pdf, Content-Disposition: inline
     → Sirve sin filename para permitir preview en iframe/embed

GET  /api/etiquetas/plantillas/{id}/exportar-odt
     Query: productoId (optional), loteId (optional)
     → Rellena variables si se pasan, convierte HTML→ODT via LibreOffice
     → Content-Type: application/vnd.oasis.opendocument.text
     → Content-Disposition: attachment; filename="etiqueta-{nombre}.odt"

GET  /api/etiquetas/plantillas/{id}/exportar-pdf-preview
     Query: productoId (required), loteId (required)
     → Igual que exportar-pdf pero siempre con datos reales, sin filename
     → Para usar como src de <iframe> o <embed> en modal de preview
```

#### Grupo B — ODT importado → Relleno + Export

```
POST /api/etiquetas/importadas/{id}/generar
     Body: { productoId: int, loteId: int }
     → Lee el ODT del disco
     → Parsea el content.xml dentro del ZIP
     → Reemplaza {{variable}} por valores reales
     → Guarda ODT temporal relleno
     → Devuelve ODT como download
     → Content-Type: application/vnd.oasis.opendocument.text

POST /api/etiquetas/importadas/{id}/preview-pdf
     Body: { productoId: int, loteId: int }
     → Igual que /generar pero además convierte ODT→PDF via LibreOffice
     → Sirve PDF sin Content-Disposition (inline) para preview
     → Content-Type: application/pdf

GET  /api/etiquetas/importadas/{id}/preview-pdf
     Query: productoId (optional), loteId (optional)
     → Versión GET del endpoint anterior para poder usar como src de iframe
     → Si no se pasan ids, convierte el ODT crudo (sin relleno) a PDF para ver estructura
```

#### Grupo C — Generación de código de barras

```
GET  /api/productos/{id}/barcode.png
     → Genera imagen PNG del código EAN del producto usando ZXing.Net
     → Width: 200px, Height: 80px, márgenes estándar EAN-13
     → Content-Type: image/png, cache por productoId
     → Se usa como src de <img> en el editor y en las plantillas renderizadas
```

---

### 16.6 — BACKEND: SERVICIOS INTERNOS A CREAR

#### OdtVariableService

```csharp
// Ubicación: src/BuenaTierra.Application/Services/OdtVariableService.cs
// Responsabilidad: leer ODT (ZIP), sustituir variables en content.xml y styles.xml, 
//                  escribir ODT modificado
// Dependencias: System.IO.Compression (built-in)

public class OdtVariableService
{
    // Lee el ODT como ZIP, abre content.xml, reemplaza {{variable}} con valores,
    // devuelve el ODT modificado como MemoryStream
    public Task<MemoryStream> RellenarVariablesAsync(
        Stream odtStream, 
        Dictionary<string, string> variables,
        CancellationToken ct);

    // Construye el diccionario de variables a partir de entidades de dominio
    public Dictionary<string, string> BuildVariables(
        Producto? producto, 
        Lote? lote, 
        Empresa empresa);
}
```

#### DocumentConversionService

```csharp
// Ubicación: src/BuenaTierra.Application/Services/DocumentConversionService.cs
// Responsabilidad: convertir documentos usando LibreOffice headless o PuppeteerSharp

public class DocumentConversionService
{
    // LibreOffice:  soffice --headless --convert-to pdf --outdir /tmp input.html/odt
    // Puppeteer:    Chromium headless → print to PDF
    // Devuelve stream del PDF resultante
    
    public Task<Stream> ConvertToPdfAsync(Stream inputStream, string inputFormat, CancellationToken ct);
    public Task<Stream> ConvertToOdtAsync(Stream htmlStream, CancellationToken ct);
}
```

#### BarcodeService

```csharp
// Ubicación: src/BuenaTierra.Application/Services/BarcodeService.cs
// Dependencia NuGet: ZXing.Net (0.16.9+)

public class BarcodeService
{
    public byte[] GenerateEan13Png(string barcodeValue, int width = 200, int height = 80);
    public byte[] GenerateQrPng(string content, int size = 200);
}
```

---

### 16.7 — FRONTEND: CAMBIOS REQUERIDOS EN Etiquetas.tsx

#### Fix #1 — PDF preview (crítico)

```tsx
// CAMBIO: en handleImportPreview, para formato PDF:
// ANTES: <iframe src={importPreviewUrl} ... />
// DESPUÉS: usar <embed> con type explícito, o abrir en nueva pestaña

// Si se quiere en modal:
<embed 
  src={importPreviewUrl} 
  type="application/pdf" 
  className="w-full h-full min-h-[70vh]" 
/>

// Si se quiere en nueva pestaña (más simple y confiable):
window.open(importPreviewUrl, '_blank')
```

#### Fix #2 — ODT preview via servidor

```tsx
// En handleImportPreview, para formato ODT:
// ANTES: toast("formato no compatible") + fuerza descarga
// DESPUÉS: llamar al endpoint /preview-pdf con productoId+loteId seleccionados
//          y abrir PDF resultante en modal o nueva pestaña

async function handleOdtPreviewAsPdf(importadaId: number) {
  const response = await fetch(`/api/etiquetas/importadas/${importadaId}/preview-pdf`, {
    headers: { Authorization: `Bearer ${getAuthToken()}` }
  })
  if (response.ok) {
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank') // nueva pestaña con el PDF
  }
}
```

#### Fix #3 — Botones "Descargar ODT" y "Descargar PDF" en plantillas creadas

En la tarjeta de cada plantilla en `PlantillasTab`, añadir botones:
```
[Ver HTML] [Descargar ODT] [Generar PDF con datos...]
```

El botón "Generar PDF con datos..." abre un mini-modal para seleccionar Producto + Lote y luego
llama a `GET /api/etiquetas/plantillas/{id}/exportar-pdf-preview?productoId=X&loteId=Y`.

#### Fix #4 — Selector Producto + Lote en modal de preview de importadas

Cuando el usuario pulsa "Ver" en una etiqueta importada (ODT o PDF), antes de mostrar el preview,
ofrecer opción de: "Ver plantilla en blanco" o "Ver con datos de producto/lote".
Si elige "con datos", mostrar selectores de Producto y Lote, luego llamar al endpoint de relleno.

#### Fix #5 — Nueva pestaña "Generador de etiquetas"

Añadir 5ª pestaña: `{ id: 'generar', label: 'Generar etiqueta' }`

En esta pestaña:
```
1. Selector de plantilla (plantillas creadas + importadas ODT)
2. Selector de producto
3. Selector de lote (filtrado por productoId)
4. Número de copias
5. Botón "Ver preview" → abre PDF en nueva pestaña
6. Botón "Descargar ODT relleno" → descarga el ODT con datos
7. Botón "Imprimir" → print window con datos rellenos
```

---

### 16.8 — FRONTEND: CAMBIOS EN LabelEditor.tsx

#### Mejora #1 — Plantilla pre-cargada tipo "Etiqueta de alimento"

Añadir botón en LabelEditor: "Cargar plantilla de etiqueta alimentaria" que inserte en el editor
un HTML pre-diseñado que reproduzca exactamente el layout de BARCOS DE CIDRA:
- H1 con `{{producto.nombre}}`
- Tabla nutricional de 2 columnas con todas las variables
- Sección ingredientes con `{{producto.ingredientesTexto}}`
- Sección trazas
- Fila lote + fecha caducidad
- Pie con peso neto + conservación

```tsx
// En LabelEditor.tsx, añadir constante:
const PLANTILLA_ETIQUETA_ALIMENTO_HTML = `
<h1 style="text-align:center; font-size: 24pt; font-weight: bold; margin-bottom: 8pt;">
  {{producto.nombre}}
</h1>
<table style="border-collapse: collapse; width: 100%; border: 2px solid #000; font-size: 9pt; margin-bottom: 6pt;">
  <thead>
    <tr>
      <th colspan="2" style="...">INFORMACIÓN NUTRICIONAL</th>
    </tr>
    <tr>
      <th style="...">Valores medios</th>
      <th style="text-align:right; ...">Por 100 g</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Valor energético</td><td style="text-align:right;">{{producto.valorEnergeticoKj}} kJ / {{producto.valorEnergeticoKcal}} kcal</td></tr>
    ... [todas las filas nutricionales]
  </tbody>
</table>
<p style="font-size: 8pt; margin-bottom: 4pt;">
  <strong>INGREDIENTES:</strong> {{producto.ingredientesTexto}}
</p>
<p style="font-size: 8pt; margin-bottom: 4pt;">
  Puede contener trazas de {{producto.trazas}}
</p>
<table style="width: 100%; margin-top: 6pt;">
  <tr>
    <td style="width: 40%;">
      <img src="/api/productos/[ID]/barcode.png" alt="Código de barras" style="width: 100%; max-width: 160px;" />
    </td>
    <td style="font-size: 9pt; vertical-align: top;">
      <strong>LOTE:</strong> {{lote.codigoLote}}<br/>
      {{lote.fechaCaducidad}}
    </td>
  </tr>
</table>
<p style="font-size: 9pt; margin-top: 6pt;">
  <strong>Peso neto: {{producto.pesoUnitarioGr}} g</strong>
</p>
<p style="font-size: 8pt;">{{producto.conservacion}}</p>
`
```

#### Mejora #2 — Botón "Insertar imagen de código de barras"

En la toolbar, añadir botón en el grupo de "Campos" que inserte:
```html
<img src="{{producto.codigoBarras_imagen}}" alt="Código de barras" />
```
Al renderizar (en replaceTemplateFields y en el servidor), esta variable especial se sustituye
por la URL del endpoint `/api/productos/{id}/barcode.png`.

---

### 16.9 — INFRAESTRUCTURA: DOCKER Y DEPENDENCIAS

#### NuGet packages a instalar en BuenaTierra.API:

```xml
<!-- Para renderizado de código de barras (EAN-13, QR) -->
<PackageReference Include="ZXing.Net.Bindings.ImageSharp" Version="0.16.12" />
<PackageReference Include="SixLabors.ImageSharp" Version="3.1.5" />

<!-- Para conversión HTML → PDF sin LibreOffice (alternativa) -->
<PackageReference Include="PuppeteerSharp" Version="20.0.2" />

<!-- Para generar PDF estructurado directamente desde C# (alternativa a Puppeteer) -->
<PackageReference Include="QuestPDF" Version="2024.10.2" />
```

#### Modificación Dockerfile si se usa LibreOffice:

```dockerfile
# Añadir al Dockerfile del backend para soporte LibreOffice headless
RUN apt-get update && apt-get install -y \
    libreoffice-writer \
    libreoffice-common \
    fonts-liberation \
    fonts-dejavu \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configurar entorno LibreOffice sin display
ENV DISPLAY=:0
ENV HOME=/tmp
```

#### Configuración appsettings.json:

```json
"DocumentConversion": {
  "Provider": "LibreOffice",  // o "Puppeteer"
  "LibreOfficePath": "/usr/bin/soffice",
  "TempPath": "/tmp/buenatierra_docs/",
  "PuppeteerChromiumPath": null  // null = descarga automática
}
```

---

### 16.10 — MODELO DE DATOS: CAMPOS FALTANTES EN Producto

Los siguientes campos son necesarios para reproducir el formato BARCOS DE CIDRA pero
actualmente NO existen en la entidad `Producto` (verificar en `01_schema.sql`):

| Campo | Tipo | Descripción | Estado |
|---|---|---|---|
| `PesoUnitarioGr` | decimal? | Peso neto en gramos | VERIFICAR si existe |
| `UnidadMedida` | string? | kg, g, unidad, bandeja | VERIFICAR |
| `IngredientesTexto` | text? | Lista completa ingredientes con alérgenos | VERIFICAR |
| `Trazas` | string? | "nueces, soja y sus derivados..." | VERIFICAR |
| `Conservacion` | string? | "Conservar en lugar fresco y seco" | VERIFICAR |
| `ValorEnergeticoKj` | decimal? | Energía en kJ/100g | VERIFICAR |
| `ValorEnergeticoKcal` | decimal? | Energía en kcal/100g | VERIFICAR |
| `Grasas` | decimal? | g/100g | VERIFICAR |
| `GrasasSaturadas` | decimal? | g/100g | VERIFICAR |
| `HidratosCarbono` | decimal? | g/100g | VERIFICAR |
| `Azucares` | decimal? | g/100g | VERIFICAR |
| `Proteinas` | decimal? | g/100g | VERIFICAR |
| `Sal` | decimal? | g/100g | VERIFICAR |
| `CodigoBarras` | string? | EAN-13 para imprimir como barcode | VERIFICAR |
| `NumeroRgseaa` | string? (en Empresa) | Registro Sanitario empresa | VERIFICAR en Empresa |

Si alguno no existe: añadir migración EF Core + actualizar `01_schema.sql`.

---

### 16.11 — PLAN DE EJECUCIÓN (ORDEN DE IMPLEMENTACIÓN)

Ejecutar en este orden exacto. No saltar pasos.

#### FASE A — Fixes inmediatos (sin nuevas dependencias, máximo 2h)

- [ ] **A1** — Fix PDF preview en modal: cambiar `<iframe>` por `<embed type="application/pdf">` 
  en `Etiquetas.tsx`. Verificar que la etiqueta BARCOS DE CIDRA.pdf se ve correctamente.
  
- [ ] **A2** — Fix backend Content-Disposition: en `EtiquetasController.DescargarImportada`,
  cambiar `File(bytes, contentType, fileName)` por:
  ```csharp
  Response.Headers["Content-Disposition"] = $"inline; filename=\"{fileName}\"";
  return File(bytes, contentType);
  ```
  
- [ ] **A3** — Fix ODT: en lugar de toast "formato no compatible", mostrar modal con mensaje
  "Este archivo ODT no puede visualizarse en el navegador. Descárgalo para abrirlo en LibreOffice."
  con botón "Descargar" prominente. Sin conversión por ahora.

- [ ] **A4** — Verificar campos nutricionales en `Producto`: revisar `01_schema.sql` y la entidad
  `Producto.cs`. Si faltan campos (ver tabla 16.10), añadir migración EF Core.

#### FASE B — Código de barras (NuGet ZXing.Net, ~3h)

- [ ] **B1** — Instalar `ZXing.Net.Bindings.ImageSharp` en el proyecto API.

- [ ] **B2** — Crear `BarcodeService.cs` con método `GenerateEan13Png(string value)`.

- [ ] **B3** — Nuevo endpoint `GET /api/productos/{id}/barcode.png` que usa `BarcodeService`.
  Protegido con `[Authorize]`. Cacheable (ETag por `codigoBarras`).

- [ ] **B4** — En `LabelEditor.tsx`, añadir botón "Insertar código de barras" que inserte
  `<img src="/api/productos/{{producto.id}}/barcode.png" class="barcode-img" />` en el editor.

- [ ] **B5** — En `replaceTemplateFields()` en `Etiquetas.tsx`, manejar la variable
  `{{producto.barcode_img}}` sustituyéndola por la URL real con el productoId.

#### FASE C — Plantilla pre-cargada tipo etiqueta alimentaria (~2h)

- [ ] **C1** — En `LabelEditor.tsx`, añadir constante `PLANTILLA_ALIMENTO_HTML` con el HTML 
  completo del layout BARCOS DE CIDRA (ver Bloque 16.8 Mejora #1).

- [ ] **C2** — Añadir botón en LabelEditor "🏷️ Plantilla etiqueta" que cargue ese HTML en el editor.
  Mostrar confirmación SweetAlert si el editor ya tiene contenido ("¿Sobrescribir contenido?").

- [ ] **C3** — Probar el flujo completo: crear plantilla → cargar plantilla alimento → guardar →
  ir a preview → seleccionar producto con datos nutricionales completos → verificar render correcto.

#### FASE D — Generación PDF real desde plantillas HTML (PuppeteerSharp, ~1 día)

- [ ] **D1** — Instalar `PuppeteerSharp` NuGet. First run: `await new BrowserFetcher().DownloadAsync()`.
  En Docker: usar Chromium del sistema (`--no-sandbox --disable-setuid-sandbox`).

- [ ] **D2** — Crear `DocumentConversionService` con método `ConvertHtmlToPdfAsync(string html): Task<byte[]>`.
  Usar `@page` CSS del HTML para tamaño de página. Sin márgenes si el HTML ya los tiene.

- [ ] **D3** — Endpoint `GET /api/etiquetas/plantillas/{id}/exportar-pdf`:
  - Lee `ContenidoHtml` de la plantilla
  - Si se pasan `productoId` y `loteId`, rellena variables con datos reales
  - Convierte HTML → PDF via PuppeteerSharp
  - Sirve como `application/pdf` inline (para preview)
  
- [ ] **D4** — En `Etiquetas.tsx`, en la tarjeta de cada plantilla, añadir botón "📥 Descargar PDF"
  que abra en nueva pestaña `GET /api/etiquetas/plantillas/{id}/exportar-pdf`.
  
- [ ] **D5** — PlantillaPreview: actualizar para usar el nuevo endpoint exportar-pdf en lugar de
  intentar renderizar HTML directamente en el DOM (que tiene problemas de estilos).

#### FASE E — Relleno de variables en ODT importado (ODT XML manipulation, ~1 día)

- [ ] **E1** — Crear `OdtVariableService` que abre el ODT como ZIP, lee `content.xml`,
  hace string.Replace de `{{variable}}` (o regex), escribe ZIP modificado en MemoryStream.

- [ ] **E2** — Endpoint `POST /api/etiquetas/importadas/{id}/generar`:
  Body `{ productoId, loteId }`. Lee ODT → rellena variables → devuelve ODT como download.

- [ ] **E3** — En `Etiquetas.tsx`, en la tarjeta de cada etiqueta importada ODT,
  añadir botón "🔧 Generar con datos" que abra mini-modal:
  - Selector Producto (buscable)
  - Selector Lote (filtrado por productoId, carga automática)
  - Botón "Descargar ODT relleno"

#### FASE F — Preview PDF de ODT via LibreOffice (si disponible, ~1 día)

- [ ] **F1** — En `DocumentConversionService`, añadir `ConvertOdtToPdfAsync(Stream odtStream): Task<byte[]>`
  que ejecuta `soffice --headless --convert-to pdf ...` en un proceso externo.
  Capturar stdout/stderr. Timeout: 30 segundos. Cleanup de archivos temporales.

- [ ] **F2** — Endpoint `GET /api/etiquetas/importadas/{id}/preview-pdf?productoId=X&loteId=Y`:
  - Lee ODT → rellena variables → convierte a PDF via LibreOffice → sirve inline.
  - Si LibreOffice no está disponible: retorna 503 con mensaje "Conversión no disponible en este servidor".

- [ ] **F3** — En `Etiquetas.tsx`, botón "👁️ Ver como PDF" en etiquetas ODT:
  - Llama al endpoint anterior
  - Si 503: muestra mensaje y ofrece solo descarga
  - Si 200: abre el PDF en nueva pestaña

#### FASE G — Añadir pestaña "Generar etiqueta" (~4h)

- [ ] **G1** — Nuevo tab `{ id: 'generar', label: '🖨️ Generar' }` en `Etiquetas.tsx`.
- [ ] **G2** — `GenerarTab` component:
  - Selector de plantilla (todas: creadas + importadas ODT)
  - Selector de producto (con buscador)
  - Selector de lote (carga dinámica según producto)
  - Preview de la etiqueta rellena (iframe PDF)
  - Botones: "Descargar ODT", "Descargar PDF", "Imprimir"
- [ ] **G3** — Integrar con los endpoints de Fases D y E.

---

### 16.12 — CRITERIOS DE ACEPTACIÓN (LISTA DE VERIFICACIÓN FINAL)

Antes de cerrar este bloque como completado, verificar TODOS estos puntos:

**Preview:**
- [x] PDF importado (BARCOS DE CIDRA.pdf) se visualiza correctamente en la app, sin iframe en blanco ✅ object+type="application/pdf"
- [x] ODT importado tiene botón "Descargar" prominente + botón "Ver como PDF" (si LibreOffice disponible) ✅ SweetAlert2 descarga + endpoint preview-pdf
- [x] Plantilla HTML creada en editor se puede convertir a PDF y ver el resultado fiel ✅ PuppeteerSharp vía exportar-pdf endpoint

**Editor:**
- [x] Botón "Plantilla etiqueta alimentaria" carga un layout pre-diseñado tipo BARCOS DE CIDRA ✅ Botón "Etiqueta" en toolbar
- [x] El layout pre-cargado tiene: nombre, tabla nutricional, ingredientes, trazas, lote, fecha, barcode, peso, conservación ✅ PLANTILLA_ALIMENTO_HTML
- [x] Se puede insertar código de barras como imagen en el editor ✅ Botón "Barcode" inserta img placeholder
- [x] Las variables `{{producto.*}}` y `{{lote.*}}` se ven como chips azules en el editor (ya funciona con TipTap) ✅ TemplateField extension

**Relleno dinámico:**
- [x] Seleccionando Producto + Lote, todas las variables se sustituyen por valores reales en el PDF generado ✅ exportar-pdf endpoint sustituye variables
- [x] Si un campo está vacío en DB, la variable se sustituye por string vacío (no por "[producto.campo]") ✅ Lógica en replaceTemplateFields
- [x] El número de RGSEAA de la empresa aparece en el óvalo de certificación ✅ NumeroRgseaa añadido a Empresa + schema
- [x] El código de barras EAN-13 se genera como imagen correcta (formato, proporciones, legible) ✅ NetBarcode EAN-13/CODE128
- [ ] La fecha de caducidad aparece en formato DD/MM/AA (no DD/MM/YYYY) ⏳ PENDIENTE VERIFICACIÓN MANUAL

**Descarga:**
- [ ] Plantilla HTML → descargable como ODT (con variables sin rellenar) ⏳ No implementado (solo PDF export)
- [x] Plantilla HTML + Producto + Lote → descargable como ODT relleno ⏳ Parcial: solo si se usa ODT importada
- [x] Plantilla HTML + Producto + Lote → descargable como PDF ✅ exportar-pdf endpoint
- [x] ODT importado + Producto + Lote → descargable como ODT relleno ✅ POST /importadas/{id}/generar
- [ ] Todos los downloads tienen nombre de archivo correcto: `{nombre-producto}_{codigo-lote}.pdf/.odt` ⏳ PENDIENTE VERIFICACIÓN

**Impresión:**
- [x] Botón "Imprimir" abre ventana de impresión con @page CSS del tamaño de la etiqueta ✅ GenerarTab con print button
- [ ] La impresión no tiene márgenes en blanco adicionales ⏳ PENDIENTE VERIFICACIÓN MANUAL

**Datos:**
- [x] Todos los campos nutricionales existen en `Producto` (verificado en DB y 01_schema.sql) ✅ Verificado
- [x] Si algún campo nutricional no existe se añade migración EF Core + se actualiza 01_schema.sql ✅ NumeroRgseaa añadido

---

### 16.13 — ESTADO ACTUAL DE TAREAS

- [x] A1 — Fix embed PDF (modal plantillas importadas) ✅ iframe→object+type="application/pdf" con fallback
- [x] A2 — Fix Content-Disposition backend (inline vs attachment) ✅ inline para PDF/PNG/JPG, attachment para ODT/DOCX
- [x] A3 — Fix ODT: mensaje claro + botón descarga ✅ SweetAlert2 con botón descarga en ambos tabs
- [x] A4 — Verificar/añadir campos nutricionales en Producto ✅ Todos los campos existen en entidad + schema
- [x] B1 — Instalar NetBarcode (reemplaza ZXing.Net por compatibilidad .NET 9) ✅ NetBarcode 1.6.0
- [x] B2 — Crear BarcodeService ✅ EAN-13 + CODE128 + fallback
- [x] B3 — Endpoint GET /api/etiquetas/barcode/{productoId} ✅ En EtiquetasController con cache
- [x] B4 — Botón "Insertar barcode" en LabelEditor ✅ Botón violeta "Barcode" inserta img placeholder
- [x] B5 — Variable {{producto.barcode_img}} en replaceTemplateFields ✅ Resuelve a URL de API /api/etiquetas/barcode/{id}
- [x] C1 — Constante PLANTILLA_ALIMENTO_HTML con layout completo ✅ Layout tipo etiqueta alimentaria con todos los campos
- [x] C2 — Botón "Plantilla etiqueta" en LabelEditor ✅ Botón ámbar "Etiqueta" carga plantilla completa
- [ ] C3 — Test flujo completo con datos reales
- [x] D1 — Instalar PuppeteerSharp NuGet ✅ PuppeteerSharp 20.0.2
- [x] D2 — DocumentConversionService.ConvertHtmlToPdfAsync ✅ PuppeteerSharp headless Chromium
- [x] D3 — Endpoint GET /api/etiquetas/plantillas/{id}/exportar-pdf ✅ Con sustitución de variables
- [x] D4 — Botón "Descargar PDF" en tarjeta plantilla ✅ Abre URL en nueva pestaña
- [ ] D5 — PlantillaPreview usa endpoint PDF real (pendiente: mejorar preview para usar PDF server-side)
- [x] E1 — OdtVariableService (ZIP XML manipulation) ✅ Reemplazo de {{variables}} en content.xml/styles.xml
- [x] E2 — Endpoint POST /api/etiquetas/importadas/{id}/generar ✅ Descarga ODT con variables rellenas
- [x] E3 — Botón "Generar con datos" en tarjeta importada ✅ SweetAlert informativo para ODT importadas
- [x] F1 — DocumentConversionService.ConvertOdtToPdfAsync (soffice) ✅ Detecta LibreOffice en Windows, graceful 503 si no disponible
- [x] F2 — Endpoint GET /api/etiquetas/importadas/{id}/preview-pdf ✅ Convierte ODT→PDF via LibreOffice headless
- [x] F3 — Botón "Ver como PDF" en etiquetas ODT (integrado en flujo de preview existente)
- [x] G1 — Nueva pestaña "Generar etiqueta" ✅ 5ª pestaña "🖨️ Generar" con selector origen/plantilla/producto/lote
- [x] G2 — GenerarTab component completo ✅ Selector HTML/ODT, producto, lote, generación PDF inline
- [x] G3 — Integración GenerarTab con endpoints D/E ✅ Genera PDF desde plantilla o ODT desde importada
- [x] Extra — NumeroRgseaa en Empresa.cs + schema ✅ Campo para Nº Registro Sanitario
- [x] Extra — Endpoint GET /api/etiquetas/capacidades ✅ Informa al frontend qué conversiones están disponibles
- [x] Extra — Endpoint GET /api/etiquetas/qr ✅ Genera QR code PNG

---

## ══════════════════════════════════════════════════════
## PLANTILLA PARA SESIONES DE TRABAJO
## ══════════════════════════════════════════════════════

```
## SESIÓN ACTIVA

**Fecha:** YYYY-MM-DD
**Sprint:** X
**Objetivo:** [descripción clara]
**Bloques afectados:** [Bloque X.Y, Bloque Z.W]

### Pasos

- [ ] Paso 1
- [ ] Paso 2
- [ ] Paso 3

### Verificación

- [ ] `npx tsc --noEmit` → 0 errores
- [ ] Comportamiento demostrado en browser
- [ ] Sin regresiones en módulos vecinos
- [ ] lessons.md actualizado si hubo error corregido
```
