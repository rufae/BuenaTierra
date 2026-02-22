# Manual de Instalación — BuenaTierra

**Sistema BuenaTierra — Versión 1.0**  
**Requisitos: Docker Desktop, .NET 9 SDK, Node.js 20+**

---

## 1. Requisitos previos

| Software | Versión mínima | Notas |
|----------|---------------|-------|
| Docker Desktop | 4.x | Con Docker Compose v2 |
| .NET SDK | 9.0 | Para compilar/ejecutar el API |
| Node.js | 20 LTS | Para compilar el frontend |
| PostgreSQL | 15 (vía Docker) | Incluido en docker-compose |

---

## 2. Estructura de directorios

```
BuenaTierra/
├── src/
│   ├── BuenaTierra.API/           # ASP.NET Core 9 API
│   ├── BuenaTierra.Application/   # Interfaces y DTOs
│   ├── BuenaTierra.Domain/        # Entidades y lógica de dominio
│   └── BuenaTierra.Infrastructure/# EF Core, repositorios, servicios
├── tests/
│   └── BuenaTierra.Tests/         # Tests unitarios xUnit
├── frontend/                      # React 18 + Vite + TypeScript
├── docs/                          # Documentación
├── docker-compose.yml             # Infraestructura Docker
└── BuenaTierra.sln
```

---

## 3. Configuración de entorno

### 3.1 Variables de entorno del API

Crear o editar `src/BuenaTierra.API/appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5433;Database=buenatierra;Username=buenatierra_admin;Password=TU_PASSWORD_SEGURA"
  },
  "Jwt": {
    "Secret": "TU_CLAVE_JWT_MAS_DE_32_CARACTERES_AQUI",
    "Issuer": "BuenaTierra",
    "Audience": "BuenaTierraClients",
    "ExpiresHours": 8
  },
  "Serilog": {
    "MinimumLevel": "Information"
  }
}
```

### 3.2 Variables de entorno del frontend

Crear `frontend/.env`:

```env
VITE_API_URL=http://localhost:5001/api
```

---

## 4. Instalación con Docker (recomendado)

### 4.1 Levantar base de datos

```bash
docker-compose up -d buenatierra_db
```

Verificar que PostgreSQL está activo:
```bash
docker exec buenatierra_db pg_isready -U buenatierra_admin -d buenatierra
```

### 4.2 Aplicar migraciones

```bash
cd src/BuenaTierra.API
dotnet ef database update
```

O directamente:
```bash
dotnet run --project src/BuenaTierra.API -- --migrate
```

### 4.3 Crear índices de rendimiento

```bash
docker exec buenatierra_db psql -U buenatierra_admin -d buenatierra -c "
  CREATE INDEX IF NOT EXISTS idx_trazabilidad_empresa_fecha ON trazabilidad(empresa_id, fecha_operacion DESC);
  CREATE INDEX IF NOT EXISTS idx_trazabilidad_tipo_fecha ON trazabilidad(tipo_operacion, fecha_operacion DESC);
  CREATE INDEX IF NOT EXISTS idx_facturas_empresa_fecha ON facturas(empresa_id, fecha_factura DESC);
  CREATE INDEX IF NOT EXISTS idx_lotes_empresa_caducidad ON lotes(empresa_id, fecha_caducidad);
  CREATE INDEX IF NOT EXISTS idx_stock_empresa_producto ON stock(empresa_id, producto_id);
"
```

### 4.4 Levantar el API

```bash
dotnet run --project src/BuenaTierra.API
```

El API quedará disponible en: `http://localhost:5001`  
Swagger: `http://localhost:5001/swagger`

### 4.5 Levantar el Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend disponible en: `http://localhost:5173`

---

## 5. Instalación en producción

### 5.1 Compilar frontend (build estático)

```bash
cd frontend
npm run build
# Archivos estáticos en: frontend/dist/
```

### 5.2 Publicar el API

```bash
dotnet publish src/BuenaTierra.API -c Release -o publish/api
```

### 5.3 Variables de producción

Usar variables de entorno del sistema operativo o `appsettings.Production.json`:

```bash
export ConnectionStrings__DefaultConnection="Host=...;..."
export Jwt__Secret="clave-super-secreta-produccion"
```

### 5.4 Nginx (proxy inverso recomendado)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    # Frontend
    location / {
        root /var/www/buenatierra/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 6. Primer inicio

1. Acceder a `http://localhost:5173/login`
2. Credenciales por defecto (solo en Development):
   - Email: `admin@buenatierra.com`
   - Contraseña: `Admin#BuenaTierra2025`
3. **Cambiar la contraseña inmediatamente en producción**
4. Crear la empresa desde el panel de administración
5. Crear usuarios para el obrador y los repartidores

---

## 7. Backup de base de datos

### Backup manual
```bash
docker exec buenatierra_db pg_dump -U buenatierra_admin buenatierra > backup_$(date +%Y%m%d).sql
```

### Restaurar backup
```bash
docker exec -i buenatierra_db psql -U buenatierra_admin buenatierra < backup_20250101.sql
```

---

## 8. Ejecutar tests

```bash
dotnet test tests/BuenaTierra.Tests/BuenaTierra.Tests.csproj --verbosity normal
```

---

## 9. Health check

El API expone un endpoint de salud:
```
GET http://localhost:5001/health
→ { "status": "healthy", "timestamp": "2025-01-01T..." }
```

---

*Para soporte de instalación, contactar con el equipo técnico.*
