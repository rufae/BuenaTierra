# MODELO DE NEGOCIO COMPLETO — BUENATIERRA
## Del Ingrediente al Cliente Final

> **Versión:** 1.0 — 26 Febrero 2026  
> **Referencia normativa:** CE 178/2002 (Trazabilidad alimentaria) · CE 1169/2011 (Etiquetado) · CE 853/2004 (Higiene productos de origen animal)  
> **Propósito:** Documento maestro del proceso operativo completo. Define qué hace la empresa físicamente, qué registra en el sistema, y en qué momento exacto.

---

## VISIÓN GLOBAL DEL PROCESO

```
PROVEEDOR ──▶ RECEPCIÓN ──▶ ALMACÉN MP ──▶ PRODUCCIÓN ──▶ ETIQUETADO
                                                               │
                                                               ▼
CLIENTE FINAL ◀── ENTREGA ◀── PICKING ◀── STOCK PT ◀── ENVASADO/EMBALAJE
      │
      ▼
FACTURA + TRAZABILIDAD REGISTRADA
```

**Actores del sistema:**
| Actor | Rol en el proceso | Acceso al sistema |
|-------|-------------------|-------------------|
| Responsable de compras (obrador) | Gestiona proveedores y materias primas | Admin / Obrador |
| Maestro pastelero / producción | Elabora productos, registra producción | Obrador |
| Responsable de oficina | Clientes, albaranes, facturas, pedidos | Obrador |
| Repartidor | Recoge productos, factura y entrega a sus clientes | Repartidor |
| Cliente final | Recibe el producto | Sin acceso directo |

---

## FASE 1 — COMPRA DE INGREDIENTES Y MATERIAS PRIMAS

### 1.1. Proceso físico

1. El responsable detecta necesidad de reposición (stock bajo de materia prima o planificación de producción próxima semana).
2. Contacta con el proveedor por teléfono, email o pedido web.
3. El proveedor entrega los ingredientes en el obrador con su albarán de entrega y, obligatoriamente, su **número de lote de proveedor** y **ficha técnica** del producto.
4. El responsable verifica físicamente:
   - Cantidad recibida vs. cantidad pedida
   - Estado del packaging (sin roturas, sin humedad)
   - Fecha de caducidad o consumo preferente
   - Número de lote del proveedor (requisito CE 178/2002 Art. 18)

### 1.2. Registro en el sistema

**¿Quién lo hace?** Responsable de oficina o producción al recibir el pedido.  
**¿Cuándo?** En el momento de recepción, antes de almacenar el ingrediente.

```
SISTEMA → Módulo: Ingredientes
  Acción: Crear / actualizar entrada de materia prima
  Datos a registrar:
    - Ingrediente (ya existe en catálogo → seleccionar)
    - Proveedor
    - Número de lote del proveedor (campo obligatorio)
    - Fecha de recepción
    - Fecha de caducidad del ingrediente
    - Cantidad recibida (en kg, litros, unidades)
    - Observaciones (incidencias en recepción si las hay)
```

> **¿Por qué es obligatorio el lote del proveedor?**  
> CE 178/2002 Art. 18 obliga a poder identificar "de quién se ha recibido un alimento". Sin el lote del proveedor, en caso de recall alimentario (ej: contaminación en el proveedor de harina), la empresa no puede demostrar qué lotes de producto elaborado se vieron afectados.

---

## FASE 2 — ALMACÉN DE MATERIAS PRIMAS

### 2.1. Proceso físico

1. Los ingredientes recibidos se colocan en el almacén siguiendo **FIFO físico**: los más antiguos (caducidad más próxima) al frente; los recién llegados detrás.
2. Las zonas de almacén están separadas por tipo: secos, refrigerados, congelados.
3. Se respeta la normativa de higiene: no contacto suelo, temperatura controlada, sin mezcla con productos no alimentarios.
4. Cada producto tiene su zona o bandeja identificada con el nombre del ingrediente.

### 2.2. Control en el sistema

```
SISTEMA → Módulo: Ingredientes
  Vista: Stock de materias primas
  El sistema muestra:
    - Stock actual por ingrediente (suma de todas las entradas no consumidas)
    - Fecha de caducidad más próxima por ingrediente (alerta visual)
    - Alertas de bajo stock (umbral configurable por ingrediente)
```

