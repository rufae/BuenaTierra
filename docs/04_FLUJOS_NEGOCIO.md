# FLUJOS DE NEGOCIO - SISTEMA BUENATIERRA

## 1. MAPA GENERAL DE PROCESOS

```
┌──────────────────────────────────────────────────────────────┐
│                    PROCESOS DE OBRADOR                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────────────┐     ┌───────────────┐     ┌──────────┐  │
│  │  PRODUCCIÓN   │────▶│     STOCK     │────▶│  VENTAS  │  │
│  │  +Lotes       │     │  Inventario   │     │          │  │
│  └───────────────┘     └───────────────┘     └────┬─────┘  │
│         │                      │                   │        │
│         │                      │                   ▼        │
│         │                      │          ┌────────────────┐│
│         │                      │          │  FACTURACIÓN   ││
│         │                      │          │  +Trazabilidad ││
│         │                      │          └────────────────┘│
│         │                      │                   │        │
│         ▼                      ▼                   ▼        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              AUDITORÍA Y REPORTING                   │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                  PROCESOS DE REPARTIDOR                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────────────┐     ┌────────────────┐                  │
│  │  CONSULTA     │────▶│  FACTURACIÓN   │                  │
│  │  CATÁLOGO     │     │  RÁPIDA        │                  │
│  │  +Stock       │     │  +Auto Lotes   │                  │
│  └───────────────┘     └────────┬───────┘                  │
│                                 │                           │
│                                 ▼                           │
│                        ┌────────────────┐                   │
│                        │  IMPRESIÓN     │                   │
│                        │  ENTREGA       │                   │
│                        └────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. FLUJOS DE OBRADOR

### 2.1. FLUJO: Producción Diaria y Generación de Lotes

**Actores:** Usuario Obrador (Producción)  
**Objetivo:** Registrar producción del día y generar lotes con trazabilidad  
**Frecuencia:** Diaria

#### 2.1.1. Diagrama de Flujo

```
┌──────────────┐
│  INICIO      │
│  Jornada     │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Crear Producción Diaria │
│    - Fecha: HOY            │
│    - Responsable           │
│    - Estado: Planificada   │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. Añadir Productos a      │
│    Producir                │
│    - Producto: Palmeras    │
│    - Cantidad: 50 cajas    │
│    - Producto: Galletas    │
│    - Cantidad: 30 cajas    │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 3. Iniciar Producción      │
│    Estado: En Proceso      │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. [PRODUCCIÓN FÍSICA]     │
│    (fuera del sistema)     │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 5. Registrar Cantidades    │
│    Reales Producidas       │
│    - Palmeras: 48 cajas    │
│    - Galletas: 30 cajas    │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 6. Finalizar Producción    │
│    Estado: Finalizada      │
└──────┬─────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 7. SISTEMA AUTO-GENERA LOTES            │
│    Por cada producto:                   │
│    - Lote código: DDMMYYYY              │
│    - Fecha fabricación: HOY             │
│    - Fecha caducidad: HOY + días_cad    │
│    - Cantidad: cantidad producida       │
│    - Registrar en tabla lotes           │
│    - Crear/actualizar stock             │
│    - Registrar movimiento entrada       │
│    - Registrar trazabilidad upstream    │
└──────┬──────────────────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 8. Imprimir Etiquetas      │
│    Lotes (Opcional)        │
│    - Código lote           │
│    - Producto              │
│    - Fecha caducidad       │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
│  Lotes disponibles         │
│  para venta                │
└────────────────────────────┘
```

#### 2.1.2. Validaciones y Reglas de Negocio

| Regla | Descripción |
|-------|-------------|
| **RN-PROD-01** | Una producción solo puede finalizarse una vez |
| **RN-PROD-02** | Al finalizar, cantidad real puede diferir de la planificada (mermas) |
| **RN-PROD-03** | Código de lote DDMMYYYY debe ser único por producto en mismo día (añadir secuencia si duplicado) |
| **RN-PROD-04** | Fecha de caducidad se calcula automáticamente: fecha_fabricacion + producto.caducidad_dias |
| **RN-PROD-05** | Al crear lote, stock se incrementa automáticamente |
| **RN-PROD-06** | Si producción se cancela, lotes no se generan (o se eliminan si ya fueron creados) |

#### 2.1.3. Estados de Producción

```
PLANIFICADA ──(Iniciar)──▶ EN_PROCESO ──(Finalizar)──▶ FINALIZADA
     │                                                       ▲
     │                                                       │
     └────────────(Cancelar)───────────────────────────────▶ CANCELADA
