@echo off
title BuenaTierra - Iniciando...
setlocal EnableDelayedExpansion

:: Localizar la raiz del proyecto
set "START_DIR=%~dp0"
set "CUR=%START_DIR%"
set "FOUND_ROOT="
for /l %%N in (0,1,8) do (
    if exist "%%~fCUR..\docker-compose.yml" (
        pushd "%%~fCUR.." >nul 2>&1
        set "FOUND_ROOT=%CD%"
        popd >nul 2>&1
        goto root_found
    )
    pushd "%%~fCUR.." >nul 2>&1
    set "CUR=%CD%"
    popd >nul 2>&1
)
:root_found
if defined FOUND_ROOT (set "ROOT=%FOUND_ROOT%") else (set "ROOT=%START_DIR%")
set "API_DIR=%ROOT%\src\BuenaTierra.API"
set "FRONTEND_DIR=%ROOT%\frontend"

echo.
echo ============================================================
echo   BUENATIERRA - Sistema de Gestion del Obrador
echo ============================================================
echo.

:: Comprobar Docker
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok

echo [!] Docker no esta corriendo. Intentando iniciar Docker Desktop...
set DOCKER_PATHS="%ProgramFiles%\Docker\Docker\Docker Desktop.exe" "%LocalAppData%\Programs\Docker\Docker\Docker Desktop.exe" "%ProgramFiles%\Docker\Docker Desktop.exe"
set "STARTED_DOCKER=0"
for %%P in (!DOCKER_PATHS!) do (
    if exist %%P (
        echo     arrancando: %%~P
        start "" %%P
        set "STARTED_DOCKER=1"
        goto wait_docker
    )
)

if "!STARTED_DOCKER!"=="0" (
    echo [WARN] No se encontro el ejecutable. Abre Docker Desktop manualmente.
    pause
)

:wait_docker
echo     Esperando a que Docker arranque (max 60s)...
set /a COUNTER=0
:wait_loop
timeout /t 3 /nobreak > nul
docker info >nul 2>&1
if errorlevel 1 (
    set /a COUNTER+=3
    if !COUNTER! GEQ 60 (
        echo [ERROR] Docker no ha arrancado. Abrelo manualmente.
        pause
        exit /b 1
    )
    goto wait_loop
)

:docker_ok
echo [OK] Docker activo.

:: Instalar dependencias frontend si no existen
if not exist "%FRONTEND_DIR%\node_modules" (
    echo.
    echo [1/5] Instalando dependencias del frontend...
    cd /d "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo npm install.
        pause
        exit /b 1
    )
    echo [OK] Dependencias instaladas.
)

:: Compilar backend si no existe el ejecutable
if not exist "%API_DIR%\bin\Debug\net9.0\BuenaTierra.API.dll" (
    echo.
    echo [2/5] Compilando el backend...
    cd /d "%ROOT%"
    dotnet build BuenaTierra.sln -v q
    if errorlevel 1 (
        echo [ERROR] Fallo la compilacion.
        pause
        exit /b 1
    )
    echo [OK] Backend compilado.
)

:: Arrancar base de datos
echo.
echo [3/5] Iniciando base de datos...
cd /d "%ROOT%"
docker compose up db -d >nul 2>&1
timeout /t 6 /nobreak > nul

:: Arrancar API en segundo plano (oculto)
echo [4/5] Iniciando API .NET en segundo plano...
echo @echo off > "%TEMP%\api_runner.bat"
echo cd /d "%API_DIR%" >> "%TEMP%\api_runner.bat"
echo set ASPNETCORE_ENVIRONMENT=Development >> "%TEMP%\api_runner.bat"
echo dotnet run --no-build --urls http://localhost:5001 >> "%TEMP%\api_runner.bat"
powershell -WindowStyle Hidden -Command "Start-Process '%TEMP%\api_runner.bat' -WindowStyle Hidden"
timeout /t 15 /nobreak > nul

:: Arrancar Frontend en segundo plano (oculto)
echo [5/5] Iniciando frontend en segundo plano...
echo @echo off > "%TEMP%\front_runner.bat"
echo cd /d "%FRONTEND_DIR%" >> "%TEMP%\front_runner.bat"
echo npm run dev >> "%TEMP%\front_runner.bat"
powershell -WindowStyle Hidden -Command "Start-Process '%TEMP%\front_runner.bat' -WindowStyle Hidden"
timeout /t 8 /nobreak > nul

:: Abrir navegador
echo.
start http://localhost:5173
echo ============================================================
echo   Aplicacion lista!  --^>  http://localhost:5173
echo ============================================================
echo.
echo - La API y el Frontend estan corriendo ocultos.
echo - Cuando termines, ejecuta PARAR_BUENATIERRA.bat
echo.
pause
