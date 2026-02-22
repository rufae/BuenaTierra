# ARQUITECTURA DEL SISTEMA - BUENATIERRA

## 1. ARQUITECTURA GENERAL

### 1.1. Modelo Arquitectónico

**Arquitectura en 3 capas + Cliente Desacoplado**

```
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                     │
│  ┌────────────────────┐      ┌──────────────────────────┐  │
│  │  Cliente Obrador   │      │  Cliente Repartidor      │  │
│  │  (WPF/WinForms)    │      │  (WPF/WinForms Ligero)   │  │
│  │  - Gestión completa│      │  - Facturación rápida    │  │
│  │  - Admin           │      │  - Consulta productos    │  │
│  │  - Producción      │      │  - Clientes propios      │  │
│  └────────────────────┘      └──────────────────────────┘  │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
               │  HTTPS / REST API        │
               │                          │
┌──────────────▼──────────────────────────▼───────────────────┐
│                    CAPA DE APLICACIÓN                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           API REST (ASP.NET Core 8)                  │  │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────────┐  │  │
│  │  │   Auth     │ │  Business  │ │   Integration   │  │  │
│  │  │ Controller │ │ Controllers│ │    Services     │  │  │
│  │  └────────────┘ └────────────┘ └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              CAPA DE LÓGICA DE NEGOCIO               │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │  │
│  │  │ Servicios│ │ Managers │ │ Motor Asignación  │   │  │
│  │  │ Dominio  │ │ Workflow │ │ Lotes (FIFO)      │   │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              CAPA DE ACCESO A DATOS                  │  │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────────┐  │  │
│  │  │Repositorios│ │ UnitOfWork │ │  Query Services │  │  │
│  │  │   (CRUD)   │ │  Pattern   │ │   (Reporting)   │  │  │
│  │  └────────────┘ └────────────┘ └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ EF Core / Dapper
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    CAPA DE DATOS                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           PostgreSQL 15 (Dockerizado)                │  │
│  │  - Datos transaccionales                             │  │
│  │  - Stored Procedures (Automatización)                │  │
│  │  - Triggers (Auditoría)                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2. Decisiones Arquitectónicas Clave

| Decisión | Tecnología/Patrón | Justificación |
|----------|------------------|---------------|
| Backend Framework | ASP.NET Core 8 | Enterprise-grade, alta performance, excelente ecosistema, maduro |
| Base de Datos | PostgreSQL 15 | ACID, stored procedures robustos, escalable, open source |
| ORM | Entity Framework Core 8 | Productividad, migraciones, LINQ, bien integrado |
| Cliente Desktop | WPF (XAML + MVVM) | Nativo Windows, rica UX, binding potente, offline-capable |
| API Style | REST + JSON | Estándar, simple, bien soportado, tooling maduro |
| Autenticación | JWT + Refresh Tokens | Stateless, escalable, estándar industria |
| Patrón Arquitectónico | Clean Architecture | Separación de responsabilidades, testeable, mantenible |
| Comunicación | HTTPS/TLS 1.3 | Seguridad, estándar |
| Containerización | Docker + Docker Compose | Portabilidad, despliegue consistente |

---

## 2. ARQUITECTURA FÍSICA (INFRAESTRUCTURA)

### 2.1. Topología de Red

```
Internet
    │
    │ Port 443 (HTTPS)
    │
┌───▼───────────────────────────────────────────────┐
│           Firewall / Router                       │
│  - NAT/PAT                                        │
│  - Port forwarding 443 → 5001                     │
│  - Whitelist IPs (opcional)                       │
└───┬───────────────────────────────────────────────┘
    │