**Acción periódica del responsable:** revisar semanalmente las alertas de stock bajo y caducidades próximas para planificar próxima compra.

---

## FASE 3 — PLANIFICACIÓN DE PRODUCCIÓN

### 3.1. Proceso físico

1. El maestro pastelero o responsable decide qué productos se van a elaborar al día siguiente (habitualmente el día anterior o primera hora).
2. La decisión se basa en:
   - Pedidos pendientes de clientes o repartidores (revisar en el sistema)
   - Stock actual de producto terminado (revisar en el sistema)
   - Capacidad de producción del obrador ese día
3. Se preparan los ingredientes necesarios: se sacan del almacén, se pesan, se disponen en zona de trabajo.

### 3.2. Registro en el sistema

**¿Quién?** Responsable de producción.  
**¿Cuándo?** La tarde anterior o primera hora del día de producción.

```
SISTEMA → Módulo: Producción
  Acción: Crear nueva producción
  Datos a registrar:
    - Fecha de producción: [hoy o mañana]
    - Responsable
    - Productos a elaborar:
        · Producto: Palmeras
        · Cantidad planificada: 200 unidades (blisters)
        · Producto: Galletas Mantequilla
        · Cantidad planificada: 150 unidades
    - Estado: PLANIFICADA

  El sistema sugiere automáticamente:
    → Código de lote: ddMMyyyy de la fecha de producción
      (editable si se necesita ajuste)
```

> **Nota operativa:** El obrador puede tener varias producciones activas en paralelo (mañana y tarde, o distintos maestros). Cada producción genera su propio lote.

---

## FASE 4 — ELABORACIÓN / PRODUCCIÓN

### 4.1. Proceso físico

1. El maestro elabora los productos según su receta habitual.
2. Durante la elaboración se usan los ingredientes preparados en la Fase 3.
3. Si hay **merma** (producto que no supera el control de calidad visual, peso incorrecto, rotura), se separa y se anota.
4. Al finalizar la elaboración, se cuenta el producto terminado real:
   - Unidades (blisters individuales) producidas
   - Unidades con merma / descartadas

### 4.2. Registro en el sistema — Finalización de producción

**¿Quién?** Maestro pastelero o responsable de producción.  
**¿Cuándo?** Al terminar la elaboración del lote, antes del envasado.

```
SISTEMA → Módulo: Producción
  Acción: Editar producción → Finalizar
  Datos a registrar:
    - Por cada producto de la producción:
        · Cantidad producida real (blisters/unidades terminadas)
        · Cantidad merma (rechazada por calidad)
    - Estado: COMPLETADA
  
  El sistema ejecuta automáticamente:
    → Genera el LOTE con código ddMMyyyy (ej: 26022026)
    → Si ya existe un lote para ese producto ese día: añade sufijo (26022026-2)
    → Añade al STOCK: producto + lote + cantidad producida
    → Registra movimiento de stock: ENTRADA por producción
    → Registra trazabilidad: lote ↔ producción ↔ fecha ↔ responsable
```

---

## FASE 5 — PRODUCCIÓN DE ETIQUETAS

### 5.1. Qué debe contener la etiqueta (CE 1169/2011 — Obligatorio)

Cada blíster/envase individual debe tener etiqueta con:

| Campo | Ejemplo | Obligatorio |
|-------|---------|-------------|
| Nombre del producto | Palmeras de hojaldre | ✅ Legal |
| Lista de ingredientes | Harina de trigo, mantequilla... | ✅ Legal |
| Alérgenos (en negrita) | **Gluten**, **Leche** | ✅ Legal |
| Peso neto | 120 g | ✅ Legal |
| Fecha de consumo preferente | Consumir preferentemente antes del... | ✅ Legal |
| **Número de lote** | Lote: **26022026** | ✅ Legal CE 178/2002 |
| Nombre y dirección del obrador | BuenaTierra S.L., Calle... | ✅ Legal |
| Condiciones de conservación | Conservar en lugar fresco y seco | ✅ Legal |
| Código de barras EAN | Código tienda | Comercial |

> **CRÍTICO:** El número de lote en la etiqueta **es un requisito legal**, no opcional. Sin lote en la etiqueta física, la empresa no cumple CE 178/2002 Art.18 y puede ser sancionada por sanidad. El lote permite rastrear cualquier blíster físico hasta su producción exacta en caso de inspección o retirada de mercado.

