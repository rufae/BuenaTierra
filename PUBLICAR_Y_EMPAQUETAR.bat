@echo off
title BuenaTierra - Empaquetar instalador
setlocal EnableDelayedExpansion

:: ─── Auto-elevar a Administrador (necesario para electron-builder/NSIS) ────────
net session >nul 2>&1
if errorlevel 1 (
    echo Solicitando permisos de administrador...
    powershell -Command "Start-Process -FilePath '%~dpnx0' -Verb RunAs"
    exit /b
)

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "FRONTEND=%ROOT%\frontend"
set "API_PROJECT=%ROOT%\src\BuenaTierra.API\BuenaTierra.API.csproj"
set "PUBLISH_DIR=%ROOT%\publish\api"
set "INSTALLER_DIR=%FRONTEND%\dist-electron"

echo.
echo ============================================================
echo   BUENATIERRA - Empaquetador de instalador Windows
echo ============================================================
echo.

:: ─── Verificar prerequisitos ─────────────────────────────────
echo [CHECK] Verificando herramientas...

dotnet --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] .NET SDK no encontrado. Instala .NET 9 SDK.
    pause & exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado. Instala Node.js LTS.
    pause & exit /b 1
)

echo [OK] Herramientas disponibles.

:: ─── Paso 1: Publicar API .NET (self-contained, sin SDK en destino) ──────────
echo.
echo [1/4] Publicando API .NET para win-x64 (puede tardar 2-3 minutos)...
if exist "%PUBLISH_DIR%" rmdir /s /q "%PUBLISH_DIR%"

dotnet publish "%API_PROJECT%" ^
    -c Release ^
    -r win-x64 ^
    --self-contained true ^
    -p:PublishSingleFile=true ^
    -p:EnableCompressionInSingleFile=true ^
    -o "%PUBLISH_DIR%"

if errorlevel 1 (
    echo [ERROR] Fallo dotnet publish.
    pause & exit /b 1
)
echo [OK] API publicada en: %PUBLISH_DIR%

:: dotnet publish ya incluye appsettings.Production.json del proyecto (puerto 5432, sin Docker)

:: ─── Paso 2: Instalar dependencias npm (incluidas Electron) ──────────────────
echo.
echo [2/4] Instalando dependencias npm (incluye Electron)...
cd /d "%FRONTEND%"
call npm install
if errorlevel 1 (
    echo [ERROR] Fallo npm install.
    pause & exit /b 1
)
echo [OK] Dependencias npm instaladas.

:: ─── Paso 3: Build del frontend para Electron ────────────────────────────────
echo.
echo [3/4] Compilando frontend React para produccion (base='./')...
call npx cross-env ELECTRON_BUILD=1 npx vite build
if errorlevel 1 (
    echo [ERROR] Fallo vite build.
    pause & exit /b 1
)
echo [OK] Frontend compilado en: %FRONTEND%\dist\

:: ─── Paso 4: Empaquetar con electron-builder ─────────────────────────────────
echo.
echo [4/4] Empaquetando instalador Windows (.exe)...

:: Limpiar caché corrupto de winCodeSign (contiene symlinks macOS que fallan en Windows sin admin)
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" (
    echo [INFO] Limpiando cache winCodeSign...
    rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
)

call npx electron-builder --win
if errorlevel 1 (
    echo [ERROR] Fallo electron-builder.
    pause & exit /b 1
)

echo.
echo ============================================================
echo   INSTALADOR GENERADO CORRECTAMENTE
echo   Ubicacion: %INSTALLER_DIR%
echo ============================================================
echo.
echo Busca el archivo "BuenaTierra Setup *.exe" en la carpeta anterior.
echo Ese archivo es el instalador completo para entregar al cliente.
echo.

explorer "%INSTALLER_DIR%"
pause
