# SISTEMA BUENATIERRA — FUNCIONALIDAD ACTUAL

**Versión:** 1.0 MVP  
**Fecha:** Febrero 2026  
**Estado:** En producción (entorno de desarrollo)

---

## ¿QUÉ ES EL SISTEMA BUENATIERRA?

BuenaTierra es un sistema de gestión digital diseñado específicamente para obradores de pastelería y dulces. Digitaliza completamente los procesos de producción, gestión de stock, lotes y facturación, eliminando el trabajo manual y los errores humanos.

El sistema está disponible desde cualquier navegador web (Chrome, Edge, Firefox) en el ordenador del obrador o desde cualquier dispositivo con internet.

---

## ACCESO Y SEGURIDAD

### Login con usuario y contraseña
- Acceso mediante email y contraseña personal
- Sesión segura con token JWT (expira automáticamente)
- Cierre de sesión manual desde el menú lateral
- Los datos de cada empresa están completamente separados: ningún usuario puede ver datos de otra empresa

### Roles de usuario
| Rol | Acceso |
|---|---|
| **Admin** | Acceso completo al sistema, configuración, gestión de usuarios |
| **Usuario Obrador** | Producción, stock, clientes, productos, facturas |
| **Repartidor** | Su propia facturación y acceso al catálogo del obrador |

---

## PANEL DE CONTROL (DASHBOARD)

Nada más entrar, el usuario ve:

- **Tarjetas de resumen:** número total de productos, clientes y lotes activos
- **Tabla de stock en tiempo real:** todos los productos con su stock disponible por lote, mostrando código de lote, fecha de fabricación, fecha de caducidad y cantidad disponible
- **Actualización automática:** los datos se refrescan para mostrar siempre el estado actual

---

## GESTIÓN DE PRODUCTOS

### ¿Qué puede hacer?
- Ver el catálogo completo de productos del obrador
- **Crear nuevos productos** con todos sus datos:
  - Nombre y descripción
  - Precio de venta
  - IVA aplicable (%)
  - Si requiere trazabilidad por lote (sí/no)
  - Stock mínimo de alerta
- **Editar** la información de cualquier producto
- **Desactivar** productos sin eliminarlos (conserva el historial)

### Datos de cada producto
Cada producto almacena: nombre, descripción, precio de venta, porcentaje de IVA, si necesita lote para trazabilidad, stock mínimo de alerta, estado activo/inactivo.

---

## GESTIÓN DE CLIENTES

### ¿Qué puede hacer?
- Ver la lista completa de clientes de la empresa
- **Crear nuevos clientes** (empresas, autónomos o particulares) con:
  - Nombre o razón social
  - NIF/CIF (obligatorio para facturación ordinaria)
  - Dirección completa
  - Teléfono y email
  - Condiciones de pago
  - Descuento general aplicable
  - Notas internas
- **Editar** datos de clientes existentes
- **Desactivar** clientes sin perder el historial

### Tipos de cliente
- **Particular:** persona física sin NIF obligatorio
- **Autónomo:** persona física con NIF
- **Empresa:** persona jurídica con CIF
- **Repartidor:** empresa intermediaria que revende (tipo especial con acceso propio al sistema)

---

## PRODUCCIÓN Y LOTES

### ¿Qué hace este módulo?
Registra cada producción diaria del obrador. Al registrar una producción, el sistema **genera automáticamente un lote** con el número de lote basado en la fecha (formato DDMMAAAA).

### Flujo de producción
1. El usuario indica: producto, fecha de producción, cantidad producida (y merma si la hay)
2. El sistema crea el lote con código único
3. El lote queda disponible en stock automáticamente
4. La producción puede tener tres estados: **Planificada → En curso → Finalizada** (o Cancelada)

### Datos del lote generado
Cada lote almacena automáticamente:
- **Código de lote** (ej: `17022026` para producción del 17/02/2026)
- **Fecha de fabricación**
- **Fecha de caducidad** (si aplica)
- **Cantidad inicial producida**
- **Estado:** vigente, caducado o bloqueado

### Control en tiempo real
- La lista de producciones se actualiza automáticamente cada 30 segundos
- Se pueden finalizar o cancelar producciones desde la pantalla
- Una producción cancelada NO añade stock

---

## FACTURACIÓN CON ASIGNACIÓN AUTOMÁTICA DE LOTES (FIFO)

Este es el **módulo más avanzado del sistema** y resuelve el problema central del obrador.

### El problema que resuelve
Antes: Para facturar 10 cajas de palmeras con 3 lotes distintos, había que escribir manualmente cada lote (3 líneas diferentes, con sus fechas y cantidades). Error humano, lentitud, trabajo tedioso.

**Ahora:** El usuario solo indica "10 cajas de palmeras". El sistema **asigna los lotes automáticamente por FIFO** (primero fabricado, primero vendido) y genera las líneas necesarias sin intervención manual.