### 5.2. Proceso físico de etiquetado

**Opción actual (proceso manual):**
1. El responsable imprime etiquetas en la impresora de etiquetas (rollo térmico).
2. Las etiquetas ya vienen prediseñadas con los datos fijos del producto.
3. El número de lote se imprime variable según el día de producción.

**Opción futura con el sistema (módulo a desarrollar):**
```
SISTEMA → Módulo: Producción → Acción: Imprimir etiquetas del lote
  Input:
    - Lote seleccionado (ej: 26022026 - Palmeras)
    - Cantidad de etiquetas a imprimir
  
  El sistema genera etiquetas con:
    - Todos los campos legales del producto (desde ficha de producto)
    - Número de lote: 26022026 (automático desde el lote generado)
    - Fecha de consumo preferente: calculada automáticamente
      (fecha producción + días de vida útil configurados por producto)
    - Código QR (futuro): {productoId}|{loteId}|{fechaProduccion}|{caducidad}
  
  Imprime directamente en impresora de etiquetas configurada
```

### 5.3. Registro en el sistema

El módulo de etiquetas no requiere registro manual adicional — el lote ya se creó en la Fase 4. La impresión es una acción de consulta sobre datos ya existentes.

---

## FASE 6 — ENVASADO Y EMBALAJE

### 6.1. Proceso físico

1. Se coloca la etiqueta del lote correspondiente en cada blíster.
2. Los blisters se agrupan en cajas del obrador (habitualmente 3 blisters por caja).
3. **REGLA OPERATIVA CRÍTICA (trazabilidad de caja):**

```
┌─────────────────────────────────────────────────────────────────────┐
│  REGLA: UNA CAJA = UN LOTE                                          │
│                                                                     │
│  ✅ Correcto:                                                       │
│     Caja #1: 3 blisters Palmeras Lote 26022026                     │
│     Caja #2: 3 blisters Palmeras Lote 26022026                     │
│     Caja #3: 3 blisters Palmeras Lote 25022026  (lote anterior)    │
│                                                                     │
│  ❌ Evitar:                                                         │
│     Caja #4: 2 blisters Lote 26022026 + 1 blíster Lote 25022026   │
│                                                                     │
│  Si la producción del día no llena una caja completa:              │
│  → completar la caja con blisters del mismo producto               │
│    del lote anterior, pero SIEMPRE registrar en el albarán         │
│    que esa última caja contiene blisters de dos lotes.             │
└─────────────────────────────────────────────────────────────────────┘
```

4. Las cajas se almacenan agrupadas por lote y por producto, con etiqueta visible de lote en el exterior de la caja.
5. Orden de estante: lotes más antiguos al frente (FIFO físico = FIFO digital).

### 6.2. Registro en el sistema

No se requiere acción adicional en el sistema en esta fase si se respeta la regla de una caja = un lote. El stock por lote ya refleja las unidades disponibles desde la Fase 4.

> **Nota para fases futuras:** Si el negocio crece o se necesita trazabilidad de caja (Opción C del análisis de blisters), en esta fase se registraría la composición de cada caja física en el sistema antes de cerrarla.

---

## FASE 7 — GESTIÓN DE STOCK Y ALMACÉN DE PRODUCTO TERMINADO

### 7.1. Proceso físico

1. Las cajas de producto terminado están en el almacén, organizadas por:
   - Zona de producto (palmeras, galletas, polvorones…)
   - Dentro de cada zona: por lote, el más antiguo al frente
2. El responsable revisa periódicamente:
   - Producto próximo a caducar (mover al frente, priorizar en ventas)
   - Producto con stock muy alto (puede indicar sobreproducción)
   - Producto con stock bajo (puede indicar necesidad de nueva producción)

### 7.2. Consulta en el sistema

```
SISTEMA → Módulo: Stock (vista desde Lotes)
  El sistema muestra por producto:
    - Stock total disponible (suma de todos los lotes)
    - Desglose por lote con cantidad y fecha de producción
    - Alerta visual: filas en rojo = lote caducado
    - Alerta visual: filas en amarillo = lote próximo a caducar
    - Alerta: stock bajo (umbral configurable)
  
  Exportable a Excel para inspecciones de sanidad
```

