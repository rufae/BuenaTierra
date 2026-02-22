# Referencia de API — BuenaTierra

**Versión:** 1.0  
**Base URL:** `http://[servidor]:5001/api`  
**Autenticación:** Bearer JWT en header `Authorization: Bearer {token}`  
**Documentación interactiva:** `http://[servidor]:5001/swagger`

---

## Autenticación

### POST `/auth/login`
Obtiene token JWT.

**Body:**
```json
{
  "email": "admin@buenatierra.com",
  "password": "Admin#BuenaTierra2025",
  "empresaId": 1
}
```

**Response 200:**
```json
{
  "token": "eyJ...",
  "refreshToken": "...",
  "expira": "2025-01-01T20:00:00Z"
}
```

---

## Dashboard

### GET `/dashboard/stats`
KPIs del panel de control.

**Response 200:**
```json
{
  "data": {
    "facturasHoyCount": 5,
    "facturasHoyImporte": 1234.56,
    "facturasMesCount": 45,
    "facturasMesImporte": 12345.67,
    "pedidosPendientes": 3,
    "stockAlertas": 2,
    "lotesProximoCaducar": 1,
    "produccionHoy": 4,
    "totalClientes": 25,
    "ultimasFacturas": [...],
    "ultimosPedidos": [...]
  }
}
```

---

## Reportes

### GET `/reportes/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
Evolución de ventas por período.

**Response 200:**
```json
{
  "puntos": [
    { "fecha": "2025-01-01", "fechaLabel": "01/01", "importe": 500.00, "base_": 413.22, "count": 3 }
  ],
  "totalImporte": 12345.67,
  "totalBase": 10202.21,
  "totalFacturas": 50
}
```

---

### GET `/reportes/stock`
Estado actual del stock por producto.

**Response 200:**
```json
{
  "items": [
    { "productoId": 1, "productoNombre": "Palmeras", "stockTotal": 100, "stockReservado": 10, "stockDisponible": 90, "numLotes": 3, "conAlertas": false }
  ],
  "totalProductos": 10,
  "productosConAlerta": 1,
  "stockTotalUnidades": 500
}
```

---

### GET `/reportes/rotacion?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
Análisis de rotación de producto (FIFO analytics).

**Response 200:**
```json
{
  "items": [
    {
      "productoId": 1,
      "nombre": "Palmeras",
      "unidad": "caja",
      "stockActual": 30,
      "ventasPeriodo": 120,
      "rotacion": 4.0,
      "diasCobertura": 8,
      "clasificacion": "Alta"
    }
  ],
  "totalProductos": 10,
  "productosConMovimiento": 8,
  "rotacionMedia": 2.5,
  "desde": "2025-06-01",
  "hasta": "2025-06-30",
  "diasPeriodo": 30
}
```

**Clasificaciones de rotación:**
- `Alta`: rotación ≥ 2×
- `Media`: rotación ≥ 1×
- `Baja`: rotación < 1×
- `Sin movimiento`: sin ventas en el período

---

### GET `/reportes/export?tipo={tab}&desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
Descarga informe en Excel (.xlsx).

**Query params:**
- `tipo`: `ventas` | `stock` | `produccion` | `clientes`
- `desde`, `hasta`: rango de fechas

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

## Facturas

### GET `/facturas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
Lista facturas del período.

### POST `/facturas`
Crea una factura nueva. Los lotes se asignan automáticamente por FIFO.

**Body:**
```json
{
  "clienteId": 5,
  "serieId": 1,
  "fechaFactura": "2025-01-15",
  "esSimplificada": false,
  "notas": "...",
  "items": [
    { "productoId": 1, "cantidad": 10, "precioUnitario": null, "descuento": 0 }
  ]
}
```

**Response 201:**
```json
{
  "facturaId": 42,
  "numeroFactura": "A-2025-042",
  "total": 350.75
}
```

---

## Lotes

### GET `/lotes?productoId={id}`
Lista lotes con stock disponible.

### POST `/lotes` (via Producción)
Los lotes se crean automáticamente al registrar producción.

---

## Trazabilidad

### GET `/trazabilidad?tipo=producto&id={productoId}`
Trazabilidad completa por producto (qué lotes, qué ventas, qué clientes).

### GET `/trazabilidad?tipo=ingrediente&id={ingredienteId}`
Trazabilidad por ingrediente (qué productos lo contienen, qué lotes, qué facturas).

---

## Usuarios (Admin only)

### GET `/usuarios`
Lista todos los usuarios de la empresa.

### POST `/usuarios`
Crea nuevo usuario.

### PUT `/usuarios/{id}`
Edita usuario.

### DELETE `/usuarios/{id}`
Desactiva usuario (no elimina físicamente).

---

## Códigos de error

| HTTP | Código | Descripción |
|------|--------|-------------|
| 400 | `VALIDATION_ERROR` | Datos de entrada inválidos |
| 401 | `UNAUTHORIZED` | Token no válido o expirado |
| 403 | `FORBIDDEN` | Sin permisos para la acción |
| 404 | `NOT_FOUND` | Recurso no encontrado |
| 409 | `STOCK_INSUFICIENTE` | No hay stock para asignar |
| 409 | `NO_LOTES_DISPONIBLES` | Sin lotes activos para el producto |
| 500 | `INTERNAL_ERROR` | Error interno del servidor |

**Formato de error:**
```json
{
  "error": "Stock insuficiente para producto 1: solicitado=20, disponible=5",
  "code": "STOCK_INSUFICIENTE"
}
```

---

*Para exploración interactiva completa, usar Swagger UI en `/swagger`*