### Ejemplo real de FIFO automático
```
Usuario solicita: 10 cajas de Palmeras

Stock disponible:
- Lote 17022026-A: 3 cajas
- Lote 18022026-B: 4 cajas  
- Lote 19022026-C: 3 cajas

Factura generada AUTOMÁTICAMENTE:
- Línea 1: 3 cajas Palmeras — Lote 17022026-A (Fab: 17/02/2026)
- Línea 2: 4 cajas Palmeras — Lote 18022026-B (Fab: 18/02/2026)
- Línea 3: 3 cajas Palmeras — Lote 19022026-C (Fab: 19/02/2026)
```

**Cero escritura manual. Cero errores. Máxima velocidad.**

### Proceso de creación de factura
1. Seleccionar cliente
2. Seleccionar serie de facturación
3. Añadir líneas: producto + cantidad (el precio viene del catálogo)
4. Pulsar "Crear Factura"
5. El sistema asigna lotes FIFO, calcula totales y genera la factura

### Qué genera el sistema automáticamente
- **Número de factura** correlativo y automático por serie (ej: F2026-2026000001)
- **Líneas de factura** con detalle de lote por cada línea
- **Cálculo de IVA** por línea y total
- **Base imponible, IVA total, Total**
- **Descuento de stock** por cada lote consumido
- **Registro de trazabilidad** (lote → cliente → fecha, conforme al Reglamento CE 178/2002)
- **Movimientos de stock** para auditoría completa

### Vista de facturas
- Lista de todas las facturas con filtros por fecha
- Detalle completo de cada factura con todas sus líneas y lotes
- Estado de cada factura (Emitida, Pagada, Anulada...)

---

## EXPORTACIÓN PDF (FACTURAS)

Cada factura puede descargarse en PDF listo para imprimir o enviar por email.

### Contenido del PDF de factura
- **Cabecera:** Datos completos de la empresa (razón social, NIF, dirección, teléfono, email)
- **Datos de factura:** Número, fecha, estado, tipo (ordinaria/simplificada)
- **Datos del cliente:** Nombre, NIF/CIF, dirección
- **Tabla de líneas** con columnas:
  - Producto
  - **Nº Lote** ← obligatorio para trazabilidad
  - **Fecha Fabricación** ← obligatorio para trazabilidad
  - **Fecha Caducidad** ← obligatorio para trazabilidad
  - Cantidad, Precio unitario, Descuento %, IVA %, Total línea
- **Totales:** Base imponible, IVA, Total en destaque
- **Pie de página:** Nota de trazabilidad conforme al Reglamento (CE) Nº 178/2002
- Paginación automática

**Formato:** PDF/A listo para archivo legal

---

## EXPORTACIÓN EXCEL CON TRAZABILIDAD (FACTURAS)

Cada factura puede descargarse también en formato Excel `.xlsx` con dos hojas:

### Hoja 1 — "Factura"
Datos completos de la factura (empresa vendedora, cliente, totales, fechas, estado).

### Hoja 2 — "Trazabilidad Lotes"
Tabla con **cada línea de factura incluyendo toda la información de trazabilidad**, con estas columnas:

| Columna | Descripción |
|---|---|
| Nº Línea | Orden de la línea |
| Producto | Nombre del artículo |
| **Código Lote** | **Número de lote obligatorio** |
| **Fecha Fabricación** | **Fecha de producción del lote** |
| **Fecha Caducidad** | **Fecha límite de consumo** |
| Cantidad | Unidades vendidas |
| Precio Unitario | Precio sin IVA |
| Descuento % | Descuento aplicado |
| IVA % | Tipo impositivo |
| Subtotal s/IVA | Base de la línea |
| IVA Importe | Cuota de IVA |
| Total Línea | Total con IVA |
| **Empresa Vendedora** | **NIF del vendedor** |
| **NIF Vendedor** | Para trazabilidad |
| **Cliente** | Destinatario |
| **NIF Cliente** | Para trazabilidad |
| Nº Factura | Referencia |
| Fecha Factura | Fecha de la operación |

La cabecera incluye el texto: *"Conforme al Reglamento (CE) Nº 178/2002 del Parlamento Europeo"*

---

## INFORME DE TRAZABILIDAD ALIMENTARIA (MINISTERIO DE SANIDAD)

Disponible mediante descarga Excel, este informe cubre **todas las operaciones del período** que se indique (semana, mes, año, etc.).

### ¿Para qué sirve?
- Cumplimiento del **Reglamento (CE) Nº 178/2002** sobre trazabilidad alimentaria
- Documentación para **inspecciones sanitarias**
- Registro del **APPCC** (Análisis de Peligros y Puntos de Control Críticos)
- **Trazabilidad hacia adelante:** saber a qué cliente llegó cada lote
- Respuesta rápida ante una **alerta alimentaria o retirada de producto**

### Contenido del informe
El informe Excel incluye una cabecera con:
- Nombre y NIF de la empresa
- Período del informe
- Texto legal: *"Conforme al Reglamento (CE) Nº 178/2002 del Parlamento Europeo y del Consejo"*

Y una tabla con **cada movimiento de producto** trazado:

| Campo | Contenido |
|---|---|
| Fecha y hora | Registro exacto de la operación |
| Tipo de operación | venta_factura, producción, ajuste, etc. |
| **Producto** | Nombre del artículo |
| **Nº Lote** | Código del lote |
| **Fecha Fabricación** | Cuándo se produjo |
| **Fecha Caducidad** | Vencimiento del lote |
| Cantidad | Unidades trazadas |
| **Cliente** | A quién llegó el producto |
| **NIF Cliente** | Identificación fiscal |
| **Nº Factura** | Documento que ampara el movimiento |
| Fecha Factura | Fecha del documento |

### Acceso al informe
`GET /api/facturas/trazabilidad/excel?desde=2026-01-01&hasta=2026-12-31`

---

## ENDPOINTS DE LA API (PARA DESARROLLADORES)

### Autenticación
| Método | URL | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Obtener token JWT |
| POST | `/api/auth/logout` | Cerrar sesión |

### Productos
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/productos` | Listar productos activos |
| POST | `/api/productos` | Crear producto |
| PUT | `/api/productos/{id}` | Editar producto |
| DELETE | `/api/productos/{id}` | Desactivar producto |

### Clientes
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/clientes` | Listar clientes activos |
| POST | `/api/clientes` | Crear cliente |
| PUT | `/api/clientes/{id}` | Editar cliente |

### Producción
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/produccion` | Listar producciones |
| POST | `/api/produccion` | Registrar producción → genera lote y stock |
| PUT | `/api/produccion/{id}/finalizar` | Finalizar producción |
| PUT | `/api/produccion/{id}/cancelar` | Cancelar producción |

### Stock
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/stock/todos` | Ver todo el stock por lote |
| GET | `/api/stock/producto/{id}` | Resumen de stock de un producto |
| GET | `/api/stock/alertas` | Productos bajo mínimo |
| POST | `/api/stock/ajuste` | Ajuste manual de stock |

### Facturas
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/facturas` | Listar facturas (con filtros de fecha) |
| GET | `/api/facturas/{id}` | Detalle completo de factura con lotes |
| POST | `/api/facturas/crear` | **Crear factura con FIFO automático** |
| GET | `/api/facturas/{id}/pdf` | **Descargar PDF** de la factura |
| GET | `/api/facturas/{id}/excel` | **Descargar Excel con trazabilidad** |
| GET | `/api/facturas/trazabilidad/excel` | **Informe trazabilidad Sanidad** (por fechas) |

### Series de Facturación
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/series` | Listar series activas de la empresa |
| POST | `/api/series` | Crear nueva serie (solo Admin) |

---

## CARACTERÍSTICAS TÉCNICAS

| Aspecto | Detalle |
|---|---|
| **Tipo de aplicación** | Web (navegador), acceso desde cualquier dispositivo |
| **Base de datos** | PostgreSQL 15 (servidor Docker) |
| **Backend** | .NET 9 / C# |
| **Frontend** | React + TypeScript + Tailwind CSS |
| **Autenticación** | JWT (JSON Web Token) con expiración automática |
| **PDF** | QuestPDF (generación nativa .NET) |
| **Excel** | EPPlus 8 (sin dependencias de Office) |
| **Multiempresa** | Datos completamente segregados por empresa |
| **FIFO Motor** | Transacción ACID garantizada |
| **Trazabilidad DB** | Tabla `trazabilidad` con registro de cada movimiento |

---

## LO QUE VIENE EN PRÓXIMAS VERSIONES

### Prioridad ALTA
- [ ] Módulo de Albaranes (previo a factura)
- [ ] Módulo de Pedidos
- [ ] Página de gestión de Lotes (ver FIFO pendiente, bloquear lotes)
- [ ] Página de Alertas de stock en tiempo real
- [ ] Gestión de usuarios (alta, baja, cambio de contraseña)

### Prioridad MEDIA
- [ ] Sistema para Repartidores (su propia interfaz de facturación)
- [ ] Impresión directa de facturas desde el navegador
- [ ] Descarga directa del PDF desde la interfaz web (botón en pantalla)
- [ ] Informes de ventas y rentabilidad

### Prioridad BAJA
- [ ] Integración contable (exportación a gestoría)
- [ ] Preparación SII (AEAT)
- [ ] App móvil o PWA para repartidores
- [ ] Análisis y estadísticas avanzadas

---

## CUMPLIMIENTO LEGAL

| Normativa | Estado |
|---|---|
| Reglamento (CE) Nº 178/2002 — Trazabilidad alimentaria | ✅ IMPLEMENTADO |
| Numeración correlativa de facturas | ✅ IMPLEMENTADO |
| Factura ordinaria con NIF comprador/vendedor | ✅ IMPLEMENTADO |
| Factura simplificada | ✅ IMPLEMENTADO |
| Registro de lotes en documentos comerciales | ✅ IMPLEMENTADO |
| Informe de trazabilidad exportable para inspección | ✅ IMPLEMENTADO |
| SII / Integración AEAT | 🔜 Fase futura |
| Libro de reclamaciones digital | 🔜 Fase futura |

---

*Documento generado para uso interno del equipo y presentación al cliente.*  
*Sistema desarrollado con tecnología profesional escalable. Arquitectura preparada para crecer.*