┌───▼───────────────────────────────────────────────┐
│       Servidor Físico / VPS (Ubuntu 22.04)        │
│  ┌─────────────────────────────────────────────┐ │
│  │          Docker Host                        │ │
│  │  ┌────────────────┐  ┌──────────────────┐  │ │
│  │  │  api-service   │  │  db-service      │  │ │
│  │  │  ASP.NET Core  │  │  PostgreSQL 15   │  │ │
│  │  │  Port: 5001    │  │  Port: 5432      │  │ │
│  │  └────────────────┘  └──────────────────┘  │ │
│  │  ┌────────────────┐  ┌──────────────────┐  │ │
│  │  │  nginx-reverse │  │  backup-service  │  │ │
│  │  │  (futuro)      │  │  (cronjobs)      │  │ │
│  │  └────────────────┘  └──────────────────┘  │ │
│  └─────────────────────────────────────────────┘ │
│  Docker Network: buenatierra_network (bridge)    │
└───────────────────────────────────────────────────┘
    │
    │ VPN (opcional) para administración
    │
┌───▼───────────────────────────────────────────────┐
│       Clientes Windows (Red Local/Remota)         │
│  - Cliente Obrador (oficina)                      │
│  - Clientes Repartidores (remoto)                 │
└───────────────────────────────────────────────────┘
```

### 2.2. Especificaciones de Hardware

**Servidor Producción (Mínimo):**
```yaml
CPU: 4 cores @ 2.5 GHz (Intel Xeon / AMD EPYC)
RAM: 16 GB DDR4
Disco: 256 GB SSD NVMe + 1 TB HDD (backups)
  - OS: 50 GB SSD
  - PostgreSQL data: 100 GB SSD
  - Logs y backups: 1 TB HDD
Red: 1 Gbps, IP estática
SO: Ubuntu Server 22.04 LTS
```

**Servidor Escalado (Recomendado):**
```yaml
CPU: 8 cores @ 3.0 GHz
RAM: 32 GB DDR4
Disco: 512 GB SSD NVMe (RAID 1) + 2 TB HDD (RAID 1)
Red: 1 Gbps, IP estática, dual NIC (failover)
SO: Ubuntu Server 22.04 LTS
```

**Clientes Windows:**
```yaml
CPU: 2 cores mínimo
RAM: 4 GB mínimo (8 GB recomendado)
Disco: 100 GB
SO: Windows 10/11 Pro
Red: 100 Mbps+
.NET Runtime: 8.0
```

### 2.3. Docker Compose - Configuración

```yaml
version: '3.8'

services:
  # Base de datos PostgreSQL
  db:
    image: postgres:15.4-alpine
    container_name: buenatierra-db
    restart: always
    environment:
      POSTGRES_DB: buenatierra
      POSTGRES_USER: app_buenatierra
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=es_ES.UTF-8"
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./backups:/backups
      - ./init-scripts:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    networks:
      - buenatierra-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app_buenatierra -d buenatierra"]
      interval: 10s
      timeout: 5s
      retries: 5

  # API Backend
  api:
    image: buenatierra/api:latest
    container_name: buenatierra-api
    restart: always
    depends_on:
      db:
        condition: service_healthy
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ASPNETCORE_URLS: http://+:5001
      ConnectionStrings__DefaultConnection: "Host=db;Port=5432;Database=buenatierra;Username=app_buenatierra;Password=${DB_PASSWORD};Pooling=true;MinPoolSize=5;MaxPoolSize=50"
      Jwt__Secret: ${JWT_SECRET}
      Jwt__Issuer: "BuenaTierra.API"
      Jwt__Audience: "BuenaTierra.Clients"
      Jwt__ExpiryMinutes: 480
    volumes:
      - api-logs:/app/logs
      - api-uploads:/app/uploads
      - facturas-pdf:/app/pdfs
    ports:
      - "5001:5001"
    networks:
      - buenatierra-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Backup automático (futuro)
  backup:
    image: prodrigestivill/postgres-backup-local
    container_name: buenatierra-backup
    restart: always
    depends_on:
      - db
    environment:
      POSTGRES_HOST: db
      POSTGRES_DB: buenatierra
      POSTGRES_USER: app_buenatierra
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      SCHEDULE: "0 0 * * *" # Diario a medianoche
      BACKUP_KEEP_DAYS: 30
      BACKUP_KEEP_WEEKS: 8
      BACKUP_KEEP_MONTHS: 12
    volumes:
      - ./backups:/backups
    networks:
      - buenatierra-network

