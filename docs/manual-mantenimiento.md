# Manual de Mantenimiento — BuenaTierra

> Versión: 1.0 | Actualizado: 2025

---

## 1. Infraestructura

### 1.1 Servicios Docker

```bash
# Levantar todos los servicios
docker compose up -d

# Ver estado
docker compose ps

# Ver logs en tiempo real
docker compose logs -f api
docker compose logs -f db
```

| Servicio   | Puerto interno | Puerto host | Descripción              |
|------------|----------------|-------------|--------------------------|
| `api`      | 8080           | 5064        | ASP.NET Core 9           |
| `db`       | 5432           | 5433        | PostgreSQL 15            |
| `frontend` | 5173           | 5173        | Vite dev / Nginx prod    |

### 1.2 Variables de entorno (producción)

Archivo: `.env` en raíz del servidor (NO subir a git):

```env
POSTGRES_PASSWORD=...        # contraseña BD producción
JWT_SECRET=...               # mínimo 32 caracteres
CORS_ORIGINS=https://...     # dominio frontend producción
```

---

## 2. Base de datos

### 2.1 Backup manual

```bash
# Backup completo
docker exec db pg_dump -U postgres buenatierra > backup_$(date +%Y%m%d).sql

# Restaurar
docker exec -i db psql -U postgres buenatierra < backup_20250101.sql
```

### 2.2 Migraciones EF Core

```bash
# Ver migraciones pendientes
dotnet ef migrations list \
  --project src/BuenaTierra.Infrastructure \
  --startup-project src/BuenaTierra.API

# Aplicar migraciones en producción (tras deploy)
dotnet ef database update \
  --project src/BuenaTierra.Infrastructure \
  --startup-project src/BuenaTierra.API \
  --connection "Host=localhost;Port=5433;Database=buenatierra;Username=postgres;Password=<pw>"

# Crear nueva migración (desarrollo)
dotnet ef migrations add NombreMigracion \
  --project src/BuenaTierra.Infrastructure \
  --startup-project src/BuenaTierra.API
```

### 2.3 Tablas clave

| Tabla              | Descripción                                       |
|--------------------|---------------------------------------------------|
| `empresas`         | Multi-tenant: una fila por empresa                |
| `usuarios`         | Credenciales + rol + empresa_id                   |
| `productos`        | Catálogo de artículos                             |
| `lotes`            | Trazabilidad: un lote por producción diaria       |
| `stock_lotes`      | Stock disponible por producto+lote                |
| `facturas`         | Facturas emitidas                                 |
| `factura_lineas`   | Líneas con lote_id asignado (FIFO automático)     |
| `albaranes`        | Albaranes de entrega                              |
| `albaran_lineas`   | Líneas de albarán                                 |
| `clientes`         | Clientes del obrador                              |

### 2.4 Consultas de diagnóstico frecuentes

```sql
-- Stock actual por producto y lote
SELECT p.nombre, l.codigo_lote, sl.cantidad_disponible
FROM stock_lotes sl
JOIN lotes l ON l.id = sl.lote_id
JOIN productos p ON p.id = sl.producto_id
WHERE sl.cantidad_disponible > 0
ORDER BY p.nombre, l.fecha_produccion;

-- Facturas del mes actual
SELECT numero_factura, fecha_factura, total, estado
FROM facturas
WHERE fecha_factura >= date_trunc('month', current_date)
ORDER BY fecha_factura DESC;

-- Trazabilidad: qué clientes recibieron un lote
SELECT c.nombre, fl.cantidad, f.numero_factura, f.fecha_factura
FROM factura_lineas fl
JOIN facturas f ON f.id = fl.factura_id
JOIN clientes c ON c.id = f.cliente_id
WHERE fl.lote_id = <ID_LOTE>;
```

---

## 3. Despliegue

### 3.1 Proceso de deploy (CI/CD)

El pipeline de GitHub Actions (`/.github/workflows/ci.yml`) ejecuta automáticamente en cada push a `main`:

1. **backend job**: `dotnet test` (unit + integration)
2. **frontend job**: `tsc --noEmit` + `npm run build`
3. **docker job**: build + push a GHCR (ghcr.io/buenatierra/api)

Deploy manual:

```bash
# Actualizar imagen en servidor
docker compose pull api
docker compose up -d --no-deps api
```

### 3.2 Rollback

```bash
# Ver tags de imagen disponibles
docker images ghcr.io/buenatierra/api

# Volver a versión anterior
docker compose down api
docker tag ghcr.io/buenatierra/api:anterior ghcr.io/buenatierra/api:latest
docker compose up -d api
```

---

## 4. Monitoreo

### 4.1 Health check

```bash
curl http://localhost:5064/health
# Respuesta: {"status":"healthy","timestamp":"2025-..."}
```

### 4.2 Logs

Los logs de la API se escriben en `logs/buenatierra-YYYYMMDD.txt` (Serilog rolling).

