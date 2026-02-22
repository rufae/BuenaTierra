# APP_ESCRITORIO — Guía de empaquetado como aplicación de escritorio

## Objetivo

Convertir BuenaTierra (frontend React/Vite + backend .NET 9 + PostgreSQL) en una aplicación de escritorio instalable en Windows, sin necesidad de abrir un navegador manualmente.

---

## Arquitectura de la solución de escritorio

```
┌──────────────────────────────────────────────┐
│  Ventana Electron / Tauri (wrapper nativo)    │
│  ┌────────────────────────────────────────┐  │
│  │  UI React + Vite (dist/ buildeado)     │  │
│  └────────────────────────────────────────┘  │
│           │ HTTP axios → localhost:5001       │
│  ┌────────────────────────────────────────┐  │
│  │  API .NET 9  (proceso hijo/servicio)   │  │
│  └────────────────────────────────────────┘  │
│           │ Npgsql → localhost:5433           │
│  ┌────────────────────────────────────────┐  │
│  │  PostgreSQL Docker / servicio Windows  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## Opción A — Electron (recomendada para Windows)

### Por qué Electron
- Madura, con gran ecosistema en Windows
- `electron-builder` genera instaladores `.exe` (NSIS o Squirrel)
- Permite lanzar el proceso .NET como proceso hijo
- Auto-updater integrado

### Paquetes necesarios

```bash
cd frontend
npm install --save-dev electron electron-builder concurrently wait-on
```

### Estructura de archivos a añadir

```
frontend/
  electron/
    main.js          ← proceso principal Electron
    preload.js       ← bridge seguro renderer ↔ main
  electron-builder.yml
```

### `electron/main.js`

```js
const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const waitOn = require('wait-on')

const isDev = !app.isPackaged
let apiProcess = null

function launchApi() {
  const apiExe = isDev
    ? null  // en dev, asumir que ya corre dotnet run
    : path.join(process.resourcesPath, 'api', 'BuenaTierra.API.exe')

  if (!isDev) {
    apiProcess = spawn(apiExe, ['--urls', 'http://localhost:5001'], {
      detached: false,
      stdio: 'ignore',
    })
  }
}