volumes:
  db-data:
    driver: local
  api-logs:
    driver: local
  api-uploads:
    driver: local
  facturas-pdf:
    driver: local

networks:
  buenatierra-network:
    driver: bridge
```

### 2.4. Seguridad de Red

**Firewall (UFW - Ubuntu):**
```bash
# SSH (solo desde IPs específicas)
ufw allow from 192.168.1.0/24 to any port 22

# HTTPS (público para API)
ufw allow 443/tcp

# PostgreSQL (solo interno Docker)
# No exponer 5432 públicamente

# Habilitar firewall
ufw enable
```

**Fail2Ban (Protección contra brute-force):**
```ini
[api-auth]
enabled = true
port = 443
filter = api-auth
logpath = /var/log/buenatierra/api.log
maxretry = 5
bantime = 3600
```

---

## 3. ARQUITECTURA LÓGICA (SOFTWARE)

### 3.1. Patrón: Clean Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Presentation Layer                 │
│  - API Controllers                                  │
│  - DTOs (Data Transfer Objects)                     │
│  - Request/Response Models                          │
│  - Authentication Middleware                        │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│                 Application Layer                   │
│  - Services (Business Logic)                        │
│  - Commands / Queries (CQRS light)                  │
│  - Validators (FluentValidation)                    │
│  - Mappers (AutoMapper)                             │
│  - Interfaces (abstracciones)                       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│                   Domain Layer                      │
│  - Entidades (Entities)                             │
│  - Value Objects                                    │
│  - Domain Services                                  │
│  - Domain Events                                    │
│  - Enums y Constants                                │
│  - Business Rules                                   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│                Infrastructure Layer                 │
│  - Repositories (EF Core)                           │
│  - DbContext                                        │
│  - External Services                                │
│  - File Storage                                     │
│  - Email/SMS (futuro)                               │
└─────────────────────────────────────────────────────┘
```

### 3.2. Estructura de Proyecto (Backend)