---

## FASE 8 — RECEPCIÓN DE PEDIDOS

### 8.1. Fuentes de pedido

| Fuente | Canal físico | Registro en sistema |
|--------|-------------|---------------------|
| Cliente empresa (hostelería, tiendas) | Teléfono, email, visita | Pedido manual en oficina |
| Cliente particular | Visita en obrador | Venta directa (factura rápida) |
| Autónomo / pequeño comercio | Teléfono, WhatsApp | Pedido manual en oficina |
| Repartidor (compra al obrador) | Recoge en el obrador | Albarán en obrador |

### 8.2. Registro de pedido en el sistema

**¿Quién?** Responsable de oficina.  
**¿Cuándo?** Al recibir el pedido, antes de prepararlo.

```
SISTEMA → Módulo: Pedidos
  Acción: Nuevo pedido
  Datos:
    - Cliente (seleccionar de la lista o crear nuevo)
    - Fecha de entrega deseada
    - Líneas de pedido:
        · Producto: Palmeras
        · Cantidad: 10 cajas (el sistema convierte a blisters si aplica)
        · Producto: Galletas Mantequilla
        · Cantidad: 5 cajas
    - Estado: PENDIENTE
    - Observaciones (ruta de entrega, instrucciones especiales)
  
  El sistema muestra automáticamente:
    → Stock disponible por producto en tiempo real
    → Alerta si no hay suficiente stock para cubrir el pedido
```

---

## FASE 9 — PREPARACIÓN DEL ALBARÁN Y PICKING

### 9.1. Creación del albarán

**¿Quién?** Responsable de oficina (para ventas directas del obrador).

```
SISTEMA → Módulo: Albaranes
  Acción: Nuevo albarán (desde pedido o desde cero)
  
  Si viene de pedido:
    → Botón "Convertir a albarán" en el pedido
    → Las líneas se transfieren automáticamente
  
  Si es venta directa:
    → Crear albarán nuevo
    → Seleccionar cliente
    → Añadir líneas de producto + cantidad
  
  El sistema ejecuta automáticamente el algoritmo FIFO:
    Ejemplo: Palmeras ×10 cajas
    
    Consulta stock por lote (orden por fecha_produccion ASC):
    → Lote 24022026: 3 cajas disponibles → asigna 3
    → Lote 25022026: 4 cajas disponibles → asigna 4
    → Lote 26022026: 3 cajas disponibles → asigna 3
    
    Resultado automático en el albarán:
    → Línea 1: Palmeras ×3 — Lote 24022026
    → Línea 2: Palmeras ×4 — Lote 25022026
    → Línea 3: Palmeras ×3 — Lote 26022026
    
    Sin intervención manual. Cero escritura de lotes.
```

### 9.2. Instrucción de picking para el responsable

Una vez generado el albarán con los lotes asignados, el sistema genera automáticamente la instrucción de preparación física:

```
SISTEMA → Albarán #{número} → Ver instrucción de picking

┌──────────────────────────────────────────────────────────────┐
│  PREPARAR PEDIDO — Cliente: Tienda La Esquina               │
│  Albarán: ALB-2026-0312 — Fecha: 26/02/2026                 │
├──────────────────────────────────────────────────────────────┤
│  1. PALMERAS                                                  │
│     📦 Coge 3 cajas del estante → Zona Palmeras Lote 240226  │
│     📦 Coge 4 cajas del estante → Zona Palmeras Lote 250226  │
│     📦 Coge 3 cajas del estante → Zona Palmeras Lote 260226  │
│                                                              │
│  2. GALLETAS MANTEQUILLA                                     │
│     📦 Coge 5 cajas del estante → Zona Galletas Lote 260226  │
└──────────────────────────────────────────────────────────────┘
```

El responsable sigue la instrucción sin escribir nada. La trazabilidad ya está registrada en el albarán.

### 9.3. Descuento de stock

```
Al confirmar el albarán:
  El sistema descuenta automáticamente del stock:
  → Lote 24022026 - Palmeras: −3 cajas
  → Lote 25022026 - Palmeras: −4 cajas
  → Lote 26022026 - Palmeras: −3 cajas
  → Registra movimientos en trazabilidad: SALIDA por albarán ALB-2026-0312
```

---

