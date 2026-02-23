# BuenaTierra — Manual de Despliegue a Producción

> **Arquitectura elegida:** Vercel (Frontend) + Google Cloud Run (Backend .NET) + Supabase (PostgreSQL)
>
> **Cuándo usar esto:** cuando la aplicación esté completamente testeada y se quiera estrenar en producción para el cliente.
>
> **Este documento es completo y autónomo.** Sigue los pasos en orden.

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Pre-requisitos y herramientas necesarias](#2-pre-requisitos-y-herramientas-necesarias)
3. [Fase 1 — Base de datos en Supabase](#3-fase-1--base-de-datos-en-supabase)
4. [Fase 2 — Dockerizar el backend .NET](#4-fase-2--dockerizar-el-backend-net)
5. [Fase 3 — Google Cloud Run (Backend)](#5-fase-3--google-cloud-run-backend)
6. [Fase 4 — Vercel (Frontend)](#6-fase-4--vercel-frontend)
7. [Fase 5 — Variables de entorno y secretos](#7-fase-5--variables-de-entorno-y-secretos)
8. [Fase 6 — CORS y comunicación Frontend ↔ Backend](#8-fase-6--cors-y-comunicación-frontend--backend)
9. [Fase 7 — Migraciones de base de datos en producción](#9-fase-7--migraciones-de-base-de-datos-en-producción)
10. [Fase 8 — CI/CD con GitHub Actions](#10-fase-8--cicd-con-github-actions)
11. [Fase 9 — Dominio personalizado](#11-fase-9--dominio-personalizado)
12. [Fase 10 — Seguridad en producción](#12-fase-10--seguridad-en-producción)
13. [Fase 11 — Monitorización y logs](#13-fase-11--monitorización-y-logs)
14. [Fase 12 — Backups de base de datos](#14-fase-12--backups-de-base-de-datos)
15. [Troubleshooting frecuente](#15-troubleshooting-frecuente)
16. [Checklist final antes de dar acceso al cliente](#16-checklist-final-antes-de-dar-acceso-al-cliente)
17. [Límites del tier gratuito — tabla resumen](#17-límites-del-tier-gratuito--tabla-resumen)

---

## 1. Arquitectura general

```
Cliente (navegador / dispositivo)
        │
        ▼
┌───────────────────┐
│   Vercel           │  ← React + Vite (frontend estático)
│   (CDN global)     │     URL: https://buenatierra.vercel.app
└────────┬──────────┘
         │  peticiones /api/*
         ▼
┌───────────────────┐
│  Google Cloud Run  │  ← ASP.NET Core 9 (Docker container)
│  (europe-west1)    │     URL: https://buenatierra-api-xxxx.run.app
└────────┬──────────┘
         │  Npgsql connection string
         ▼
┌───────────────────┐
│    Supabase        │  ← PostgreSQL 15 gestionado
│  (AWS eu-central)  │     Con pooler (pgbouncer) automático
└───────────────────┘
```

**Flujos de red:**
- El usuario accede siempre a la URL de Vercel.
- El frontend llama a la API de Cloud Run mediante variable de entorno `VITE_API_URL`.
- La API conecta a Supabase a través de SSL obligatorio.
- Ningún puerto queda expuesto directamente; todo va por HTTPS.

---

## 2. Pre-requisitos y herramientas necesarias

### Cuentas a crear (todas gratuitas)

| Servicio | URL | Tier gratuito |
|---|---|---|
| Google Cloud | cloud.google.com | 90 días + $300 crédito inicial; Cloud Run tiene cuota permanente |
| Supabase | supabase.com | 2 proyectos gratuitos, 500 MB DB, 2 GB transferencia |
| Vercel | vercel.com | Ilimitado para proyectos personales y pequeños equipos |
| GitHub | github.com | Necesario para CI/CD y para conectar Vercel |

### Herramientas locales a instalar

```bash
# 1. Google Cloud CLI
# Windows: descargar instalador desde https://cloud.google.com/sdk/docs/install
# Verificar:
gcloud --version

# 2. Docker Desktop
# https://www.docker.com/products/docker-desktop
docker --version

# 3. .NET 9 SDK (ya deberías tenerlo)
dotnet --version

# 4. Node.js 20+ (ya deberías tenerlo)
node --version

# 5. Vercel CLI
npm install -g vercel
vercel --version

# 6. psql (cliente PostgreSQL para migraciones)
# Windows: incluido en instalación de PostgreSQL o instalar PostgreSQL client only
psql --version
```

---

## 3. Fase 1 — Base de datos en Supabase

### 3.1 Crear proyecto

1. Ir a [app.supabase.com](https://app.supabase.com) → **New Project**
2. Introducir:
   - **Name:** `buenatierra-prod`
   - **Database Password:** contraseña fuerte (guardar en gestor de contraseñas)
   - **Region:** `eu-central-1 (Frankfurt)` — más cercano a España
   - **Pricing plan:** Free
3. Esperar ~2 minutos a que el proyecto se inicialice.

### 3.2 Obtener credenciales de conexión

En **Settings → Database → Connection string**, copiar:

```
# Modo direct (para migraciones desde local)
postgresql://postgres:[TU_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

# Modo pooler (para la API en Cloud Run — recomendado)
postgresql://postgres.[PROJECT_REF]:[TU_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

> ⚠️ **Importante:** el backend en producción debe usar el **pooler URL** con `?pgbouncer=true`. Cloud Run puede escalar a varias instancias y el pooler evita que se saturen las conexiones de Postgres.

### 3.3 Configurar Npgsql para pgbouncer en `appsettings.Production.json`

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=aws-0-eu-central-1.pooler.supabase.com;Port=6543;Database=postgres;Username=postgres.[PROJECT_REF];Password=[TU_PASSWORD];SSL Mode=Require;Trust Server Certificate=true;Pooling=false;Maximum Pool Size=1"
  }
}
```

> `Pooling=false` y `Maximum Pool Size=1` son necesarios cuando se usa pgBouncer en modo `transaction` (que es el default de Supabase). Npgsql gestiona el pool internamente; pgbouncer lo vuelve a hacer externamente → doble pooling causa problemas.

### 3.4 Configurar Row Level Security (opcional pero recomendado)

Supabase activa RLS por defecto en tablas nuevas. Si usas EF Core directamente (sin PostgREST), puedes desactivar RLS para tus tablas desde el panel **Table Editor → [tabla] → RLS → Disable RLS** ya que la seguridad la gestiona tu API con JWT propio.

---

## 4. Fase 2 — Dockerizar el backend .NET

### 4.1 Crear `Dockerfile` en la raíz del proyecto

Crear en `c:\...\BuenaTierra\Dockerfile` (raíz de la solución):

```dockerfile
# ── Etapa 1: Build ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copiar solución y proyectos para restaurar dependencias en caché
COPY BuenaTierra.sln ./
COPY src/BuenaTierra.Domain/BuenaTierra.Domain.csproj           src/BuenaTierra.Domain/
COPY src/BuenaTierra.Application/BuenaTierra.Application.csproj src/BuenaTierra.Application/
COPY src/BuenaTierra.Infrastructure/BuenaTierra.Infrastructure.csproj src/BuenaTierra.Infrastructure/
COPY src/BuenaTierra.API/BuenaTierra.API.csproj                 src/BuenaTierra.API/

RUN dotnet restore

# Copiar todo el código y publicar
COPY . .
RUN dotnet publish src/BuenaTierra.API/BuenaTierra.API.csproj \
    -c Release -o /app/publish --no-restore

# ── Etapa 2: Runtime ─────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Cloud Run usa el puerto 8080 por convención
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "BuenaTierra.API.dll"]
```

### 4.2 Crear `.dockerignore`

Crear en la raíz `\.dockerignore`:

```
**/bin/
**/obj/
**/.vs/
**/node_modules/
frontend/
docs/
tests/
*.md
.git/
.gitignore
```

### 4.3 Construir y probar localmente

```bash
# Desde la raíz del proyecto
cd C:\Users\rafae\Desktop\PROYECTOS\BuenaTierra

# Construir imagen
docker build -t buenatierra-api:local .

# Probar localmente contra Supabase
docker run -p 8080:8080 \
  -e ConnectionStrings__DefaultConnection="[TU_CONNECTION_STRING_SUPABASE]" \
  -e JwtSettings__SecretKey="[TU_JWT_SECRET_MINIMO_32_CHARS]" \
  -e JwtSettings__Issuer="buenatierra-api" \
  -e JwtSettings__Audience="buenatierra-app" \
  buenatierra-api:local

# Verificar en navegador: http://localhost:8080/swagger
```

---

## 5. Fase 3 — Google Cloud Run (Backend)

### 5.1 Crear proyecto GCP y activar APIs necesarias

```bash
# Iniciar sesión
gcloud auth login

# Crear proyecto (si no tienes uno)
gcloud projects create buenatierra-prod --name="BuenaTierra Produccion"

# Seleccionar proyecto
gcloud config set project buenatierra-prod

# Activar APIs necesarias
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# Verificar facturación activa (necesario incluso para free tier)
# Ir a: https://console.cloud.google.com/billing
```

### 5.2 Configurar Artifact Registry (donde se almacenará la imagen Docker)

```bash
# Crear repositorio de Docker en Artifact Registry
gcloud artifacts repositories create buenatierra-repo \
  --repository-format=docker \
  --location=europe-west1 \
  --description="BuenaTierra API Docker images"

# Configurar autenticación de Docker con GCP
gcloud auth configure-docker europe-west1-docker.pkg.dev
```

### 5.3 Build y push de la imagen

```bash
# Definir variables (adaptar PROJECT_ID real)
export PROJECT_ID=buenatierra-prod
export REGION=europe-west1
export IMAGE=europe-west1-docker.pkg.dev/$PROJECT_ID/buenatierra-repo/api:latest

# Build (con plataforma linux/amd64 — Cloud Run lo requiere)
docker build --platform linux/amd64 -t $IMAGE .

# Push
docker push $IMAGE
```

> **Windows PowerShell:** usar `$env:PROJECT_ID = "buenatierra-prod"` en lugar de `export`.

```powershell
# Equivalente en PowerShell
$PROJECT_ID = "buenatierra-prod"
$REGION = "europe-west1"
$IMAGE = "europe-west1-docker.pkg.dev/$PROJECT_ID/buenatierra-repo/api:latest"

docker build --platform linux/amd64 -t $IMAGE .
docker push $IMAGE
```

### 5.4 Crear secretos en Secret Manager (para credenciales)

```bash
# Connection string de la DB
echo -n "Host=...supabase.com;Port=6543;..." | \
  gcloud secrets create DB_CONNECTION_STRING --data-file=-

# JWT Secret (mínimo 32 caracteres, generado aleatoriamente)
echo -n "tu_jwt_secret_muy_largo_y_aleatorio_aqui" | \
  gcloud secrets create JWT_SECRET --data-file=-
```

### 5.5 Desplegar en Cloud Run

```bash
gcloud run deploy buenatierra-api \
  --image $IMAGE \
  --platform managed \
  --region $REGION \
  --port 8080 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-secrets "ConnectionStrings__DefaultConnection=DB_CONNECTION_STRING:latest" \
  --set-secrets "JwtSettings__SecretKey=JWT_SECRET:latest" \
  --set-env-vars "ASPNETCORE_ENVIRONMENT=Production" \
  --set-env-vars "JwtSettings__Issuer=buenatierra-api" \
  --set-env-vars "JwtSettings__Audience=buenatierra-app" \
  --set-env-vars "JwtSettings__ExpirationMinutes=1440"
```

Al finalizar, Cloud Run muestra la URL del servicio estilo:
```
https://buenatierra-api-xxxxxxxx-ew.a.run.app
```

### 5.6 Verificar el despliegue

```bash
# Comprobar Swagger (debería devolver HTML)
curl https://buenatierra-api-xxxxxxxx-ew.a.run.app/swagger/index.html

# Comprobar health endpoint
curl https://buenatierra-api-xxxxxxxx-ew.a.run.app/health
```

> 💡 Si te devuelve 503, revisar logs: `gcloud run services logs read buenatierra-api --region $REGION --limit 50`

---

## 6. Fase 4 — Vercel (Frontend)

### 6.1 Preparar el build del frontend para producción

En `frontend/src/lib/api.ts`, asegurarse de que la base URL use la variable de entorno:

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/api',
  // ...
})
```

En `frontend/vite.config.ts`, verificar que no haya rutas hardcodeadas a `localhost`:

```typescript
export default defineConfig({
  plugins: [react()],
  // No añadir proxy aquí — en producción el frontend llama directo a Cloud Run
})
```

### 6.2 Crear `vercel.json` en la carpeta `frontend/`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

> El `rewrites` es esencial para que React Router funcione correctamente — sin él, un refresh de página en `/produccion` daría 404.

### 6.3 Desplegar en Vercel (opción A: desde CLI)

```bash
cd frontend

# Login (solo la primera vez)
vercel login

# Despliegue de producción
vercel --prod

# Vercel preguntará:
# - Set up and deploy? → Y
# - Which scope? → tu cuenta
# - Link to existing project? → N (primera vez)
# - Project name → buenatierra
# - In which directory is your code? → . (punto)
# - Want to override? → N
```

### 6.4 Desplegar en Vercel (opción B: desde GitHub — recomendado para CI/CD)

1. Subir el repositorio a GitHub (ver [Sección 10](#10-fase-8--cicd-con-github-actions)).
2. Ir a [vercel.com/new](https://vercel.com/new).
3. Importar el repositorio de GitHub.
4. Configurar:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Añadir variable de entorno (ver Sección 7).
6. **Deploy**.

### 6.5 Configurar variables de entorno en Vercel

En el panel de Vercel → **Settings → Environment Variables**:

| Variable | Valor | Entorno |
|---|---|---|
| `VITE_API_URL` | `https://buenatierra-api-xxxx.run.app` | Production |
| `VITE_API_URL` | `http://localhost:5001` | Development |

---

## 7. Fase 5 — Variables de entorno y secretos

### Resumen completo de variables por servicio

#### Backend (Cloud Run) — via Secret Manager o env vars

| Variable | Descripción | Ejemplo |
|---|---|---|
| `ConnectionStrings__DefaultConnection` | Pooler URL de Supabase | `Host=...supabase.com;Port=6543;...` |
| `JwtSettings__SecretKey` | Clave secreta JWT (≥ 32 chars) | generada aleatoriamente |
| `JwtSettings__Issuer` | Issuer del token | `buenatierra-api` |
| `JwtSettings__Audience` | Audience del token | `buenatierra-app` |
| `JwtSettings__ExpirationMinutes` | Duración del token | `1440` (24h) |
| `ASPNETCORE_ENVIRONMENT` | Entorno | `Production` |

#### Frontend (Vercel) — variables `VITE_*`

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL base del backend en Cloud Run |

### Generar un JWT Secret seguro

```bash
# En PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))

# Salida ejemplo:
# 7K2mP9xQ4nR8vL1jY6wH3cA5oZ0bN7sDfE2gI4kU8pXqWtMrVyJhBnCeLuOaGi
```

---

## 8. Fase 6 — CORS y comunicación Frontend ↔ Backend

### 8.1 Actualizar la configuración de CORS en el backend

En `src/BuenaTierra.API/Program.cs`, asegurarse de que CORS permita el dominio de Vercel:

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.WithOrigins(
                    "http://localhost:5173",
                    "http://localhost:3000")
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        }
        else
        {
            // Producción: solo el dominio real de Vercel
            policy.WithOrigins(
                    "https://buenatierra.vercel.app",
                    "https://tudominio.com")          // si tienes dominio propio
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        }
    });
});

// Asegurarse de que esté antes de UseAuthentication
app.UseCors("AllowFrontend");
```

> ⚠️ Nunca usar `.AllowAnyOrigin()` con `.AllowCredentials()` a la vez en producción — genera error de CORS y es un riesgo de seguridad.

---

## 9. Fase 7 — Migraciones de base de datos en producción

### 9.1 Generar script SQL de migraciones

```bash
cd C:\Users\rafae\Desktop\PROYECTOS\BuenaTierra

# Generar script SQL idempotente de todas las migraciones
dotnet ef migrations script --output docs/migrations_prod.sql \
  --project src/BuenaTierra.Infrastructure \
  --startup-project src/BuenaTierra.API \
  --idempotent
```

> La opción `--idempotent` genera un script SQL que comprueba si cada migración ya fue aplicada antes de ejecutarla. Seguro para ejecutar múltiples veces.

### 9.2 Aplicar migraciones en Supabase

```bash
# Opción A: desde psql local contra la base de datos de Supabase (directa, no pooler)
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f docs/migrations_prod.sql

# Opción B: desde el SQL Editor de Supabase
# 1. Abrir app.supabase.com → tu proyecto → SQL Editor
# 2. Pegar el contenido de docs/migrations_prod.sql
# 3. Run
```

### 9.3 En despliegues futuros (migraciones incrementales)

Cuando añadas nuevas migraciones en desarrollo:

```bash
# 1. Crear migración normalmente en local
dotnet ef migrations add NombreDeLaMigracion \
  --project src/BuenaTierra.Infrastructure \
  --startup-project src/BuenaTierra.API

# 2. Generar script solo de la nueva migración
dotnet ef migrations script [MIGRACION_ANTERIOR] [NUEVA_MIGRACION] \
  --output docs/migration_incremental.sql \
  --project src/BuenaTierra.Infrastructure \
  --startup-project src/BuenaTierra.API

# 3. Aplicar en producción ANTES de desplegar el nuevo backend
psql "[SUPABASE_CONNECTION_STRING_DIRECT]" -f docs/migration_incremental.sql
```

> **Regla crítica:** siempre aplicar la migración de DB **antes** de desplegar el nuevo binario del backend. Nunca al contrario.

---

## 10. Fase 8 — CI/CD con GitHub Actions

### 10.1 Estructura de carpetas para Actions

Crear en la raíz del repositorio:

```
.github/
  workflows/
    deploy-backend.yml
    deploy-frontend.yml
```

### 10.2 Workflow: deploy del backend a Cloud Run

Crear `.github/workflows/deploy-backend.yml`:

```yaml
name: Deploy Backend → Cloud Run

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'Dockerfile'
      - '.dockerignore'

env:
  PROJECT_ID: buenatierra-prod
  REGION: europe-west1
  SERVICE: buenatierra-api
  IMAGE: europe-west1-docker.pkg.dev/buenatierra-prod/buenatierra-repo/api

jobs:
  deploy:
    name: Build, push & deploy
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Auth con GCP
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Configurar gcloud CLI
        uses: google-github-actions/setup-gcloud@v2

      - name: Configurar Docker para Artifact Registry
        run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

      - name: Build imagen Docker
        run: |
          docker build --platform linux/amd64 \
            -t ${{ env.IMAGE }}:${{ github.sha }} \
            -t ${{ env.IMAGE }}:latest \
            .

      - name: Push imagen
        run: |
          docker push ${{ env.IMAGE }}:${{ github.sha }}
          docker push ${{ env.IMAGE }}:latest

      - name: Deploy a Cloud Run
        run: |
          gcloud run deploy ${{ env.SERVICE }} \
            --image ${{ env.IMAGE }}:${{ github.sha }} \
            --platform managed \
            --region ${{ env.REGION }} \
            --port 8080 \
            --allow-unauthenticated \
            --memory 512Mi \
            --cpu 1 \
            --min-instances 0 \
            --max-instances 3 \
            --set-secrets "ConnectionStrings__DefaultConnection=DB_CONNECTION_STRING:latest" \
            --set-secrets "JwtSettings__SecretKey=JWT_SECRET:latest" \
            --set-env-vars "ASPNETCORE_ENVIRONMENT=Production,JwtSettings__Issuer=buenatierra-api,JwtSettings__Audience=buenatierra-app,JwtSettings__ExpirationMinutes=1440"
```

### 10.3 Workflow: deploy del frontend a Vercel

Crear `.github/workflows/deploy-frontend.yml`:

```yaml
name: Deploy Frontend → Vercel

on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'

jobs:
  deploy:
    name: Deploy a Vercel
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Build
        working-directory: frontend
        run: npm run build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}

      - name: Deploy a Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./frontend
          vercel-args: '--prod'
```

### 10.4 Crear Service Account en GCP para GitHub Actions

```bash
# Crear service account
gcloud iam service-accounts create github-ci \
  --description="CI/CD desde GitHub Actions" \
  --display-name="GitHub CI"

# Dar permisos necesarios
export SA_EMAIL=github-ci@buenatierra-prod.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding buenatierra-prod \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding buenatierra-prod \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding buenatierra-prod \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding buenatierra-prod \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding buenatierra-prod \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountUser"

# Crear y descargar clave JSON
gcloud iam service-accounts keys create github-ci-key.json \
  --iam-account=$SA_EMAIL
```

### 10.5 Configurar secretos en GitHub

En el repositorio de GitHub → **Settings → Secrets and variables → Actions**:

| Secret | Descripción |
|---|---|
| `GCP_SA_KEY` | Contenido completo del archivo `github-ci-key.json` |
| `VITE_API_URL` | URL de Cloud Run (ej. `https://buenatierra-api-xxxx.run.app`) |
| `VERCEL_TOKEN` | Token de API de Vercel (vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | ID de organización de Vercel (en `.vercel/project.json` tras primer deploy) |
| `VERCEL_PROJECT_ID` | ID de proyecto de Vercel (en `.vercel/project.json`) |

> 🔒 Borrar el archivo `github-ci-key.json` del disco local después de copiarlo a GitHub Secrets.

---

## 11. Fase 9 — Dominio personalizado

### 11.1 Para el frontend (Vercel)

1. Ir a Vercel → tu proyecto → **Settings → Domains**.
2. Añadir tu dominio (ej. `app.buenatierra.es`).
3. En tu registrador de DNS, añadir registro:
   ```
   CNAME  app  cname.vercel-dns.com
   ```
4. Vercel emite el certificado SSL automáticamente (Let's Encrypt).

### 11.2 Para el backend (Cloud Run)

```bash
# Mapear dominio personalizado a Cloud Run
gcloud run domain-mappings create \
  --service buenatierra-api \
  --domain api.buenatierra.es \
  --region europe-west1

# Cloud Run devolverá los registros DNS a añadir en el registrador
# Generalmente algo como:
# A     @    216.239.32.21
# AAAA  @    2001:4860:4802:32::15
```

> Con un custom domain la URL de la API sería `https://api.buenatierra.es` en lugar de la URL *.run.app. Actualizar `VITE_API_URL` en Vercel.

---

## 12. Fase 10 — Seguridad en producción

### Checklist de seguridad obligatorio

#### Backend
- [ ] `ASPNETCORE_ENVIRONMENT=Production` (desactiva Swagger en producción si lo tienes configurado así)
- [ ] JWT Secret de al menos 64 caracteres, generado aleatoriamente
- [ ] HTTPS obligatorio solo — `app.UseHttpsRedirection()` activo
- [ ] CORS restringido solo al dominio del frontend
- [ ] Logs sin datos sensibles (passwords, tokens, DNI)
- [ ] Validación de input en todos los endpoints (FluentValidation / DataAnnotations)
- [ ] Rate limiting activo para endpoints de login
- [ ] Headers de seguridad añadidos (Content-Security-Policy, HSTS, etc.)

#### Base de datos
- [ ] Contraseña de Supabase es fuerte y única
- [ ] No exponer Supabase connection string en el frontend nunca
- [ ] Backups automáticos configurados (ver Sección 12)
- [ ] SSL obligatorio en la cadena de conexión

#### Frontend
- [ ] No hay claves API ni tokens hardcodeados en el código
- [ ] Variables `VITE_*` solo para valores públicos (URL de API, no secrets)
- [ ] `vercel.json` con headers de seguridad (ya incluido en Sección 6.2)

### Deshabilitar Swagger en producción

En `Program.cs`:

```csharp
// Swagger solo en desarrollo
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

### Rate limiting en endpoints de autenticación

Añadir en `Program.cs`:

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("login", o =>
    {
        o.PermitLimit = 5;
        o.Window = TimeSpan.FromMinutes(1);
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit = 0;
    });
});

app.UseRateLimiter();
```

En el controlador de auth:
```csharp
[HttpPost("login")]
[EnableRateLimiting("login")]
public async Task<IActionResult> Login(...)
```

---

## 13. Fase 11 — Monitorización y logs

### 13.1 Ver logs en Google Cloud Run

```bash
# Logs en tiempo real
gcloud run services logs tail buenatierra-api --region europe-west1

# Últimos 100 logs
gcloud run services logs read buenatierra-api --region europe-west1 --limit 100

# Filtrar errores
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --project buenatierra-prod --limit 50
```

### 13.2 Google Cloud Monitoring (alertas gratuitas)

1. Ir a **Cloud Console → Monitoring → Alerting**.
2. Crear alerta para:
   - `run.googleapis.com/request_latencies` > 3 segundos
   - `run.googleapis.com/request_count` con `response_code_class=5xx` > 5/minuto
3. Configurar notificación por email.

### 13.3 Uptime Check (cada 5 min, gratuito)

1. **Monitoring → Uptime Checks → Create**.
2. URL: `https://buenatierra-api-xxxx.run.app/health`
3. Período: 5 minutos
4. Notificación por email si cae.

### 13.4 Health endpoint en la API

Verificar que existe en `Program.cs`:

```csharp
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));
```

### 13.5 Logs de Vercel

En Vercel → tu proyecto → **Deployments → [deployment] → Functions** para ver logs de build y errores de runtime.

---

## 14. Fase 12 — Backups de base de datos

### 14.1 Backup automático de Supabase (tier gratuito)

Supabase en el tier gratuito ofrece:
- **Point-in-Time Recovery:** NO incluido en free.
- **Backup manual:** sí disponible desde el panel.

Para el tier gratuito, configurar backup externo:

### 14.2 Script de backup manual con pg_dump

Crear en local (ejecutar periódicamente o añadir a CI):

```bash
#!/bin/bash
# backup_supabase.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
mkdir -p $BACKUP_DIR

PGPASSWORD="[TU_PASSWORD]" pg_dump \
  -h db.[PROJECT_REF].supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -F c \
  -f "$BACKUP_DIR/buenatierra_backup_$DATE.dump"

echo "Backup creado: $BACKUP_DIR/buenatierra_backup_$DATE.dump"

# Mantener solo los últimos 7 backups
ls -t $BACKUP_DIR/*.dump | tail -n +8 | xargs rm -f
```

### 14.3 Restaurar un backup

```bash
PGPASSWORD="[TU_PASSWORD]" pg_restore \
  -h db.[PROJECT_REF].supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -c \
  backups/buenatierra_backup_[fecha].dump
```

### 14.4 GitHub Actions para backup semanal (guarda en Artifacts)

Añadir `.github/workflows/db-backup.yml`:

```yaml
name: Backup DB semanal

on:
  schedule:
    - cron: '0 3 * * 0'  # Cada domingo a las 3:00 UTC
  workflow_dispatch:      # También manual desde UI

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install pg_dump
        run: sudo apt-get install -y postgresql-client

      - name: Dump database
        env:
          PGPASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: |
          pg_dump \
            -h ${{ secrets.SUPABASE_DB_HOST }} \
            -p 5432 -U postgres -d postgres \
            -F c -f backup_$(date +%Y%m%d).dump

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: db-backup-${{ github.run_id }}
          path: backup_*.dump
          retention-days: 30
```

---

## 15. Troubleshooting frecuente

### ❌ Cloud Run devuelve 503 Service Unavailable

```bash
# Ver logs de error
gcloud run services logs read buenatierra-api --region europe-west1 --limit 50

# Causas más comunes:
# 1. La imagen no arranca en el puerto 8080 → verificar ASPNETCORE_URLS=http://+:8080
# 2. Falla la conexión a Supabase → verificar SSL y URL pooler
# 3. EF Core intenta migración al arrancar y falla → deshabilitar AutoMigrate on startup
```

### ❌ CORS error en el navegador

```
Access to XMLHttpRequest blocked by CORS policy
```

Verificar:
1. En Cloud Run, la variable `ASPNETCORE_ENVIRONMENT=Production`
2. En `Program.cs`, el dominio de Vercel está en la lista de `WithOrigins`
3. `app.UseCors("AllowFrontend")` está **antes** de `app.UseAuthentication()`

### ❌ Npgsql error con pgBouncer

```
Npgsql.NpgsqlException: Unrecognized SSL error
```

Asegurarse de incluir en la connection string:
```
SSL Mode=Require;Trust Server Certificate=true;Pooling=false
```

### ❌ 401 Unauthorized en todos los endpoints

JWT mal configurado. Verificar:
1. `JWT_SECRET` en Cloud Run es el mismo que se usó para emitir tokens
2. `Issuer` y `Audience` coinciden entre emisión y validación
3. El token no está expirado (revisar `ExpirationMinutes`)

### ❌ Vite build falla: VITE_API_URL is undefined

```bash
# Verificar que en el build se pasan las variables
VITE_API_URL=https://... npm run build

# O en Vercel: Settings → Environment Variables → ¿está definida para Production?
```

### ❌ Cold start lento en Cloud Run (primeras peticiones tardan 3-5s)

Opciones:
1. Set `--min-instances 1` en el deploy (mantiene una instancia activa, consume cuota)
2. O configurar Cloud Scheduler para llamar al `/health` cada 5 min (mantiene caliente sin coste)

```bash
gcloud scheduler jobs create http keep-warm \
  --location europe-west1 \
  --schedule "*/5 * * * *" \
  --uri "https://buenatierra-api-xxxx.run.app/health" \
  --http-method GET
```

---

## 16. Checklist final antes de dar acceso al cliente

### Infraestructura
- [ ] Backend desplegado en Cloud Run y respondiendo en HTTPS
- [ ] Frontend desplegado en Vercel con URL estable
- [ ] Base de datos inicializada con esquema completo y datos seed
- [ ] Variables de entorno configuradas en ambos servicios
- [ ] CORS configurado correctamente
- [ ] SSL activo en todos los endpoints

### Funcionalidad
- [ ] Login funciona con las credenciales del cliente
- [ ] Cada módulo (Clientes, Productos, Producción, Lotes, Pedidos, Albaranes, Facturas, Informes, Trazabilidad) carga datos correctamente
- [ ] FIFO de lotes genera asignaciones correctas en facturas
- [ ] Descarga de PDF y Excel funciona desde producción
- [ ] Filtros de fechas en informes funcionan
- [ ] El repartidor puede acceder con su rol y tiene permisos correctos

### Seguridad
- [ ] Swagger desactivado en producción
- [ ] Rate limiting activo en login
- [ ] Headers de seguridad presentes en frontend
- [ ] Contraseña de DB no está en ningún archivo de código

### Monitorización
- [ ] Alerta de errores 5xx configurada
- [ ] Uptime check configurado
- [ ] Backup automático programado

### Comunicación al cliente
- [ ] URL del frontend entregada al cliente
- [ ] Credenciales de acceso entregadas de forma segura (no por email plano)
- [ ] Explicar que es un entorno gratuito con posibles cold starts
- [ ] Acuerdo sobre SLA (el free tier no garantiza disponibilidad)

---

## 17. Límites del tier gratuito — tabla resumen

| Servicio | Recurso | Límite gratuito | Qué pasa si se supera |
|---|---|---|---|
| **Google Cloud Run** | Peticiones/mes | 2 millones | Se paga por petición (~$0.40/millón) |
| **Google Cloud Run** | CPU/mes | 180.000 vCPU-segundos | Se cobra el exceso |
| **Google Cloud Run** | Memoria/mes | 360.000 GB-segundos | Se cobra el exceso |
| **Supabase** | Tamaño DB | 500 MB | Proyecto pausado |
| **Supabase** | Transferencia | 2 GB/mes | Throttling o pausa |
| **Supabase** | Filas máx. | Sin límite | — |
| **Supabase** | Proyectos activos | 2 | Requiere plan de pago |
| **Supabase** | Pausa por inactividad | 7 días sin requests | Proyecto pausado (se reactive manual) |
| **Vercel** | Deployments/mes | Ilimitados | — |
| **Vercel** | Bandwidth | 100 GB/mes | Throttling |
| **Vercel** | Builds/día | 100 | Build bloqueado hasta mañana |

> ⚠️ **Punto crítico de Supabase gratuito:** el proyecto se pausa si no recibe peticiones durante 7 días consecutivos. En uso real con el cliente esto no debería ocurrir, pero si hay vacaciones largas o el cliente deja de usar la app, Supabase pausará la DB. Se reactiva manualmente desde el panel en ~30 segundos. Para evitarlo completamente, usar el plan Pro ($25/mes) o el Cloud Scheduler ping descrito en el Troubleshooting.

---

> **Documento preparado:** 22/02/2026
> **Arquitectura:** Vercel + Google Cloud Run (europe-west1) + Supabase
> **Versiones objetivo:** .NET 9 · React + Vite · PostgreSQL 15
>
> Revisar límites y precios actualizados antes del despliegue en [cloud.google.com/run/pricing](https://cloud.google.com/run/pricing), [supabase.com/pricing](https://supabase.com/pricing) y [vercel.com/pricing](https://vercel.com/pricing).
