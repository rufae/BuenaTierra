# Guía de inicio · BuenaTierra

Pasos para levantar el entorno de desarrollo completo (base de datos, API y frontend).

---

## Requisitos previos

| Herramienta | Versión mínima | Verificar |
|---|---|---|
| Docker Desktop | 24+ | `docker --version` |
| .NET SDK | 9.0 | `dotnet --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |

---

## 1. Clonar el repositorio (primera vez)

```bash
git clone <URL_DEL_REPO>
cd BuenaTierra
```

---

## 2. Variables de entorno (primera vez)

Copia el fichero de ejemplo y rellena los valores:

```bash
copy .env.example .env
```

El `.env` necesita como mínimo:

```env
POSTGRES_PASSWORD=BuenaTierra2025!Seguro#Dev
```

> El resto de valores ya tienen defaults en `docker-compose.yml`.

---

## 3. Arrancar la base de datos (Docker)

```powershell
docker compose up db -d
```

Espera a que el contenedor esté **healthy** (~10-15 s):

```powershell
docker ps --filter name=buenatierra_db
```

La columna `STATUS` debe mostrar `(healthy)`.

> Puerto expuesto: `localhost:5433` (PostgreSQL)

---

## 4. Instalar dependencias del frontend (primera vez)

```powershell
cd frontend
npm install
cd ..
```

---

## 5. Restaurar paquetes .NET (primera vez)

```powershell
dotnet restore BuenaTierra.sln
```

---

## 6. Compilar el backend

```powershell
dotnet build BuenaTierra.sln --no-restore -v q
```

El resultado debe ser **0 Errores**.

---

## 7. Arrancar la API (.NET)

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
Start-Job -ScriptBlock {
    cd "c:\Users\rafae\Desktop\PROYECTOS\BuenaTierra\src\BuenaTierra.API"
    $env:ASPNETCORE_ENVIRONMENT = "Development"
    dotnet run --no-build --urls "http://localhost:5001"
} | Out-Null
```

Verificar que está escuchando:

```powershell
netstat -ano | findstr ":5001"
```

> URL base de la API: `http://localhost:5001`  
> Swagger UI: `http://localhost:5001/swagger`

---

## 8. Arrancar el frontend (Vite)

En otra terminal:

```powershell
Start-Job -ScriptBlock {
    cd "c:\Users\rafae\Desktop\PROYECTOS\BuenaTierra\frontend"
    npm run dev
} | Out-Null
```

Verificar:

```powershell
netstat -ano | findstr ":5173"
```

> URL frontend: `http://localhost:5173`

---

## Resumen: secuencia completa de inicio

```powershell
# 1. DB
docker compose up db -d

# 2. Compilar
dotnet build BuenaTierra.sln --no-restore -v q

# 3. API
Start-Job -ScriptBlock {
    cd "c:\Users\rafae\Desktop\PROYECTOS\BuenaTierra\src\BuenaTierra.API"
    $env:ASPNETCORE_ENVIRONMENT = "Development"
    dotnet run --no-build --urls "http://localhost:5001"
} | Out-Null

# 4. Frontend
Start-Job -ScriptBlock {
    cd "c:\Users\rafae\Desktop\PROYECTOS\BuenaTierra\frontend"
    npm run dev
} | Out-Null
```

---

## Parar el proyecto

```powershell
# Parar API y frontend (todos los jobs de PowerShell)
Get-Job | Stop-Job; Get-Job | Remove-Job

# Parar procesos dotnet sueltos
Get-Process -Name dotnet -ErrorAction SilentlyContinue | Stop-Process -Force

# Parar la base de datos
docker compose stop db
```

---

## URLs de acceso

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API REST | http://localhost:5001 |
| Swagger | http://localhost:5001/swagger |
| PostgreSQL | localhost:5433 |

---

## Credenciales de base de datos (desarrollo)

| Campo | Valor |
|---|---|
| Host | localhost |
| Puerto | 5433 |
| Base de datos | buenatierra |
| Usuario | buenatierra_admin |
| Contraseña | BuenaTierra2025!Seguro#Dev |

---

## Solución de problemas frecuentes

### Puerto 5001 en uso
```powershell
Get-Process -Name dotnet | Stop-Process -Force
```

### Puerto 5173 en uso
```powershell
Get-Process -Name node | Stop-Process -Force
```

### El contenedor DB no arranca
```powershell
docker compose down -v   # ⚠ borra datos del volumen
docker compose up db -d
```

### Error `File is locked by another process` al compilar
Asegúrate de haber parado todos los procesos `dotnet` antes de compilar.