```
BuenaTierra.sln
│
├── src/
│   ├── BuenaTierra.API/                    # Punto de entrada
│   │   ├── Controllers/
│   │   │   ├── AuthController.cs
│   │   │   ├── ProductosController.cs
│   │   │   ├── ClientesController.cs
│   │   │   ├── FacturasController.cs
│   │   │   ├── AlbaranesController.cs
│   │   │   ├── StockController.cs
│   │   │   ├── LotesController.cs
│   │   │   └── ProduccionController.cs
│   │   ├── Middleware/
│   │   │   ├── ExceptionHandlerMiddleware.cs
│   │   │   ├── RequestLoggingMiddleware.cs
│   │   │   └── AuthenticationMiddleware.cs
│   │   ├── Filters/
│   │   │   ├── ValidateModelAttribute.cs
│   │   │   └── AuthorizeRoleAttribute.cs
│   │   ├── Program.cs
│   │   ├── Startup.cs
│   │   └── appsettings.json
│   │
│   ├── BuenaTierra.Application/            # Lógica de aplicación
│   │   ├── Services/
│   │   │   ├── IProductoService.cs
│   │   │   ├── ProductoService.cs
│   │   │   ├── IFacturacionService.cs
│   │   │   ├── FacturacionService.cs
│   │   │   ├── ILoteService.cs
│   │   │   ├── LoteService.cs
│   │   │   ├── IStockService.cs
│   │   │   └── StockService.cs
│   │   ├── DTOs/
│   │   │   ├── ProductoDto.cs
│   │   │   ├── FacturaDto.cs
│   │   │   ├── AlbaranDto.cs
│   │   │   ├── ClienteDto.cs
│   │   │   └── LoteDto.cs
│   │   ├── Mappers/
│   │   │   └── AutoMapperProfile.cs
│   │   ├── Validators/
│   │   │   ├── ProductoValidator.cs
│   │   │   └── FacturaValidator.cs
│   │   └── Interfaces/
│   │       ├── IAuthService.cs
│   │       └── IPdfService.cs
│   │
│   ├── BuenaTierra.Domain/                 # Dominio puro
│   │   ├── Entities/
│   │   │   ├── Empresa.cs
│   │   │   ├── Cliente.cs
│   │   │   ├── Producto.cs
│   │   │   ├── Lote.cs
│   │   │   ├── Stock.cs
│   │   │   ├── Factura.cs
│   │   │   ├── FacturaLinea.cs
│   │   │   ├── Albaran.cs
│   │   │   └── AlbaranLinea.cs
│   │   ├── ValueObjects/
│   │   │   ├── Dinero.cs
│   │   │   ├── Direccion.cs
│   │   │   └── NumeroDocumento.cs
│   │   ├── Enums/
│   │   │   ├── TipoEmpresa.cs
│   │   │   ├── TipoCliente.cs
│   │   │   ├── EstadoFactura.cs
│   │   │   └── TipoMovimientoStock.cs
│   │   ├── Services/
│   │   │   ├── LoteAsignacionService.cs    # Motor FIFO
│   │   │   └── TrazabilidadService.cs
│   │   └── Interfaces/
│   │       ├── IRepository.cs
│   │       └── IUnitOfWork.cs
│   │
│   ├── BuenaTierra.Infrastructure/         # Implementación
│   │   ├── Data/
│   │   │   ├── BuenaTierraDbContext.cs
│   │   │   ├── Repositories/
│   │   │   │   ├── Repository.cs
│   │   │   │   ├── ProductoRepository.cs
│   │   │   │   ├── FacturaRepository.cs
│   │   │   │   └── StockRepository.cs
│   │   │   ├── Configurations/             # Entity configs
│   │   │   │   ├── ProductoConfiguration.cs
│   │   │   │   ├── FacturaConfiguration.cs
│   │   │   │   └── ...
│   │   │   └── UnitOfWork.cs
│   │   ├── Services/
│   │   │   ├── JwtService.cs
│   │   │   ├── PdfGeneratorService.cs
│   │   │   └── ExcelExportService.cs
│   │   └── Migrations/
│   │       └── (auto-generadas por EF)
│   │
│   └── BuenaTierra.Shared/                 # Compartido
│       ├── Constants/
│       ├── Exceptions/
│       ├── Extensions/
│       └── Helpers/
│
├── clients/
│   ├── BuenaTierra.Desktop.Obrador/        # Cliente WPF oficina
│   │   ├── Views/
│   │   ├── ViewModels/
│   │   ├── Services/
│   │   └── App.xaml
│   │
│   └── BuenaTierra.Desktop.Repartidor/     # Cliente WPF repartidor
│       ├── Views/
│       ├── ViewModels/
│       ├── Services/
│       └── App.xaml
│
└── tests/
    ├── BuenaTierra.UnitTests/
    ├── BuenaTierra.IntegrationTests/
    └── BuenaTierra.E2ETests/
```

### 3.3. Patrones de Diseño Aplicados

| Patrón | Ubicación | Propósito |
|--------|-----------|-----------|
| **Repository** | Infrastructure.Data.Repositories | Abstracción de acceso a datos |
| **Unit of Work** | Infrastructure.Data | Gestión transaccional |
| **Dependency Injection** | Toda la aplicación | Inversión de control, testabilidad |
| **CQRS (light)** | Application layer | Separar lecturas de escrituras complejas |
| **Factory** | Domain.Services | Creación de lotes, numeración docs |
| **Strategy** | Domain.Services (FIFO) | Algoritmo intercambiable asignación lotes |
| **Specification** | Domain (futuro) | Consultas complejas reutilizables |
| **MVVM** | Cliente Desktop | Separación vista-lógica en WPF |
| **Observer** | Cliente Desktop | Binding WPF |

---

## 4. API REST - DISEÑO

### 4.1. Estructura de Endpoints

**Base URL:** `https://api.buenatierra.com/api/v1`

#### 4.1.1. Autenticación

```
POST   /auth/login              # Login usuario
POST   /auth/refresh            # Refresh token
POST   /auth/logout             # Logout
GET    /auth/me                 # Info usuario actual
```

#### 4.1.2. Gestión de Clientes