```bash
# Ver últimas 100 líneas de log
tail -n 100 logs/buenatierra-$(date +%Y%m%d).txt

# Buscar errores
grep -i "error\|exception\|fail" logs/buenatierra-$(date +%Y%m%d).txt
```

### 4.3 Métricas de base de datos

```sql
-- Conexiones activas
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Tablas más grandes
SELECT relname, pg_size_pretty(pg_total_relation_size(oid))
FROM pg_class WHERE relkind = 'r'
ORDER BY pg_total_relation_size(oid) DESC LIMIT 10;
```

---

## 5. Gestión de lotes y trazabilidad

### 5.1 Ciclo de vida de un lote

```
PRODUCCION diaria → LOTE (código ddMMyyyy) → STOCK_LOTES (activo)
                                            ↓
                                   FACTURA/ALBARAN (descuenta stock)
                                            ↓
                                   LOTE agotado / caducado
```

### 5.2 Algoritmo FIFO

El sistema asigna lotes automáticamente en `ILoteAsignacionService.AsignarLotesAsync()`:

1. Obtener lotes disponibles del producto ordenados por `fecha_produccion ASC`
2. Recorrer lotes hasta cubrir la cantidad solicitada
3. Generar una `FacturaLinea` (o `AlbaranLinea`) por cada lote consumido
4. Actualizar `stock_lotes.cantidad_disponible`

### 5.3 Caducidad

- `por_caducar`: `fecha_caducidad <= TODAY + 3 días`
- `caducado`: `fecha_caducidad < TODAY`
- `agotado`: `cantidad_actual <= 0`
- `activo`: resto

### 5.4 Exportación para Sanidad

Endpoint: `GET /api/facturas/trazabilidad/excel?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`

Genera un `.xlsx` con columnas: Factura, Fecha, Cliente, Producto, Lote, Cantidad, Caducidad, Ingredientes.

---

## 6. Seguridad

### 6.1 Rotación de claves JWT

1. Cambiar `Jwt:Secret` en el servidor (`.env` o secrets manager)
2. Redeployar API
3. Todos los tokens activos quedarán invalidados — los usuarios deben volver a hacer login

### 6.2 Usuarios y roles

| Rol              | Permisos                                              |
|------------------|-------------------------------------------------------|
| `Admin`          | Todo: configuración, empresas, usuarios, reportes     |
| `Obrador`        | Clientes, productos, stock, facturas, albaranes       |
| `Repartidor`     | Solo su cartera: facturas propias, POS, stock lectura |

Endpoints de gestión de usuarios: `POST /api/usuarios`, `PUT /api/usuarios/{id}/rol`

### 6.3 Backups de seguridad

Programar backup diario vía cron:

```cron
# Crontab en servidor
0 3 * * * docker exec db pg_dump -U postgres buenatierra > /backups/buenatierra_$(date +\%Y\%m\%d).sql
# Limpiar backups > 30 días
0 4 * * * find /backups -name "buenatierra_*.sql" -mtime +30 -delete
```

---

## 7. Tests

### 7.1 Ejecutar tests unitarios

```bash
dotnet test tests/BuenaTierra.Tests/ --logger "console;verbosity=normal"
```

### 7.2 Ejecutar tests de integración

> Requiere Docker en ejecución (Testcontainers lanza PostgreSQL automáticamente).

```bash
dotnet test tests/BuenaTierra.IntegrationTests/ --logger "console;verbosity=normal"
```

### 7.3 Ejecutar tests E2E (Playwright)

```bash
cd tests/BuenaTierra.E2E
npm ci
npx playwright install --with-deps
npx playwright test
```

### 7.4 Tests de carga (k6)

```bash
# Instalar k6: https://grafana.com/docs/k6/latest/set-up/install-k6/
k6 run tests/load/k6-ventas.js
k6 run --vus 10 --duration 30s tests/load/k6-fifo-concurrencia.js
```

---

## 8. Resolución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| `401 Unauthorized` en todas las llamadas | Token expirado o secret JWT cambiado | Re-login; si persiste, revisar `Jwt:Secret` en servidor |
| Error al crear factura: "stock insuficiente" | El lote está agotado o caducado | Revisar `stock_lotes` y crear nueva producción |
| La API no arranca: `Npgsql connection failed` | PostgreSQL no está corriendo | `docker compose up -d db` |
| Migración fallida: `column already exists` | Migración aplicada dos veces | `dotnet ef migrations list` y verificar estado |
| PDF en blanco | QuestPDF sin licencia configurada | Agregar `QuestPDF.Settings.License = LicenseType.Community` en `Program.cs` |
| Excel sin datos | Rango de fechas sin facturas | Ampliar el rango `desde`/`hasta` |

---

## 9. Contacto técnico

- Repositorio: GitHub → organización BuenaTierra
- Issues: abrir ticket en GitHub con etiqueta `bug` o `maintenance`
- Secrets de producción: almacenados en GitHub Secrets (`JWT_SECRET`, `GHCR_TOKEN`)