```

---

### 2.2. FLUJO: Venta Directa en Oficina con Factura

**Actores:** Usuario Obrador (Ventas)  
**Objetivo:** Vender productos directamente a cliente y generar factura  
**Frecuencia:** Múltiples veces al día

#### 2.2.1. Diagrama de Flujo

```
┌──────────────┐
│  INICIO      │
│  Cliente en  │
│  oficina     │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Buscar/Crear Cliente    │
│    - Buscar por nombre/CIF │
│    - Crear si no existe    │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. Iniciar Nueva Factura   │
│    - Cliente seleccionado  │
│    - Fecha: HOY            │
│    - Serie: auto           │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 3. Añadir Productos        │
│    - Buscar producto       │
│    - Introducir cantidad   │
│    - (SIN seleccionar lote)│
└──────┬─────────────────────┘
       │
       ▼                     ┌─────────────────┐
┌──────────────────────┐    │ ¿Añadir más?    │
│ ¿Más productos?     │────▶│ SÍ: volver paso3│
│ NO: continuar       │     │ NO: continuar   │
└──────┬──────────────┘     └─────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 4. SISTEMA: Asignación Auto de Lotes    │
│    Por cada producto:                   │
│    - Ejecutar algoritmo FIFO            │
│    - Validar stock disponible           │
│    - Crear líneas con lotes asignados   │
│    - Mostrar vista previa               │
└──────┬──────────────────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 5. Vista Previa Factura    │
│    - Ver líneas generadas  │
│    - Ver totales           │
│    - Opción modificar      │
└──────┬─────────────────────┘
       │
       ▼                     ┌─────────────────┐
┌──────────────────────┐    │ ¿Correcto?      │
│ Confirmación Usuario│────▶│ NO: cancelar    │
│ ¿Generar factura?   │     │ SÍ: continuar   │
└──────┬──────────────┘     └─────────────────┘
       │ SÍ
       ▼
┌─────────────────────────────────────────┐
│ 6. SISTEMA: Crear Factura               │
│    - Obtener número correlativo         │
│    - Guardar factura                    │
│    - Guardar líneas                     │
│    - Descontar stock por lote           │
│    - Registrar movimientos stock        │
│    - Registrar trazabilidad             │
│    - Generar PDF                        │
│    [TODO EN TRANSACCIÓN]                │
└──────┬──────────────────────────────────┘
       │
       ▼                     ┌─────────────────┐
┌──────────────────────┐    │ ¿Error?         │
│ ¿Transacción OK?    │────▶│ SÍ: rollback    │
│                     │     │     mostrar error│
└──────┬──────────────┘     └─────────────────┘
       │ OK
       ▼