```
GET    /clientes                # Listar clientes (paginado, filtros)
GET    /clientes/{id}           # Detalle cliente
POST   /clientes                # Crear cliente
PUT    /clientes/{id}           # Actualizar cliente
DELETE /clientes/{id}           # Eliminar (soft delete)
GET    /clientes/search?q=...   # Búsqueda
```

#### 4.1.3. Catálogo de Productos

```
GET    /productos               # Listar productos
GET    /productos/{id}          # Detalle producto + ingredientes + alérgenos
POST   /productos               # Crear producto
PUT    /productos/{id}          # Actualizar producto
DELETE /productos/{id}          # Eliminar producto
GET    /productos/catalogo      # Catálogo para venta (activos, con precios)
```

#### 4.1.4. Stock y Lotes

```
GET    /stock                   # Stock consolidado (filtros: empresa, producto)
GET    /stock/disponible        # Stock disponible para venta
GET    /lotes                   # Listar lotes
GET    /lotes/{id}              # Detalle lote
POST   /lotes                   # Crear lote (producción)
GET    /lotes/proximos-caducar  # Alertas de caducidad
GET    /lotes/producto/{id}/disponibles  # Lotes disponibles de un producto
```

#### 4.1.5. Producción

```
GET    /produccion              # Listar producciones
GET    /produccion/{id}         # Detalle producción
POST   /produccion              # Crear producción
PUT    /produccion/{id}         # Actualizar producción
POST   /produccion/{id}/finalizar  # Finalizar producción → generar lotes
```

#### 4.1.6. Pedidos

```
GET    /pedidos                 # Listar pedidos
GET    /pedidos/{id}            # Detalle pedido
POST   /pedidos                 # Crear pedido
PUT    /pedidos/{id}            # Actualizar pedido
POST   /pedidos/{id}/confirmar  # Confirmar pedido
POST   /pedidos/{id}/generar-albaran  # Generar albarán desde pedido
```

#### 4.1.7. Albaranes

```
GET    /albaranes               # Listar albaranes
GET    /albaranes/{id}          # Detalle albarán
POST   /albaranes               # Crear albarán (venta directa o desde pedido)
PUT    /albaranes/{id}          # Actualizar albarán
POST   /albaranes/{id}/facturar # Convertir albarán → factura
GET    /albaranes/pendientes-facturar  # Albaranes sin facturar
```

#### 4.1.8. Facturas (CRÍTICO)

```
GET    /facturas                # Listar facturas
GET    /facturas/{id}           # Detalle factura
POST   /facturas                # Crear factura directa
POST   /facturas/desde-albaran  # Crear factura desde albarán
POST   /facturas/desde-albaranes # Crear factura agrupando múltiples albaranes
GET    /facturas/{id}/pdf       # Descargar PDF
POST   /facturas/{id}/anular    # Anular factura
POST   /facturas/rectificativa  # Crear factura rectificativa
GET    /facturas/serie/{serie}/siguiente  # Obtener siguiente número
```

#### 4.1.9. Trazabilidad

```
GET    /trazabilidad/lote/{id}  # Trazabilidad de lote → clientes
GET    /trazabilidad/cliente/{id}/lotes  # Lotes vendidos a cliente
GET    /trazabilidad/producto/{id}/historial  # Historial completo producto
GET    /trazabilidad/fecha?desde=...&hasta=...  # Movimientos por fecha
```

#### 4.1.10. Reporting

```
GET    /reportes/ventas         # Informe de ventas (filtros múltiples)
GET    /reportes/stock          # Informe de stock
GET    /reportes/produccion     # Informe de producción
GET    /reportes/clientes       # Análisis de clientes
POST   /reportes/export/excel   # Exportar a Excel
```

### 4.2. Formato de Respuesta Estándar

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operación exitosa",
  "timestamp": "2026-02-20T10:30:00Z"
}
```

**Respuesta paginada:**
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 150,
    "totalPages": 8
  },
  "timestamp": "2026-02-20T10:30:00Z"
}
```

