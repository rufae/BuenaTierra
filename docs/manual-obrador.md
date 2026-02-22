# Manual de Usuario — Obrador / Oficina

**Sistema BuenaTierra — Versión 1.0**  
**Rol:** `Admin` / `UsuarioObrador`

---

## 1. Acceso al sistema

1. Abrir navegador → `http://[servidor]:5173` (o la URL asignada)
2. Introducir email y contraseña
3. El sistema detecta el rol automáticamente y muestra el menú correspondiente

---

## 2. Panel de control (Dashboard)

El dashboard tiene 3 pestañas:

| Pestaña | Contenido |
|---------|-----------|
| **Resumen** | 8 KPIs: facturas hoy, importe mes, pedidos pendientes, clientes, alertas stock, lotes a caducar, producción hoy |
| **Ventas** | KPIs de ventas + listado ultimas facturas |
| **Operaciones** | Estado pedidos pendientes, alertas stock, lotes próximos a caducar |

**Actualización automática:** cada 60 segundos. Botón "Actualizar" para refrescar manualmente.

---

## 3. Facturación

### 3.1 Crear factura
1. Menú → **Facturación** → botón **Nueva factura**
2. Seleccionar cliente (o crear nuevo)
3. Seleccionar serie de facturación
4. Añadir líneas de producto:
   - Buscar producto por nombre
   - Indicar cantidad
   - **Los lotes se asignan automáticamente (FIFO)** — no hay que escribirlos
5. Revisar totales (base + IVA)
6. Guardar → se genera número de factura automático

### 3.2 Convertir Albarán → Factura
1. Menú → **Albaranes**
2. Seleccionar albarán deseado
3. Botón **Facturar** → se crea la factura automáticamente

### 3.3 Factura simplificada
- Al crear factura, marcar **"Factura simplificada"** si no se requiere CIF de cliente

### 3.4 Exportar a Excel
- En la cabecera de Reportes → botón **Excel** → descarga informe en `.xlsx`

---

## 4. Gestión de productos

1. Menú → **Productos**
2. Acciones disponibles:
   - **Crear** producto: nombre, código, precio, unidad, IVA, stock mínimo
   - **Editar** datos del producto
   - **Ver ficha**: alérgenos, ingredientes, trazabilidad
   - **Asignar ingredientes** con sus alérgenos

### 4.1 Ingredientes
- Menú → **Ingredientes**
- Crear ingredientes y asociarles alérgenos (de los 14 alérgenos reglamentarios)
- Asociar ingredientes a productos para trazabilidad legal

---

## 5. Gestión de producción

1. Menú → **Producción** → **Registrar producción**
2. Seleccionar producto y cantidad producida
3. Indicar merma si la hay
4. El sistema **crea automáticamente un lote** (formato 14MMAAAA o personalizable)
5. El stock se actualiza inmediatamente

---

## 6. Gestión de lotes

- Menú → **Lotes**
- Vista completa de todos los lotes activos
- Filtros: por producto, por fecha, por estado
- Acciones: bloquear lote (no se asignará en futuras ventas), ver movimientos

**Alertas automáticas:**
- 🔴 Lotes caducados (bloqueados automáticamente)
- 🟠 Lotes que caducan en los próximos 5 días
- 🔴 Productos con stock por debajo del mínimo

---

## 7. Gestión de clientes

1. Menú → **Clientes**
2. Crear/editar clientes: nombre, CIF/NIF, dirección, teléfono, email
3. Tipo de cliente: Empresa / Autónomo / Particular / Repartidor
4. Historial de compras disponible desde la ficha del cliente

---

## 8. Pedidos

1. Menú → **Pedidos** → **Nuevo pedido**
2. Seleccionar cliente y añadir líneas
3. Estados del pedido:
   - **Pendiente** → **Confirmado** → **En Preparación** → **Servido**
   - O **Cancelado** en cualquier momento
4. Convertir pedido a albarán o factura directamente

---

## 9. Informes y Analytics

Menú → **Informes** — 5 pestañas:

| Pestaña | Descripción |
|---------|-------------|
| **Ventas** | Gráfico de área diario + totales del período |
| **Stock** | Estado actual del stock por producto y lote |
| **Producción** | Producción por día + top productos |
| **Clientes** | Ranking de clientes por facturación |
| **Rotación** | Análisis FIFO: rotación, días cobertura, clasificación por producto |

**Exportar:** cualquier informe se puede descargar en **Excel** (.xlsx) con el botón de la cabecera.

---

## 10. Trazabilidad

Menú → **Trazabilidad** — 3 pestañas:

| Pestaña | Descripción |
|---------|-------------|
| **Ventas** | Trazabilidad por venta/factura |
| **Ingredientes** | Qué ingredientes tiene cada producto |
| **Alérgenos** | Qué alérgenos porta cada producto |

---

## 11. Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Alt+1` | Panel de Control |
| `Alt+2` | Facturación |
| `Alt+3` | Pedidos |
| `Alt+4` | Lotes |
| `Alt+5` | Clientes |
| `Alt+6` | Productos |
| `Alt+7` | Producción |
| `Alt+8` | Informes |
| `Alt+9` | Trazabilidad |
| `?` | Ver todos los atajos |

---

## 12. Gestión de usuarios (solo Admin)

1. Menú → **Usuarios**
2. Crear usuarios: nombre, email, contraseña, rol
3. Roles disponibles: `Admin`, `UsuarioObrador`, `UsuarioRepartidor`
4. Activar/desactivar usuarios sin eliminarlos

---

*Ante cualquier problema técnico, contactar con el administrador del sistema.*