┌────────────────────────────┐
│ 7. Imprimir Factura        │
│    - PDF generado          │
│    - Enviar a impresora    │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 8. Registrar Pago          │
│    (Opcional, si es        │
│     contado)               │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
│  Factura generada          │
│  Stock actualizado         │
└────────────────────────────┘
```

#### 2.2.2. Reglas de Negocio Facturación

| Regla | Descripción |
|-------|-------------|
| **RN-FACT-01** | Número de factura es correlativo por serie y año |
| **RN-FACT-02** | No se puede facturar sin stock disponible (excepción: stock negativo si configurado) |
| **RN-FACT-03** | Cada línea de factura debe tener lote asignado (trazabilidad) |
| **RN-FACT-04** | Factura genera automáticamente movimientos de stock tipo SALIDA_VENTA |
| **RN-FACT-05** | Factura genera automáticamente registros de trazabilidad |
| **RN-FACT-06** | PDF se genera asíncronamente para no bloquear UI |
| **RN-FACT-07** | Si transacción falla, todo se revierte (ACID) |
| **RN-FACT-08** | Factura anulada no descuenta stock (o lo devuelve si ya se descontó) |

---

### 2.3. FLUJO: Pedido → Albarán → Factura

**Actores:** Usuario Obrador  
**Objetivo:** Gestión completa desde pedido hasta factura  
**Frecuencia:** Variable

#### 2.3.1. Diagrama de Flujo Completo

```
┌──────────────┐
│  INICIO      │
│  Cliente hace│
│  pedido      │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Crear Pedido            │
│    - Cliente               │
│    - Fecha pedido          │
│    - Fecha entrega         │
│    - Productos + cantidades│
│    - Estado: PENDIENTE     │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. Confirmar Pedido        │
│    Estado: CONFIRMADO      │
│    (Opcional: reservar     │
│     stock temporalmente)   │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 3. Preparar Pedido         │
│    Estado: EN_PREPARACION  │
│    - Picking de productos  │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Generar Albarán desde   │
│    Pedido                  │
│    - Auto-asignar lotes    │
│    - Crear albarán         │
│    - Descontar stock       │
│    - Estado pedido: SERVIDO│
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 5. Entregar Mercancía      │
│    - Imprimir albarán      │
│    - Cliente firma         │
│    - Marcar como entregado │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 6. (TIEMPO DESPUÉS)        │
│    Facturar Albaranes      │
│    - Seleccionar albaranes │
│    - Generar factura       │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 7. Factura Generada        │
│    - Vincular con albaranes│
│    - Marcar albaranes como │
│      facturados            │
│    - NO descontar stock    │
│      (ya se hizo en albarán│
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
│  Ciclo completo            │
└────────────────────────────┘
```

#### 2.3.2. Estados y Transiciones

**Estados de Pedido:**
```
PENDIENTE ──(Confirmar)──▶ CONFIRMADO ──(Preparar)──▶ EN_PREPARACION
                                                             │
                                                             ▼
                                                          SERVIDO
                                                             │
    ┌──────────────(Cancelar)─────────────────────────────┘
    ▼
CANCELADO
```

**Estados de Albarán:**
```
PENDIENTE ──(Marcar entregado)──▶ ENTREGADO ──(Facturar)──▶ FACTURADO
    │
    └──(Cancelar)──▶ CANCELADO
```

#### 2.3.3. Reglas de Negocio

| Regla | Descripción |
|-------|-------------|
| **RN-PED-01** | Pedido puede modificarse solo si estado = PENDIENTE |
| **RN-PED-02** | Confirmar pedido puede reservar stock (opcional) |
| **RN-PED-03** | Generar albarán desde pedido copia todos los datos |
| **RN-ALB-01** | Albarán descuenta stock cuando se genera |
| **RN-ALB-02** | Un albarán solo puede facturarse una vez |
| **RN-ALB-03** | Factura desde albarán NO descuenta stock (ya está descontado) |
| **RN-ALB-04** | Se pueden agrupar múltiples albaranes en una factura |
| **RN-ALB-05** | Albarán cancelado debe devolver stock |

---

### 2.4. FLUJO: Gestión de Stock y Ajustes

**Actores:** Usuario Obrador (Almacén)  
**Objetivo:** Mantener stock actualizado y corregir discrepancias  
**Frecuencia:** Según necesidad

#### 2.4.1. Operaciones de Stock

**2.4.1.1. Ajuste de Inventario**

```
┌──────────────┐
│  INICIO      │
│  Inventario  │
│  físico      │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Seleccionar Producto    │
│    y Lote                  │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. Ver Stock Sistema       │
│    Stock actual: 45 cajas  │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 3. Introducir Stock Físico │
│    Stock real: 42 cajas    │
│    Diferencia: -3 cajas    │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Motivo del Ajuste       │
│    - Merma                 │
│    - Error conteo anterior │
│    - Rotura                │
│    - Otros                 │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 5. Confirmar Ajuste        │
│    - Actualizar stock      │
│    - Registrar movimiento  │
│    - Auditar cambio        │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
│  Stock corregido           │
└────────────────────────────┘
```

**2.4.1.2. Bloqueo de Lote (Incidencia de Calidad)**

```
┌──────────────┐
│  INICIO      │
│  Problema    │
│  calidad     │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Identificar Lote        │
│    Lote: 20022026          │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. Bloquear Lote           │
│    bloqueado = TRUE        │
│    Motivo: [descripción]   │
└──────┬─────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 3. SISTEMA: Lote Bloqueado              │
│    - No se asignará en ventas futuras   │
│    - Stock queda disponible pero no     │
│      asignable hasta desbloqueado       │
└──────┬──────────────────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Trazabilidad Inversa    │
│    ¿Se vendió algo de      │
│     este lote?             │
│    - Consultar clientes    │
│    - Notificar si necesario│
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 5. Resolución              │
│    - Destruir lote         │
│    - Desbloquear si OK     │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
└────────────────────────────┘
```

---

### 2.5. FLUJO: Consulta de Trazabilidad (Auditoría)

**Actores:** Usuario Obrador, Auditor  
**Objetivo:** Rastrear origen y destino de lotes  
**Frecuencia:** Bajo demanda, auditorías

#### 2.5.1. Trazabilidad Directa (Lote → Clientes)

```
┌──────────────┐
│  INICIO      │
│  Consultar   │
│  lote        │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Buscar Lote             │
│    Código: 20022026        │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. Datos del Lote          │
│    - Producto: Palmeras    │
│    - Fecha fab: 20/02/2026 │
│    - Fecha cad: 27/02/2026 │
│    - Cantidad prod: 50     │
│    - Cantidad vendida: 38  │
│    - Cantidad resto: 12    │
└──────┬─────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 3. Ventas del Lote (Trazabilidad)      │
│    ┌───────────────────────────────────┐│
│    │ Cliente A - Fac A/001 - 10 uds   ││
│    │ Cliente B - Fac A/005 - 15 uds   ││
│    │ Cliente C - Fac A/012 - 8 uds    ││
│    │ Cliente D - Fac A/018 - 5 uds    ││
│    └───────────────────────────────────┘│
└──────┬──────────────────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Exportar Informe        │
│    - PDF                   │
│    - Excel                 │
│    - Para auditoría        │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
│  Trazabilidad completa     │
└────────────────────────────┘
```

#### 2.5.2. Trazabilidad Inversa (Cliente → Lotes)

```
Buscar por Cliente → Ver todas sus facturas → Ver lotes recibidos
```

---

## 3. FLUJOS DE REPARTIDOR

### 3.1. FLUJO: Facturación Rápida (CORE)

**Actores:** Usuario Repartidor  
**Objetivo:** Generar factura en < 30 segundos  
**Frecuencia:** Muy alta (múltiples por hour)

#### 3.1.1. Flujo Optimizado

```
┌──────────────┐
│  INICIO      │
│  Repartidor  │
│  con cliente │
└──────┬───────┘
       │
       ▼                          ┌─────────────────┐
┌────────────────────────┐       │ Autocompletar   │
│ 1. Buscar Cliente      │──────▶│ Nombre, Sugerir │
│    Escribir nombre...  │       │ clientes previos│
└──────┬─────────────────┘       └─────────────────┘
       │ (2 segundos)
       ▼
┌────────────────────────┐
│ 2. Cliente Seleccionado│
│    Juan Pérez          │
└──────┬─────────────────┘
       │
       ▼                          ┌─────────────────┐
┌────────────────────────┐       │ Búsqueda rápida │
│ 3. Buscar Producto     │──────▶│ Código, nombre  │
│    "palm" → Palmeras   │       │ Autocompletar   │
└──────┬─────────────────┘       └─────────────────┘
       │ (2 segundos)
       ▼
┌────────────────────────┐       ┌─────────────────┐
│ 4. Cantidad            │       │ Stock disp:     │
│    10 [ENTER]          │──────▶│ 45 cajas        │
└──────┬─────────────────┘       └─────────────────┘
       │ (1 segundo)
       ▼                          ┌─────────────────┐
┌────────────────────────┐       │ ¿Más productos? │
│ 5. Añadir Más         │       │ SÍ: repetir 3-4│
│    (Repetir 3-4)      │──────▶│ NO: continuar   │
└──────┬─────────────────┘       └─────────────────┘
       │ NO (5-10 segundos total añadiendo 3-5 productos)
       ▼
┌─────────────────────────────────────────┐
│ 6. SISTEMA: Asignación Auto Lotes       │
│    [INVISIBLE PARA USUARIO]             │
│    - Por cada producto, ejecutar FIFO   │
│    - Crear líneas con lotes            │
│    - Calcular totales                   │
│    (< 1 segundo)                        │
└──────┬──────────────────────────────────┘
       │
       ▼
┌────────────────────────┐       ┌─────────────────────┐
│ 7. Vista Previa        │       │ Factura A/2026/0523 │
│    Factura             │       │ Cliente: Juan Pérez │
│    (Generada auto)     │──────▶│ 10 líneas (con lotes│
│                        │       │ Total: 145.50€      │
└──────┬─────────────────┘       └─────────────────────┘
       │ (2 segundos revisar)
       ▼
┌────────────────────────┐
│ 8. [CONFIRMAR]         │
│    1 click             │
└──────┬─────────────────┘
       │ (1 segundo)
       ▼
┌─────────────────────────────────────────┐
│ 9. SISTEMA: Crear Factura Completa      │
│    - Guardar factura                    │
│    - Descontar stock                    │
│    - Registrar trazabilidad             │
│    - Generar PDF                        │
│    (1-2 segundos)                       │
└──────┬──────────────────────────────────┘
       │
       ▼
┌────────────────────────┐       ┌─────────────────────┐
│ 10. [IMPRIMIR]         │──────▶│ Enviar a impresora  │
│     1 click            │       │ predeterminada      │
└──────┬─────────────────┘       └─────────────────────┘
       │ (3-5 segundos impresión)
       ▼
┌────────────────────────┐
│  FIN                   │
│  ⏱ TOTAL: < 30 seg    │
│  Factura impresa       │
│  Cliente satisfecho    │
└────────────────────────┘
```

#### 3.1.2. Optimizaciones UX Críticas

| Optimización | Descripción | Impacto |
|--------------|-------------|---------|
| **Autocompletado** | Sugerir clientes y productos al escribir | -50% tiempo búsqueda |
| **Últimos clientes** | Mostrar últimos 10 clientes al inicio | Acceso 1 click a frecuentes |
| **Favoritos/Frecuentes** | Productos más vendidos primero en lista | Menos scroll |
| **Código rápido** | Permitir introducir producto por código | 1 segundo vs búsqueda |
| **Enter para avanzar** | Navegación por teclado sin mouse | Fluidez workflow |
| **Vista previa inline** | Ver total cumulativo al añadir productos | Sin paso adicional |
| **Impresión auto** | Opcional: imprimir sin confirmación | -3 segundos |
| **Atajos teclado** | F2=Nuevo, F3=Buscar, Ctrl+Enter=Confirmar | Power users |

#### 3.1.3. UI Mock (Textual)

```
┌─────────────────────────────────────────────────────────────┐
│ NUEVA FACTURA                                    [X] Cerrar │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Cliente: [Juan Pérez ▼]  [F3] Buscar  [Nuevo]              │
│          Últimos: Juan, María, Panadería Sol...            │
│                                                             │
│ ─────────────────────────────────────────────────────────  │
│                                                             │
│ Añadir Producto:                                           │
│ [Buscar producto... palm]  [Código: ____]                  │
│   ▼ Palmeras - Precio: 12.50€ - Stock: 45                  │
│   ▼ Palmiers - Precio: 10.00€ - Stock: 23                  │
│                                                             │
│ Cantidad: [10____] [AÑADIR] o [ENTER]                      │
│                                                             │
│ ─────────────────────────────────────────────────────────  │
│                                                             │
│ LÍNEAS FACTURA:                                             │
│ ┌───┬─────────────────┬──────┬────────┬─────────┐          │
│ │ # │ Producto        │ Cant │ Precio │ Total   │          │
│ ├───┼─────────────────┼──────┼────────┼─────────┤          │
│ │ 1 │ Palmeras        │  10  │ 12.50  │ 125.00  │          │
│ │ 2 │ Galletas Manteca│   5  │  8.00  │  40.00  │          │
│ │ 3 │ Bizcocho Limón  │   3  │ 15.00  │  45.00  │          │
│ └───┴─────────────────┴──────┴────────┴─────────┘          │
│                                                             │
│                                   Subtotal:    210.00€     │
│                                   IVA (10%):    21.00€     │
│                                   ════════════════════     │
│                                   TOTAL:       231.00€     │
│                                                             │
│ ─────────────────────────────────────────────────────────  │
│                                                             │
│          [GENERAR FACTURA]     [Cancelar]                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Atajos:
F2: Nueva factura
F3: Buscar cliente
Ctrl+P: Añadir producto
Ctrl+Enter: Generar factura
ESC: Cancelar
```

---

### 3.2. FLUJO: Consulta de Stock Disponible

**Actores:** Usuario Repartidor  
**Objetivo:** Verificar disponibilidad antes de vender  
**Frecuencia:** Alta

```
┌──────────────┐
│  INICIO      │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Acceder a "Stock"       │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐       ┌─────────────────────┐
│ 2. Ver Catálogo con Stock  │       │ Lista productos:    │
│                            │──────▶│ - Palmeras: 45 uds  │
│                            │       │ - Galletas: 23 uds  │
│                            │       │ - Bizcochos: 12 uds │
└──────┬─────────────────────┘       └─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 3. Filtrar/Buscar          │
│    Categoría: Bollería     │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Detalle Producto        │
│    (Opcional)              │
│    - Stock total           │
│    - Lotes disponibles     │
│    - Próximas caducidades  │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
│  Info consultada           │
└────────────────────────────┘
```

---

### 3.3. FLUJO: Gestión de Clientes Propios

**Actores:** Usuario Repartidor  
**Objetivo:** Gestionar su cartera de clientes  
**Frecuencia:** Media

```
┌──────────────┐
│  INICIO      │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Acceder a "Mis Clientes"│
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐       ┌─────────────────────┐
│ 2. Ver Lista Clientes      │       │ Solo clientes del   │
│    (Solo los suyos)        │──────▶│ repartidor actual   │
│                            │       │ (filtro empresa_id) │
└──────┬─────────────────────┘       └─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 3. [Nuevo Cliente]         │
│    - Nombre                │
│    - NIF/CIF               │
│    - Dirección             │
│    - Teléfono              │
│    - Email                 │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Guardar Cliente         │
│    repartidor_empresa_id   │
│    = empresa del repartidor│
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
│  Cliente creado/editado    │
└────────────────────────────┘
```

**Regla:** Repartidor solo ve y gestiona sus propios clientes, no los del obrador ni de otros repartidores.

---

## 4. FLUJOS ADMINISTRATIVOS

### 4.1. FLUJO: Cierre Diario / Reporting

**Actores:** Usuario Obrador (Admin)  
**Objetivo:** Resumen del día  
**Frecuencia:** Diaria

```
┌──────────────┐
│  INICIO      │
│  Fin jornada │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Acceder a "Informes"    │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. Seleccionar "Cierre     │
│    Diario"                 │
│    Fecha: HOY              │
└──────┬─────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 3. SISTEMA: Generar Informe             │
│    ┌───────────────────────────────────┐│
│    │ Ventas del día                    ││
│    │ - Total facturado: 1.245,50€      ││
│    │ - Nº facturas: 23                 ││
│    │ - Clientes atendidos: 18          ││
│    │                                   ││
│    │ Producción del día                ││
│    │ - Palmeras: 50 uds                ││
│    │ - Galletas: 30 uds                ││
│    │                                   ││
│    │ Estado stock                      ││
│    │ - Productos bajo mínimo: 3        ││
│    │ - Lotes próximos caducar: 2       ││
│    │                                   ││
│    │ Movimientos stock: 45             ││
│    └───────────────────────────────────┘│
└──────┬──────────────────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Exportar Informe        │
│    - PDF                   │
│    - Excel                 │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
└────────────────────────────┘
```

---

### 4.2. FLUJO: Gestión de Usuarios y Permisos

**Actores:** Admin  
**Objetivo:** Alta/baja usuarios, asignar roles  
**Frecuencia:** Baja

```
┌──────────────┐
│  INICIO      │
└──────┬───────┘
       │
       ▼
┌────────────────────────────┐
│ 1. Acceder a "Usuarios"    │
│    (Solo Admin)            │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 2. [Nuevo Usuario]         │
│    - Username              │
│    - Password              │
│    - Email                 │
│    - Nombre                │
│    - Empresa asociada      │
│    - Rol: [ADMIN/OBRADOR/  │
│           REPARTIDOR]      │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 3. Asignar Permisos        │
│    (Según rol)             │
│    - Ver stock             │
│    - Crear factura         │
│    - Gestionar producción  │
│    - Ver reporting         │
│    - etc.                  │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ 4. Guardar Usuario         │
│    - Password hasheado     │
│    - Auditar creación      │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  FIN                       │
│  Usuario activo            │
└────────────────────────────┘
```

---

## 5. INTEGRACIONES Y AUTOMATIZACIONES

### 5.1. Alertas Automáticas

**Triggers automáticos del sistema:**

| Alerta | Condición | Acción |
|--------|-----------|--------|
| **Stock bajo** | `stock.cantidad < producto.stock_minimo` | Email/notificación a responsable |
| **Lote próximo caducar** | `lote.fecha_caducidad < HOY + 7 días` | Panel de alerta + email |
| **Lote caducado** | `lote.fecha_caducidad < HOY` | Bloquear automáticamente |
| **Error en factura** | Fallo en generación PDF | Log + alerta a admin |
| **Stock negativo** | `stock.cantidad < 0` (si permitido) | Alerta inmediata |

### 5.2. Tareas Programadas (Cron Jobs)

```
Diarias (00:00):
- Backup base de datos
- Archivar logs antiguos
- Enviar resumen diario por email
- Verificar lotes próximos caducar

Semanales (domingo 02:00):
- Limpieza de sesiones expiradas
- Reindexado de tablas (maintenance)
- Informe semanal de ventas

Mensuales (día 1, 03:00):
- Cierre mensual
- Informe fiscal básico
- Limpieza de auditoría > 6 meses (opcional)
```

---

## 6. MANEJO DE EXCEOCIONES Y ERRORES

### 6.1. Errores Comunes y Resolución

| Error | Causa | Solución Usuario | Solución Sistema |
|-------|-------|------------------|------------------|
| **Stock insuficiente** | Cantidad solicitada > disponible | Reducir cantidad o cancelar | Mostrar cantidad disponible |
| **Lote no disponible** | Lote caducado o bloqueado | Sistema auto-selecciona otro | Algoritmo FIFO ignora no disponibles |
| **Factura duplicada** | Doble click en generar | Prevenir UI | Validar número único en DB |
| **Cliente no encontrado** | ID inválido | Buscar de nuevo | Validar FK en API |
| **Error PDF** | Fallo generador | Reintentar, imprimir desde histórico | Log error, generar async |
| **Transacción fallida** | Error DB connection | Reintentar operación | Rollback automático |

### 6.2. Rollback y Recuperación

**Escenario:** Fallo al crear factura después de descontar stock

```sql
BEGIN TRANSACTION;
  -- Crear factura
  INSERT INTO facturas (...);
  
  -- Descontar stock
  UPDATE stock SET cantidad = cantidad - 10 ...;
  
  -- Si algo falla aquí...
  INSERT INTO facturas_lineas (...); -- ERROR!
  
ROLLBACK; -- Stock se restaura automáticamente
```

**Sistema garantiza:** ACID compliance, no hay inconsistencias.

---

## 7. CONCLUSIÓN

### Flujos Diseñados Para:

✅ **Eficiencia operativa máxima**  
✅ **Minimizar errores humanos**  
✅ **Trazabilidad automática completa**  
✅ **UX optimizada por rol**  
✅ **Procesos claros y documentados**  
✅ **Manejo robusto de excepciones**  
✅ **Escalabilidad de procesos**  

**Próximo documento:** MVP y Roadmap de desarrollo