**Respuesta con error:**
```json
{
  "success": false,
  "error": {
    "code": "STOCK_INSUFICIENTE",
    "message": "Stock insuficiente para completar la operación",
    "details": {
      "productoId": 123,
      "cantidadSolicitada": 10,
      "cantidadDisponible": 5
    }
  },
  "timestamp": "2026-02-20T10:30:00Z"
}
```

### 4.3. Autenticación y Seguridad

**JWT Token Structure:**
```json
{
  "sub": "usuario_id",
  "email": "usuario@example.com",
  "empresa_id": 1,
  "rol": "OBRADOR",
  "permisos": ["CREAR_FACTURA", "VER_STOCK", "GESTIONAR_CLIENTES"],
  "iat": 1708428600,
  "exp": 1708457400
}
```

**Headers requeridos:**
```http
Authorization: Bearer {jwt_token}
Content-Type: application/json
X-Client-Version: 1.0.0
```

**Middleware de autorización:**
```csharp
[Authorize(Roles = "ADMIN,OBRADOR")]
public class FacturasController : ControllerBase { ... }

[Authorize(Policy = "RequierePermisoCrearFactura")]
public async Task<IActionResult> CrearFactura(...) { ... }
```

---

## 5. CLIENTE DESKTOP (WPF)

### 5.1. Arquitectura Cliente

```
┌──────────────────────────────────────────────────┐
│                    VIEW (XAML)                   │
│  - UserControls                                  │
│  - Windows                                       │
│  - Data Binding                                  │
└─────────────────┬────────────────────────────────┘
                  │ Binding
┌─────────────────▼────────────────────────────────┐
│               VIEW MODEL (MVVM)                  │
│  - Propiedades observables                       │
│  - Commands (ICommand)                           │
│  - Validación                                    │
│  - Estado UI                                     │
└─────────────────┬────────────────────────────────┘
                  │ Calls
┌─────────────────▼────────────────────────────────┐
│                  SERVICES                        │
│  - ApiService (HTTP Client)                      │
│  - AuthService                                   │
│  - CacheService                                  │
│  - PrintService                                  │
└─────────────────┬────────────────────────────────┘
                  │ HTTP/HTTPS
┌─────────────────▼────────────────────────────────┐
│                 API BACKEND                      │
└──────────────────────────────────────────────────┘
```

### 5.2. Módulos Cliente Obrador

1. **Dashboard**
   - Ventas del día
   - Stock bajo
   - Lotes próximos a caducar
   - Pedidos pendientes

2. **Gestión de Clientes**
   - CRUD completo
   - Búsqueda avanzada
   - Historial de compras

3. **Catálogo de Productos**
   - Gestión de productos
   - Ingredientes y alérgenos
   - Precios por tipo de cliente

4. **Producción**
   - Planificar producción
   - Registrar lotes
   - Control de calidad

5. **Stock**
   - Visualización consolidada
   - Movimientos
   - Ajustes de inventario
   - Alertas

6. **Pedidos**
   - Crear pedidos
   - Gestionar estado
   - Generar albaranes

7. **Albaranes**
   - Crear albaranes
   - Impresión
   - Conversión a factura

8. **Facturación**
   - Crear facturas
   - Desde albaranes o directa
   - Asignación automática de lotes
   - Generación PDF
   - Impresión

9. **Trazabilidad**
   - Consultas inversas
   - Informes regulatorios

10. **Reporting**
    - Informes predefinidos
    - Exportación Excel
    - Gráficos

### 5.3. Cliente Repartidor (Simplificado)

**Foco:** Velocidad operativa máxima

1. **Facturación Rápida**
   - Selección rápida de cliente
   - Catálogo de productos con búsqueda instantánea
   - Añadir productos por cantidad (sin gestionar lotes manualmente)
   - Sistema asigna lotes automáticamente
   - Vista previa factura
   - Generar e imprimir (1 click)

2. **Mis Clientes**
   - Gestión de clientes propios
   - Historial de ventas

3. **Stock Disponible**
   - Consulta en tiempo real
   - Sin gestión (solo lectura)

