# Manual Técnico — BuenaTierra

**Sistema BuenaTierra — Versión 1.0**  
**Arquitectura: Clean Architecture + DDD**

---

## 1. Arquitectura general

```
┌─────────────────────────────────────────────────┐
│                  Clientes                         │
│  Browser (React+Vite)   Mobile (Responsive PWA)  │
└────────────────────┬────────────────────────────┘
                     │ HTTP/HTTPS
┌────────────────────▼────────────────────────────┐
│           ASP.NET Core 9 REST API                 │
│                                                   │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ Controllers │  │ Middleware (Auth, Errors) │  │
│  └──────┬──────┘  └──────────────────────────┘  │
│         │                                         │
│  ┌──────▼──────────────────────────────────────┐ │
│  │         Application Layer                    │ │
│  │  IAuthService  IFacturaService               │ │
│  │  ILoteAsignacionService  IStockService        │ │
│  └──────┬──────────────────────────────────────┘ │
│         │                                         │
│  ┌──────▼──────────────────────────────────────┐ │
│  │       Infrastructure Layer                   │ │
│  │  EF Core + Npgsql  Repositories              │ │
│  │  Services (FIFO, Auth, Factura)              │ │
│  └──────┬──────────────────────────────────────┘ │
│         │                                         │
└─────────┼───────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────┐
│            PostgreSQL 15 (Docker)                 │
│         Host: localhost:5433                      │
│         DB: buenatierra                           │
└─────────────────────────────────────────────────┘
```

---

## 2. Stack tecnológico

### Backend
| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Runtime | .NET | 9.0 |
| Framework | ASP.NET Core | 9.0 |
| ORM | Entity Framework Core | 9.x |
| DB Driver | Npgsql | 9.x |
| Auth | JWT Bearer | 8.x |
| Excel | ClosedXML | 0.105 |
| Hash | BCrypt.Net-Next | 4.1 |
| Logging | Serilog | 8.x |
| Docs | Swagger / OpenAPI | v1 |
| Cache | IMemoryCache (in-box) | - |

### Frontend
| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | React | 18 |
| Build | Vite | 5 |
| Lenguaje | TypeScript | 5.x |
| Estilos | Tailwind CSS | 3.x |
| HTTP | Axios | 1.x |
| State/Query | @tanstack/react-query | 5.x |
| Gráficos | Recharts | 3.x |
| Iconos | Lucide React | latest |
| Router | React Router | 6.x |

---

## 3. Capas de la aplicación

### 3.1 Domain Layer (`BuenaTierra.Domain`)
- Entidades: `Empresa`, `Usuario`, `Producto`, `Lote`, `Stock`, `Factura`, `Pedido`, `Produccion`, `Trazabilidad`, `Ingrediente`, `Alergeno`
- Excepciones: `DomainException`, `StockInsuficienteException`, `NoHayLotesDisponiblesException`
- Interfaces de repositorio: `IUnitOfWork`, `ILoteRepository`, `IStockRepository`, etc.
- Enums: `RolUsuario`, `EstadoFactura`, `EstadoPedido`, `TipoMovimientoStock`

### 3.2 Application Layer (`BuenaTierra.Application`)
- Interfaces de servicio: `IAuthService`, `IStockService`, `ILoteAsignacionService`, `IFacturaService`
- DTOs y Records: `LoteAsignado`, `StockResumen`, `StockAlerta`, `FacturaCreada`, `AuthResult`

### 3.3 Infrastructure Layer (`BuenaTierra.Infrastructure`)
- `AppDbContext` (EF Core + Npgsql)
- Repositorios: `LoteRepository`, `StockRepository`, `FacturaRepository`, etc.
- `UnitOfWork` (patrón transaction)
- Servicios: `LoteAsignacionService` (FIFO), `AuthService` (JWT), `FacturaService`, `StockService`

### 3.4 API Layer (`BuenaTierra.API`)
- Controllers: Facturas, Pedidos, Lotes, Produccion, Clientes, Productos, Reportes, Trazabilidad, Dashboard, Usuarios
- Middleware: `ErrorHandlingMiddleware` (convierte excepciones de dominio a HTTP)
- `Program.cs`: Registro de servicios, JWT, CORS, Swagger, Serilog

---

## 4. Motor FIFO — Asignación automática de lotes

Este es el componente central del sistema.

```
GetDisponiblesFIFOAsync(empresaId, productoId)
  → Stock activo ordenado por: fecha_fabricacion ASC, id ASC
  → Excluye: Bloqueado=true, FechaCaducidad < hoy

AsignarLotesAsync(empresaId, productoId, cantidad)
  → Itera lotes FIFO
  → Para cada lote: toma min(disponible_lote, restante)
  → Restante > 0 al final → StockInsuficienteException
  → Resultado: List<LoteAsignado> con cantidades exactas por lote
```