## FASE 10 — GENERACIÓN DE FACTURA

### 10.1. Factura desde albarán

El modelo preferido: **primero albarán, luego factura** cuando el pedido se ha entregado.

```
SISTEMA → Módulo: Albaranes
  Acción: Converter albarán → Factura
  
  El sistema:
    → Copia EXACTAMENTE las líneas del albarán (incluyendo lotes ya asignados)
    → NO vuelve a ejecutar FIFO (los lotes ya están fijados en el albarán)
    → Genera número de factura automático (serie + año + secuencial)
    → Calcula:
        · Base imponible
        · IVA (tipo configurable por producto o cliente)
        · Recargo de Equivalencia (RE) si el cliente es autónomo/régimen especial
        · Retención si aplica (autónomo con retención de IRPF)
    → Genera PDF descargable e imprimible
    → Estado: EMITIDA
```

### 10.2. Factura simplificada (venta directa en obrador)

Para ventas al mostrador o particulares sin necesidad de albarán previo:

```
SISTEMA → Módulo: Facturas
  Acción: Nueva factura simplificada
  → Igual que albarán pero genera factura directamente
  → FIFO automático también en este caso
```

### 10.3. Datos fiscales de la factura

```
Cabecera:
  - Número de factura (serie automática)
  - Fecha de emisión
  - Datos del obrador (razón social, CIF, dirección, teléfono)
  - Datos del cliente (razón social/nombre, NIF, dirección)

Cuerpo:
  - Por cada línea:
      · Descripción del producto
      · Número de lote
      · Cantidad
      · Precio unitario
      · Descuento (si aplica)
      · IVA (%)
      · Importe

Pie:
  - Base imponible
  - IVA total
  - Recargo de Equivalencia (si aplica)
  - Retención IRPF (si aplica)
  - TOTAL A PAGAR
```

---

## FASE 11 — ENTREGA Y REPARTO

### 11.1. Entrega por el propio obrador

Cuando el obrador reparte directamente (furgoneta propia):

1. Se cargan las cajas preparadas en el picking (Fase 9) en el vehículo.
2. El albarán o factura en papel acompaña la entrega (impreso desde el sistema).
3. El cliente firma el albarán de entrega.
4. El albarán firmado se archiva en el obrador.
5. Se convierte a factura en el sistema cuando el periodo de facturación lo requiera.

### 11.2. Entrega por repartidor independiente

El repartidor es una empresa independiente que **compra** productos al obrador y los revende a sus propios clientes.

**Flujo de compra del repartidor al obrador:**

```
Repartidor llega al obrador (o hace pedido previo)
    │
    ▼
Responsable de oficina crea albarán de venta al repartidor
    → Cliente: [nombre del repartidor como empresa]
    → Líneas: productos + cantidades que el repartidor pide
    → FIFO automático asigna lotes
    → Instrucción de picking generada
    │
    ▼
Se preparan las cajas según instrucción de picking
    → El repartidor verifica las cajas recibidas
    │
    ▼
El repartidor se lleva las cajas
    │
    ▼
El obrador:
    → Confirma el albarán → descuenta stock
    → Convierte a factura para el repartidor
    → El repartidor tiene su factura de compra al obrador
```

**Flujo de venta del repartidor a sus clientes (POS del repartidor):**

```
El repartidor abre su módulo POS en el ordenador o tablet
    │
    ▼
Selecciona su cliente (los tiene registrados en su módulo)
    │
    ▼
Añade los productos que va a entregar:
    - Palmeras ×10 cajas  [escribe solo cantidad, sin tocar lotes]
    - Galletas ×5 cajas
    │
    ▼
El sistema ejecuta FIFO sobre el stock que el repartidor tiene asignado
    → Asigna lotes automáticamente (misma lógica que el obrador)
    → Genera instrucción de picking para el repartidor:
        "Palmeras: 7 cajas Lote 240226 + 3 cajas Lote 250226"
    │
    ▼
El repartidor prepara las cajas en el vehículo según la instrucción
    │
    ▼
Generación de factura al cliente (PDF)
    → El repartidor descarga/imprime la factura desde el sistema
    → La lleva como justificante de entrega
    │
    ▼
El cliente recibe las cajas + factura o albarán
    │
    ▼
Trazabilidad registrada:
    Ingrediente → Producción → Lote → Venta obrador→repartidor → Venta repartidor→cliente
```

