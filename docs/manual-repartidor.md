# Manual de Usuario — Repartidor

**Sistema BuenaTierra — Versión 1.0**  
**Rol:** `UsuarioRepartidor`

---

## 1. Acceso

1. Abrir navegador → URL proporcionada por el obrador
2. Introducir tus credenciales (email + contraseña)
3. Verás el menú reducido para repartidores:
   - Panel de control
   - **Facturación rápida**
   - Mis clientes
   - Trazabilidad

---

## 2. Facturación rápida

Este es el módulo central para tu trabajo diario.  
Diseñado para máxima velocidad: **cero escritura manual de lotes**.

### 2.1 Crear una factura rápida

1. Menú → **Facturación rápida** (o `Alt+2`)
2. **Seleccionar cliente** (buscador por nombre o NIF)
3. **Añadir productos:**
   - Buscar producto por nombre
   - Introducir la cantidad total que quieres facturar
   - **El sistema asigna los lotes automáticamente** (FIFO: primero el más antiguo)
4. El sistema muestra el desglose automático de lotes:
   ```
   Palmeras × 10 → 3 uds. Lote 01072025
                  → 4 uds. Lote 02072025
                  → 3 uds. Lote 03072025
   ```
5. Revisar importes y totales
6. Botón **Generar factura** → factura creada con número automático
7. Botón **Imprimir** o descargar PDF

### 2.2 ¿Qué pasa con los lotes?
- Nunca tienes que escribir lotes a mano
- El sistema consume los lotes más antiguos primero (FIFO)
- Si un producto tiene múltiples lotes, el sistema divide automáticamente las líneas
- La factura queda con trazabilidad completa para inspecciones sanitarias

---

## 3. Mis clientes

1. Menú → **Mis clientes**
2. Ver listado de tus clientes
3. Acciones:
   - Crear nuevo cliente
   - Ver historial de compras
   - Editar datos de contacto

---

## 4. Información de productos

Puedes consultar la información completa de cualquier producto del obrador:
- Descripción y precio
- **Ingredientes** utilizados
- **Alérgenos** presentes (los 14 reglamentarios)
- **Lote activo** actual

Esta información es útil para informar a tus propios clientes sobre alérgenos y componentes.

---

## 5. Trazabilidad

Menú → **Trazabilidad**

Permite confirmar:
- Qué lotes has vendido a qué clientes
- Qué ingredientes tiene cada producto
- Qué alérgenos contiene cada producto

Útil en caso de alerta sanitaria o reclamación de cliente.

---

## 6. Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Alt+2` | Facturación rápida |
| `Alt+5` | Mis clientes |
| `Alt+9` | Trazabilidad |
| `?` | Ver todos los atajos |

---

## 7. Preguntas frecuentes

**¿Puedo facturar sin conexión?**  
No. El sistema requiere conexión para acceder al stock y lotes actualizados.

**¿Mis clientes son diferentes a los del obrador?**  
Sí. Tus clientes son tuyos. El obrador ve los suyos. Las facturas también son tuyas (series separadas).

**¿Qué pasa si no hay suficiente stock de un producto?**  
El sistema te avisará con un error antes de crear la factura. Contacta al obrador para reponer.

**¿Puedo ver el historial de mis facturas?**  
Sí, en la sección de facturación encontrarás todas tus facturas emitidas con filtros por fecha.

---

*Para soporte técnico, contacta con el administrador del sistema.*