async function createWindow() {
  launchApi()

  // Esperar a que la API esté disponible (máx. 15 s)
  await waitOn({ resources: ['http://localhost:5001/health'], timeout: 15000 })
    .catch(() => console.warn('API no respondió a tiempo'))

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'BuenaTierra',
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (apiProcess) apiProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

### `electron/preload.js`

```js
// Exponer solo lo estrictamente necesario al renderer
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('appInfo', {
  version: require('../package.json').version,
})
```

### `electron-builder.yml`

```yaml
appId: com.buenatierra.app
productName: BuenaTierra
copyright: BuenaTierra

directories:
  output: dist-electron

files:
  - dist/**/*          # frontend buildeado
  - electron/**/*      # main + preload

extraResources:
  - from: ../publish/  # dotnet publish output
    to: api/
    filter: ["**/*"]

win:
  target:
    - target: nsis
      arch: [x64]
  icon: public/favicon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: public/favicon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

### Scripts `package.json` para desarrollo y empaquetado

```json
{
  "main": "electron/main.js",
  "scripts": {
    "dev": "vite",
    "dev:electron": "concurrently \"npm run dev\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "tsc -b && vite build",
    "build:api": "dotnet publish ../src/BuenaTierra.API/BuenaTierra.API.csproj -c Release -r win-x64 --self-contained true -o ../publish",
    "package": "npm run build && npm run build:api && electron-builder",
    "package:win": "npm run package -- --win"
  }
}
```

### Flujo de empaquetado completo

```bash
# 1. Build frontend
npm run build          # → frontend/dist/

# 2. Publish .NET API (self-contained, sin instalar .NET en destino)
dotnet publish src/BuenaTierra.API/BuenaTierra.API.csproj \
  -c Release -r win-x64 --self-contained true \
  -o publish/

# 3. Empaquetar Electron
cd frontend
npm run package:win    # → frontend/dist-electron/BuenaTierra Setup X.Y.Z.exe
```

El resultado es un único `.exe` instalador NSIS que incluye:
- La UI React compilada
- La API .NET 9 como ejecutable nativo (sin SDK en destino)
- El launcher Electron

---

## Opción B — Tauri (más ligero, recomendado si se prioriza tamaño)

### Diferencias clave vs Electron

| | Electron | Tauri |
|---|---|---|
| Runtime | Node.js + Chromium | Rust + WebView2 nativo |
| Tamaño instalador | ~70-120 MB | ~5-15 MB |
| RAM | ~150-300 MB | ~20-50 MB |
| Setup inicial | Más simple | Requiere Rust toolchain |
| Madurez en Windows | Alta | Media-alta |

### Instalación

```bash
# Requiere Rust: https://rustup.rs
cargo install tauri-cli

cd frontend
npm install @tauri-apps/api
npx tauri init
```

### Configuración `src-tauri/tauri.conf.json` (fragmento)

```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "tauri": {
    "bundle": {
      "identifier": "com.buenatierra.app",
      "icon": ["icons/icon.ico"],
      "targets": ["nsis", "msi"]
    },
    "windows": [{
      "title": "BuenaTierra",
      "width": 1400,
      "height": 900,
      "minWidth": 1024,
      "minHeight": 700
    }]
  }
}
```

Para lanzar el backend .NET desde Tauri, usar el comando `tauri::command` + `std::process::Command` en Rust (equivalente al `spawn` de Electron).

---

## Base de datos en instalación de escritorio

### Escenario 1: BD remota compartida (multiusuario, recomendado en producción)

```
Obrador (servidor)          Repartidor (cliente)
────────────────────         ────────────────────
Docker PostgreSQL     ←→     App de escritorio
API .NET expuesta             API .NET local apunta
en red local/VPN              a la BD del obrador
```

- La app del repartidor se conecta a la API del obrador vía IP/dominio
- No necesita Docker local
- Cambiar en `appsettings.json` del repartidor:
  ```json
  "ConnectionStrings": {
    "DefaultConnection": "Host=192.168.1.X;Port=5433;Database=buenatierra;..."
  }
  ```

### Escenario 2: BD local (modo offline, uniusuario)

- Instalar PostgreSQL como servicio Windows (sin Docker):
  ```
  https://www.postgresql.org/download/windows/
  ```
- O distribuir PostgreSQL portable dentro del instalador (aumenta ~50 MB)
- La app arranca PostgreSQL antes de iniciar la API

### Escenario 3: SQLite (sin servidor, máxima simplicidad)

- Cambiar el provider de EF Core a SQLite para instalaciones monomáquina
- No recomendado si se necesita acceso concurrente real
- Útil para demo/evaluación

---

## Servicio Windows en lugar de Electron (alternativa para servidor)

Para el puesto del obrador (siempre encendido), la API puede registrarse como servicio Windows en lugar de usar Electron:

```bash
# Publicar como ejecutable nativo
dotnet publish -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -o C:\BuenaTierra\api

# Registrar como servicio
sc.exe create BuenaTierraAPI binPath= "C:\BuenaTierra\api\BuenaTierra.API.exe --urls http://localhost:5001"
sc.exe start BuenaTierraAPI
sc.exe config BuenaTierraAPI start= auto
```

Añadir en `Program.cs`:
```csharp
builder.Services.AddWindowsService(options =>
    options.ServiceName = "BuenaTierraAPI");
```

En este caso el frontend podría simplemente abrirse en el navegador (Chrome kiosk mode) o seguir usando Electron.

---

## Configuración por entorno (obrador vs repartidor)

Usar un fichero `appsettings.local.json` (gitignoreado) en cada instalación:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=...;Port=...;Database=...;Username=...;Password=..."
  },
  "AppSettings": {
    "Rol": "Repartidor",
    "EmpresaId": "uuid-de-la-empresa-repartidor"
  }
}
```

El frontend lee el rol desde el JWT y activa/desactiva módulos automáticamente (ya implementado en el sistema de roles actual).

---

## Resumen de ruta recomendada

```
Fase MVP (ahora):
  → API como dotnet run / servicio Windows
  → Frontend en Chrome fullscreen o Electron básico

Fase Producción:
  → Electron con instalador NSIS
  → API .NET self-contained incluida
  → BD remota en servidor Docker del obrador
  → Repartidor conecta a BD remota vía VPN/IP

Fase Escalada:
  → Certificado SSL + HTTPS en API
  → Auto-updater Electron (electron-updater)
  → Tauri si se requiere reducir footprint
  → App móvil PWA para repartidores (mismo frontend)
```

---

## Archivos a crear para implementar Electron

| Archivo | Descripción |
|---|---|
| `frontend/electron/main.js` | Proceso principal, lanza API y ventana |
| `frontend/electron/preload.js` | Bridge contextIsolation |
| `frontend/electron-builder.yml` | Config del empaquetador |
| `frontend/package.json` | Añadir scripts `dev:electron` y `package` |
| `publish/` | Output de `dotnet publish` (gitignoreado) |
| `dist-electron/` | Output de `electron-builder` (gitignoreado) |