---

## FASE 12 — TRAZABILIDAD Y CONTROL DE CALIDAD

### 12.1. Trazabilidad directa (hacia adelante)

Pregunta: *"¿A qué clientes ha llegado el lote 24022026 de Palmeras?"*

```
SISTEMA → Módulo: Trazabilidad → Tab "Por Producto"
  Input: Producto = Palmeras, Lote = 24022026

  Resultado:
    → Producción: 24/02/2026 — Responsable: Juan — 200 unidades
    → Ingredientes usados: Harina lote HA-2024 (proveedor Harinera Castilla)
                           Mantequilla lote MT-0812 (proveedor Lácteos Norte)
    → Clientes que recibieron este lote:
        · Tienda La Esquina — Albarán ALB-2026-0312 — 3 cajas — 24/02/2026
        · Bar El Rincón — Factura FAC-2026-0145 — 2 cajas — 25/02/2026
        · Repartidor García → Cliente Final Tienda Pepe — 4 cajas — 25/02/2026
    → Exportar a Excel (para entregar a Sanidad si se requiere)
```

### 12.2. Trazabilidad inversa (hacia atrás)

Pregunta: *"La harina del proveedor X tiene alerta de contaminación. ¿Qué productos elaborados usaron esa harina?"*

```
SISTEMA → Módulo: Trazabilidad → Tab "Recall por Ingrediente"
  Input: Ingrediente = Harina de trigo, Lote proveedor = HA-2024

  Resultado (Recall completo Art. 19 CE 178/2002):
    → KPIs: 3 lotes de producto afectados / 15 clientes / 48 cajas distribuidas
    → Lotes afectados:
        · 24022026 — Palmeras — 200 uds producidas — 9 cajas vendidas
        · 25022026 — Galletas Mantequilla — 150 uds — 5 cajas vendidas
        · 20022026 — Palmeras — 180 uds — 12 cajas vendidas
    → Lista completa de clientes con datos de contacto
    → Aviso legal automático (texto Art. 19 CE 178/2002):
        "Debe notificar a las autoridades competentes e iniciar
         el procedimiento de retirada del mercado"
    → Exportar informe completo a Excel para Sanidad
```

### 12.3. Informes periódicos para Sanidad

```
SISTEMA → Módulo: Trazabilidad / Reportes
  Exportaciones disponibles:

  1. Movimientos por fecha (diario, semanal, mensual):
     Excel con columnas: fecha / producto / lote / movimiento / 
                         cantidad / cliente / albarán / factura

  2. Stock por lote con caducidades:
     Excel con columnas: producto / lote / fecha_producción / 
                         fecha_caducidad / stock_actual / estado
     → Filas rojas: caducado
     → Filas amarillas: caducidad en 7 días

  3. Trazabilidad completa de producto:
     Excel por producto: todos sus lotes + todos sus movimientos + todos sus clientes

  4. Informe de ingredientes y alérgenos:
     Por producto: declaración de alérgenos. Certificado CE 1169/2011.
```

---

## FASE 13 — CICLO DE DATOS EN EL SISTEMA (RESUMEN OPERATIVO)

### ¿Qué se introduce en el ordenador y cuándo?

| Momento | Módulo | Acción | Quién | Tiempo estimado |
|---------|--------|--------|-------|----------------|
| Al recibir ingredientes | Ingredientes | Registrar entrada con lote proveedor | Responsable | 2 min |
| Antes/inicio de producción | Producción | Crear producción + productos planificados | Producción | 3 min |
| Al terminar producción | Producción | Finalizar producción + cantidad real + merma | Producción | 2 min |
| Para etiquetas | Producción | Imprimir etiquetas del lote generado | Producción | 1 min |
| Al recibir un pedido | Pedidos | Crear pedido de cliente | Oficina | 2 min |
| Al preparar el envío | Albaranes | Crear albarán (FIFO automático) | Oficina | 2 min |
| Al facturar | Facturas | Convertir albarán a factura | Oficina | 30 seg |
| El repartidor con su cliente | POS Repartidor | Crear factura rápida (FIFO automático) | Repartidor | 1 min |
| Auditoría Sanidad | Trazabilidad | Exportar informe Excel | Oficina | 1 min |