4. **Historial de Facturas**
   - Consulta
   - Reimpresión

**UX Key:** Desde abrir cliente hasta imprimir factura en < 30 segundos

---

## 6. MOTOR DE ASIGNACIÓN DE LOTES (CORE DEL SISTEMA)

### 6.1. Algoritmo FIFO

**Clase Domain Service:**

```csharp
public class LoteAsignacionService
{
    private readonly ILoteRepository _loteRepository;
    private readonly IStockRepository _stockRepository;

    public async Task<List<LoteAsignado>> AsignarLotesAutomatico(
        int empresaId, 
        int productoId, 
        decimal cantidadSolicitada)
    {
        // 1. Obtener lotes disponibles ordenados FIFO
        var lotesDisponibles = await _loteRepository.ObtenerDisponibles(
            empresaId, 
            productoId, 
            orderBy: l => l.FechaFabricacion
        );

        // 2. Algoritmo de asignación
        var linesAsignadas = new List<LoteAsignado>();
        decimal cantidadRestante = cantidadSolicitada;

        foreach (var lote in lotesDisponibles)
        {
            if (cantidadRestante <= 0) break;

            var stock = await _stockRepository.ObtenerPorLote(empresaId, productoId, lote.Id);
            
            if (stock.CantidadDisponible <= 0) continue;
            if (lote.FechaCaducidad < DateTime.Now) continue;
            if (lote.Bloqueado) continue;

            var cantidadAASignar = Math.Min(stock.CantidadDisponible, cantidadRestante);

            linesAsignadas.Add(new LoteAsignado
            {
                LoteId = lote.Id,
                LoteCodigo = lote.Codigo,
                Cantidad = cantidadAASignar,
                FechaCaducidad = lote.FechaCaducidad
            });

            cantidadRestante -= cantidadAASignar;
        }

        // 3. Validar que se pudo asignar todo
        if (cantidadRestante > 0)
        {
            throw new StockInsuficienteException(
                $"Stock insuficiente. Solicitado: {cantidadSolicitada}, Disponible: {cantidadSolicitada - cantidadRestante}"
            );
        }

        return linesAsignadas;
    }
}
```

### 6.2. Flujo de Creación de Factura con Asignación Automática

```
1. Usuario selecciona producto y cantidad (sin lote)
   ↓
2. Sistema llama a LoteAsignacionService.AsignarLotesAutomatico()
   ↓
3. Servicio devuelve lista de lotes asignados (puede ser 1 o N)
   ↓
4. Sistema crea 1 línea de factura POR CADA lote asignado
   FacturaLinea 1: 3 cajas - Lote A - Cad: 01/03/2026
   FacturaLinea 2: 4 cajas - Lote B - Cad: 02/03/2026
   FacturaLinea 3: 3 cajas - Lote C - Cad: 03/03/2026
   ↓
5. Actualizar stock de cada lote
   ↓
6. Registrar movimientos de stock
   ↓
7. Registrar trazabilidad (lote → cliente)
   ↓
8. Generar PDF factura
```

**Resultado:** Usuario pidió 10 cajas, sistema generó automáticamente 3 líneas con lotes correctos, sin intervención manual.

---

## 7. SEGURIDAD

### 7.1. Capas de Seguridad

| Capa | Medidas |
|------|---------|
| **Red** | Firewall, IPs whitelist (opcional), TLS 1.3 |
| **Aplicación** | JWT, HTTPS only, CORS restrictivo |
| **Autenticación** | Bcrypt passwords, tokens con expiración |
| **Autorización** | Roles + Claims, políticas granulares |
| **Datos** | Encriptación en reposo (futuro), SQL injection protection (EF) |
| **Auditoría** | Logs completos, triggers auditoría DB |

### 7.2. Gestión de Secretos

```bash
# Variables de entorno (no commitear)
.env.production
  DB_PASSWORD=xxxxx
  JWT_SECRET=xxxxx
  ENCRYPTION_KEY=xxxxx

# Azure Key Vault / AWS Secrets Manager (producción futura)
```

### 7.3. Políticas de Acceso