**Garantías:**
- Transaccional (UsesTransaction via IUnitOfWork)
- Lanza excepción tipada antes de crear registros si no hay stock
- Never silently fails

---

## 5. Modelo de base de datos (principales tablas)

```sql
empresas          (id, nombre, cif, ...)
usuarios          (id, empresa_id, nombre, email, password_hash, rol, activo)
productos         (id, empresa_id, nombre, codigo, precio, iva, unidad, stock_minimo)
lotes             (id, empresa_id, producto_id, codigo_lote, fecha_fabricacion, fecha_caducidad, bloqueado)
stock             (id, empresa_id, producto_id, lote_id, cantidad_disponible, cantidad_reservada, stock_minimo)
movimientos_stock (id, empresa_id, producto_id, lote_id, tipo, cantidad, fecha, usuario_id)
facturas          (id, empresa_id, cliente_id, serie_id, numero_factura, fecha_factura, estado, total)
lineas_factura    (id, factura_id, producto_id, lote_id, cantidad, precio_unitario, iva)
pedidos           (id, empresa_id, cliente_id, numero_pedido, fecha, estado)
lineas_pedido     (id, pedido_id, producto_id, cantidad, precio_unitario)
trazabilidad      (id, empresa_id, producto_id, lote_id, cliente_id, factura_id, tipo_operacion, cantidad, fecha_operacion)
clientes          (id, empresa_id, nombre, cif, tipo, email, telefono)
producciones      (id, empresa_id, producto_id, lote_id, cantidad_producida, merma, fecha_produccion)
ingredientes      (id, empresa_id, nombre, descripcion)
alergenos         (id, nombre, codigo_reglamento)
ingrediente_alergenos (ingrediente_id, alergeno_id)
producto_ingredientes (producto_id, ingrediente_id, cantidad, unidad)
series_facturacion (id, empresa_id, prefijo, ultimo_numero, nombre)
```

---

## 6. Seguridad

- **Autenticación:** JWT Bearer con expiración configurable (default: 8h)
- **RBAC:** Roles `Admin`, `UsuarioObrador`, `UsuarioRepartidor` verificados en cada endpoint
- **Contraseñas:** BCrypt hash (cost factor 12)
- **Datos:** Todos los endpoints filtran por `EmpresaId` del token JWT
- **CORS:** Configurable — en desarrollo `AllowAnyOrigin`, en producción debe restringirse

---

## 7. Endpoints principales

Ver Swagger en `/swagger` para documentación interactiva completa.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/dashboard/stats` | KPIs del dashboard |
| GET/POST | `/api/facturas` | Listar / Crear factura |
| GET | `/api/facturas/{id}` | Detalle factura |
| GET/POST | `/api/pedidos` | Listar / Crear pedido |
| GET/POST | `/api/lotes` | Listar / Crear lote |
| GET/POST | `/api/produccion` | Listar / Registrar producción |
| GET/POST | `/api/productos` | Catálogo de productos |
| GET/POST | `/api/clientes` | Gestión de clientes |
| GET | `/api/reportes/ventas` | Informe ventas |
| GET | `/api/reportes/stock` | Estado stock |
| GET | `/api/reportes/rotacion` | Análisis rotación FIFO |
| GET | `/api/reportes/export` | Exportar Excel |
| GET | `/api/trazabilidad` | Trazabilidad completa |
| GET/POST/PUT | `/api/usuarios` | Admin: gestión usuarios |

---

## 8. Rendimiento

- **Cache:** `IMemoryCache` para reportes frecuentes (próxima implementación: `SlidingExpiration 5min`)
- **Connection Pool:** Npgsql pooling `Min=5, Max=50`
- **Índices DB:** 8 índices compuestos en tablas principales (ver `docs/manual-instalacion.md`)
- **Queries EF Core:** Proyecciones con `.Select()` para evitar over-fetching
- **Frontend:** React Query con `staleTime: 30s`, paginación en tablas largas

---

## 9. Tests

```
tests/BuenaTierra.Tests/
├── LoteAsignacionServiceTests.cs  # 6 tests FIFO (Moq + NullLogger)
├── DomainEntityTests.cs           # 9 tests de entidades y excepciones de dominio
└── ApplicationContractTests.cs    # 8 tests de DTOs y contratos
```

Ejecutar: `dotnet test tests/BuenaTierra.Tests`

Cobertura actual: 23 tests, 100% pasan.

---

## 10. Logs

- **Destino:** Consola + archivos rotativos en `logs/buenatierra-YYYYMMDD.txt`
- **Retención:** 30 días
- **Framework:** Serilog con `UseSerilogRequestLogging()`
- **Nivel:** configurable en `appsettings.json` → `Serilog.MinimumLevel`

---

*Documentación técnica BuenaTierra v1.0*