**Tiempo total de registros del sistema en un día normal de producción:** ~15-20 minutos.

---

## FLUJO MAESTRO INTEGRADO

```
[PROVEEDOR]
     │ Ingredientes + lote proveedor
     ▼
[RECEPCIÓN] ──── Sistema: registrar entrada ingrediente con lote
     │
     ▼
[ALMACÉN MP] ──── Sistema: stock materias primas con alertas
     │
     ▼
[PLANIFICACIÓN] ── Sistema: crear orden de producción
     │
     ▼
[ELABORACIÓN] ──── (proceso físico del maestro pastelero)
     │
     ▼
[FIN PRODUCCIÓN] ── Sistema: finalizar producción → GENERA LOTE (ddMMyyyy) → ACTUALIZA STOCK
     │
     ▼
[ETIQUETADO] ───── Sistema: imprimir etiquetas con lote + caducidad + alérgenos + QR(futuro)
     │
     ▼
[ENVASADO] ──────── Físico: aplicar etiqueta + empaquetar en cajas → REGLA: 1 caja = 1 lote
     │
     ▼
[ALMACÉN PT] ───── Sistema: stock producto terminado por lote, FIFO físico visual
     │
     ├─────────────────────────────────────────────┐
     ▼                                             ▼
[PEDIDO CLIENTE DIRECTO]                   [PEDIDO REPARTIDOR]
     │                                             │
     ▼                                             ▼
[ALBARÁN OFICINA] ── Sistema: FIFO auto   [ALBARÁN REPARTIDOR] ── Sistema: FIFO auto
→ instrucción picking                     → instrucción picking
     │                                             │
     ▼                                             ▼
[PICKING FÍSICO] ── seguir instrucción    [PICKING REPARTIDOR] ── seguir instrucción
     │                                             │
     ▼                                             ▼
[ENTREGA CLIENTE]                         [CARGA EN VEHÍCULO]
     │                                             │
     ▼                                             ▼
[FACTURA] ── Sistema: convertir           [POS REPARTIDOR] ── Sistema: factura rápida
albarán → factura automático              → FIFO sobre stock repartidor
     │                                             │
     └───────────────────┬─────────────────────────┘
                         ▼
               [TRAZABILIDAD REGISTRADA]
               lote → movimiento → cliente
                         │
                         ▼
               [EXPORTACIÓN EXCEL SANIDAD]
               cuando Sanidad lo requiera
```

---

## DATOS MAESTROS — LO QUE SE CONFIGURA UNA VEZ

Estos datos se introducen en el sistema una única vez (o cuando cambian) y luego el sistema los usa automáticamente:

| Dato maestro | Módulo | Ejemplos |
|-------------|--------|---------|
| Ingredientes | Ingredientes | Harina de trigo, mantequilla, azúcar... |
| Alérgenos por ingrediente | Ingredientes | Harina → Gluten; Mantequilla → Lácteos |
| Productos / artículos | Productos | Palmeras, Galletas Mantequilla... |
| Ingredientes por producto (receta) | Productos | Palmeras usa: harina, mantequilla, sal |
| Alérgenos por producto | Productos | Palmeras: Gluten, Lácteos |
| Vida útil por producto (días) | Productos | Palmeras: 60 días → caducidad auto |
| Tipos de IVA por producto | Productos | 10% (alimentos) |
| Clientes | Clientes | Datos fiscales, tipo (empresa/particular/repartidor) |
| Usuarios del sistema | Admin | Roles y permisos |

---

## MARCO LEGAL DE REFERENCIA

| Normativa | Aplica en este proceso | Cómo lo cubre el sistema |
|-----------|----------------------|--------------------------|
| CE 178/2002 — Trazabilidad alimentaria | Todas las fases | Lote registrado en producción, albarán, factura, trazabilidad |
| CE 1169/2011 — Información al consumidor | Fase 5: etiquetas | Módulo ingredientes + alérgenos; impresión de etiquetas con lote |
| CE 853/2004 — Higiene productos animales | Fase 2-4: producción | Control de materias primas con lote de proveedor |
| AEAT — Facturación | Fase 10: facturas | Series, numeración, datos fiscales, RE, retención |
| LOPD / RGPD — Datos personales | Clientes, repartidores | Datos de clientes almacenados con acceso controlado por rol |
