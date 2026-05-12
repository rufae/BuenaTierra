@echo off
title BuenaTierra - Empaquetar instalador / APK
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "FRONTEND=%ROOT%\frontend"
set "API_PROJECT=%ROOT%\src\BuenaTierra.API\BuenaTierra.API.csproj"
set "PUBLISH_DIR=%ROOT%\publish\api"
set "INSTALLER_DIR=%FRONTEND%\dist-electron"
set "ANDROID_DIR=%FRONTEND%\android"
set "APK_OUTPUT_DIR=%ANDROID_DIR%\app\build\outputs\apk\debug"

echo.
echo ============================================================
echo   BUENATIERRA - Empaquetador EXE / APK
echo ============================================================
echo.

set "TARGET=%~1"
if /I "%TARGET%"=="" (
    echo Selecciona tipo de paquete:
    echo   [1] Windows EXE
    echo   [2] Android APK
    echo.
    choice /c 12 /n /m "Opcion (1/2): "
    if errorlevel 2 set "TARGET=APK"
    if errorlevel 1 set "TARGET=WIN"
)

if /I "%TARGET%"=="1" set "TARGET=WIN"
if /I "%TARGET%"=="2" set "TARGET=APK"
if /I "%TARGET%"=="EXE" set "TARGET=WIN"
if /I "%TARGET%"=="WINDOWS" set "TARGET=WIN"
if /I "%TARGET%"=="APK" set "TARGET=APK"

if /I not "%TARGET%"=="WIN" if /I not "%TARGET%"=="APK" (
    echo [ERROR] Parametro invalido: %~1
    echo Uso: PUBLICAR_Y_EMPAQUETAR.bat [WIN^|APK]
    pause & exit /b 1
)

if /I "%TARGET%"=="WIN" goto PACK_WIN
if /I "%TARGET%"=="APK" goto PACK_APK

:PACK_WIN
:: ─── Auto-elevar a Administrador (necesario para electron-builder/NSIS) ────────
net session >nul 2>&1
if errorlevel 1 (
    echo Solicitando permisos de administrador...
    powershell -Command "Start-Process -FilePath '%~dpnx0' -Verb RunAs -ArgumentList 'WIN'"
    exit /b
)

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
exit /b 0

:PACK_APK
echo [CHECK] Verificando herramientas Android...

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado. Instala Node.js LTS.
    pause & exit /b 1
)

java -version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Java no encontrado. Instala JDK 17 o superior.
    pause & exit /b 1
)

if "%ANDROID_HOME%"=="" if "%ANDROID_SDK_ROOT%"=="" (
    echo [ERROR] ANDROID_HOME / ANDROID_SDK_ROOT no configurado.
    echo Configura Android SDK (Android Studio) y vuelve a ejecutar.
    pause & exit /b 1
)

if "%BT_ANDROID_API_URL%"=="" (
    echo.
    set /p BT_ANDROID_API_URL=Introduce URL publica de la API (ej: https://buenatierra-api-xxxx.run.app): 
)

if "%BT_ANDROID_API_URL%"=="" (
    echo [ERROR] URL de API vacia. No se puede generar APK sin backend remoto.
    pause & exit /b 1
)

echo [OK] API Android: %BT_ANDROID_API_URL%

echo.
echo [1/4] Instalando dependencias npm (incluye Capacitor)...
cd /d "%FRONTEND%"
call npm install
if errorlevel 1 (
    echo [ERROR] Fallo npm install.
    pause & exit /b 1
)

echo.
echo [2/4] Compilando frontend para Android con API remota...
call npx cross-env VITE_API_URL=%BT_ANDROID_API_URL% ELECTRON_BUILD=0 npx vite build
if errorlevel 1 (
    echo [ERROR] Fallo vite build para Android.
    pause & exit /b 1
)

echo.
echo [3/4] Sincronizando proyecto Capacitor Android...
if not exist "%ANDROID_DIR%" (
    call npx cap add android
    if errorlevel 1 (
        echo [ERROR] Fallo al crear plataforma android en Capacitor.
        pause & exit /b 1
    )
)

call npx cap sync android
if errorlevel 1 (
    echo [ERROR] Fallo npx cap sync android.
    pause & exit /b 1
)

echo.
echo [4/4] Generando APK DEBUG (firmado, instalable)...
cd /d "%ANDROID_DIR%"
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo [ERROR] Fallo al generar APK.
    pause & exit /b 1
)

echo.
echo ============================================================
echo   APK GENERADO CORRECTAMENTE
echo   Ubicacion: %APK_OUTPUT_DIR%
echo ============================================================
echo.
echo Archivo esperado: app-debug.apk
echo Este APK esta firmado automaticamente con Android Debug Key.
echo Es valido para instalacion manual en movil/tablet.
echo Para Play Store debes generar y firmar un release con keystore.
echo.

if exist "%APK_OUTPUT_DIR%" explorer "%APK_OUTPUT_DIR%"
pause