| Rol | Permisos |
|-----|----------|
| **ADMIN** | Full access, configuración sistema |
| **OBRADOR** | Gestión completa operativa, reporting |
| **REPARTIDOR** | Solo facturación propia, consulta stock, clientes propios |
| **SOLO_LECTURA** | Consultas, reporting, sin modificaciones |

---

## 8. ESCALABILIDAD

### 8.1. Escalado Vertical (Corto Plazo)

- Aumentar recursos servidor (CPU, RAM)
- SSD más rápidos
- Optimización de índices DB

### 8.2. Escalado Horizontal (Futuro)

```
Load Balancer
    ├── API Instance 1
    ├── API Instance 2
    └── API Instance 3
         ↓
    PostgreSQL Master
         ↓
    PostgreSQL Slaves (read replicas)
```

### 8.3. Optimizaciones de Performance

- **Caché:** Redis para datos frecuentes (catálogo productos, configuración)
- **CDN:** Archivos estáticos (futuros)
- **Compresión:** Gzip/Brotli en API responses
- **Paginación:** Obligatoria en listados
- **Background Jobs:** Hangfire para tareas pesadas (reportes, backups)
- **Connection Pooling:** Npgsql configurado correctamente

---

## 9. MONITORIZACIÓN Y LOGGING

### 9.1. Logging

**Serilog + Seq (o ELK Stack)**

```csharp
Log.Information("Usuario {UserId} creó factura {FacturaId}", userId, facturaId);
Log.Warning("Stock bajo para producto {ProductoId}: {Cantidad}", productoId, cantidad);
Log.Error(ex, "Error al generar PDF factura {FacturaId}", facturaId);
```

**Niveles:**
- **Debug:** Desarrollo
- **Information:** Operaciones normales
- **Warning:** Stocks bajos, caducidades próximas
- **Error:** Excepciones, fallos
- **Fatal:** Sistema no operativo

### 9.2. Métricas

- Requests/segundo
- Tiempo de respuesta API
- Uso de CPU/RAM/Disco
- Conexiones DB activas
- Tasa de errores
- Facturas generadas/día

### 9.3. Alertas

- Stock por debajo de mínimo
- Lotes próximos a caducar (7 días)
- Errores críticos en API
- Disco > 80%
- DB sin backup > 24h

---

## 10. DEPLOYMENT

### 10.1. CI/CD Pipeline (Futuro)

```yaml
# GitHub Actions / GitLab CI
Build → Test → Docker Build → Push to Registry → Deploy to Server → Health Check
```

### 10.2. Estrategia de Despliegue

**Fase MVP:**
- Despliegue manual vía Docker Compose
- Script de deployment

**Fase Producción:**
- CI/CD automatizado
- Blue-Green deployment
- Rollback automático si falla health check

### 10.3. Health Checks

```csharp
// API Health Endpoint
GET /health
Response:
{
  "status": "Healthy",
  "database": "Connected",
  "version": "1.0.0",
  "timestamp": "2026-02-20T10:30:00Z"
}
```

---

## 11. ROADMAP TÉCNICO

### Fase 1: MVP (3-4 meses)
- ✅ Diseño DB
- ✅ Arquitectura
- ⏳ Backend API core
- ⏳ Cliente desktop básico
- ⏳ Automatización lotes

### Fase 2: Producción (2 meses)
- Testing completo
- Deployment infraestructura
- Migración datos
- Formación usuarios

### Fase 3: Optimización (ongoing)
- Performance tuning
- Caché
- Reporting avanzado
- Analytics

### Fase 4: Escalabilidad (futuro)
- Multi-empresa
- Replicación
- Integración contable
- API pública

---

## CONCLUSIÓN

Arquitectura profesional, escalable, mantenible, preparada para:

✅ Operación en producción real  
✅ Automatización completa de lotes  
✅ Multiusuario distribuido  
✅ Seguridad enterprise  
✅ Escalabilidad futura  
✅ Integración con sistemas externos  
✅ Cumplimiento normativo  

**Próximo paso:** Desarrollo backend + stored procedures DB + cliente desktop MVP
