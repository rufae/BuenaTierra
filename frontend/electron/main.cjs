'use strict'

const { app, BrowserWindow, shell, dialog, Menu } = require('electron')
const { spawn }  = require('child_process')
const path       = require('path')
const http       = require('http')
const fs         = require('fs')

// ─── Logging de diagnóstico ───────────────────────────────────────────────────
const LOG_DIR  = path.join(app.getPath('userData'), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'api-startup.log')

function ensureLogDir () {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch (_) {}
}
function writeLog (msg) {
  try {
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(LOG_FILE, line)
  } catch (_) {}
}

// ─── Constantes ──────────────────────────────────────────────────────────────
const API_URL    = 'http://localhost:5001'
const FRONT_URL  = 'http://localhost:5173'   // solo en dev
const API_TIMEOUT_MS = 30_000               // 30 s máximo esperando la API

const isDev = !app.isPackaged

// En producción, la API está junto al .exe empaquetado
const API_EXE = isDev
  ? null
  : path.join(process.resourcesPath, 'api', 'BuenaTierra.API.exe')

let mainWindow  = null
let apiProcess  = null

// ─── Lanzar API .NET ─────────────────────────────────────────────────────────
function launchApi () {
  ensureLogDir()
  // Limpiar log anterior al arrancar
  try { fs.writeFileSync(LOG_FILE, `=== BuenaTierra API startup ${new Date().toISOString()} ===\n`) } catch (_) {}

  if (isDev) {
    writeLog('Modo desarrollo: API debe iniciarse manualmente con dotnet run')
    return
  }

  writeLog(`API_EXE: ${API_EXE}`)
  writeLog(`Existe: ${fs.existsSync(API_EXE)}`)

  if (!fs.existsSync(API_EXE)) {
    dialog.showErrorBox(
      'Error al iniciar BuenaTierra',
      `No se encontró el ejecutable de la API:\n${API_EXE}\n\nReinstala la aplicación.`
    )
    app.quit()
    return
  }

  apiProcess = spawn(API_EXE, ['--urls', API_URL], {
    detached: false,
    stdio:    ['ignore', 'pipe', 'pipe'],
    cwd:      path.dirname(API_EXE),   // directorio de trabajo = carpeta del exe
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Production',
    },
  })

  apiProcess.stdout.on('data', (d) => writeLog(`[OUT] ${d.toString().trim()}`))
  apiProcess.stderr.on('data', (d) => writeLog(`[ERR] ${d.toString().trim()}`))

  apiProcess.on('error', (err) => {
    writeLog(`[SPAWN ERROR] ${err.message}`)
    dialog.showErrorBox('Error en la API', `La API no pudo arrancar:\n${err.message}\n\nLog: ${LOG_FILE}`)
  })

  apiProcess.on('exit', (code) => {
    writeLog(`[EXIT] código ${code}`)
    if (code !== 0 && code !== null) {
      console.warn(`API process exited with code ${code}`)
    }
  })
}

// ─── Esperar a que la API responda ───────────────────────────────────────────
function waitForApi (url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const healthUrl = `${url}/health`

    function tryOnce () {
      http.get(healthUrl, (res) => {
        // 200 = OK, 503 = API arrancó pero DB no conecta (aceptamos ambos como "API viva")
        if (res.statusCode < 500 || res.statusCode === 503) {
          resolve(res.statusCode)
        } else {
          retry()
        }
      }).on('error', retry)
    }

    function retry () {
      if (Date.now() >= deadline) {
        reject(new Error(`La API no respondió en ${timeoutMs / 1000} segundos`))
      } else {
        setTimeout(tryOnce, 800)
      }
    }

    tryOnce()
  })
}

// ─── Crear ventana principal ──────────────────────────────────────────────────
function createWindow () {
  // Menú con atajos de teclado estándar de edición (Ctrl+C/V/X/A y selección de texto)
  const menuTemplate = [
    {
      label: 'Editar',
      submenu: [
        { role: 'undo',       label: 'Deshacer',          accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo',       label: 'Rehacer',           accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { role: 'cut',        label: 'Cortar',            accelerator: 'CmdOrCtrl+X' },
        { role: 'copy',       label: 'Copiar',            accelerator: 'CmdOrCtrl+C' },
        { role: 'paste',      label: 'Pegar',             accelerator: 'CmdOrCtrl+V' },
        { role: 'selectAll',  label: 'Seleccionar todo',  accelerator: 'CmdOrCtrl+A' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload',          label: 'Recargar' },
        { role: 'forceReload',     label: 'Forzar recarga' },
        { role: 'toggleDevTools',  label: 'Herramientas de desarrollo', visible: isDev },
        { type: 'separator' },
        { role: 'resetZoom',       label: 'Zoom normal' },
        { role: 'zoomIn',          label: 'Acercar' },
        { role: 'zoomOut',         label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

  mainWindow = new BrowserWindow({
    width:     1440,
    height:    900,
    minWidth:  1024,
    minHeight: 700,
    title:     'BuenaTierra',
    // icon:   path.join(__dirname, '..', 'public', 'app.ico'),  // añadir cuando haya .ico
    show:      false,  // se muestra cuando está listo
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  // Abrir enlaces externos en el navegador del sistema, no en Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL(FRONT_URL)
  } else {
    // En producción cargamos el dist/ empaquetado
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ─── Ciclo de vida de la app ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  launchApi()

  try {
    const statusCode = await waitForApi(API_URL, API_TIMEOUT_MS)
    if (statusCode === 503) {
      // API arrancó pero DB no conecta — mostrar aviso pero abrir la app
      dialog.showErrorBox(
        'BuenaTierra — Base de datos no disponible',
        'La API ha arrancado pero no puede conectar con PostgreSQL.\n\nVerifica que:\n  1. El servicio PostgreSQL está iniciado\n  2. Existe la base de datos "buenatierra"\n  3. El usuario "buenatierra_admin" tiene acceso\n\nLog de diagnóstico:\n' + LOG_FILE
      )
    }
  } catch (err) {
    if (!isDev) {
      dialog.showErrorBox(
        'BuenaTierra — Error de arranque',
        `${err.message}\n\nPostgreSQL debe estar corriendo en el puerto 5432 (instalación cliente) o 5433 (modo desarrollo local).\n\nLog de diagnóstico:\n${LOG_FILE}`
      )
      app.quit()
      return
    }
    // En dev simplemente avisa pero continúa (útil si la API aún no está lista)
    console.warn('API no disponible:', err.message)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (apiProcess) {
    apiProcess.kill()
    apiProcess = null
  }
  if (process.platform !== 'darwin') app.quit()
})
