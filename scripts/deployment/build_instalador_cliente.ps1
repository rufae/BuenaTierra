$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$frontend = Join-Path $root "frontend"

Write-Host "1) Publicando API self-contained win-x64..." -ForegroundColor Cyan
Push-Location $frontend
try {
    npm run build:api
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo en build:api"
    }

    Write-Host "2) Compilando frontend/electron..." -ForegroundColor Cyan
    npm run build:electron
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo en build:electron"
    }

    Write-Host "3) Generando instalador Windows (.exe NSIS)..." -ForegroundColor Cyan
    npm run package -- --win
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo generando instalador"
    }
}
finally {
    Pop-Location
}

Write-Host "Instalador generado en frontend/dist-electron." -ForegroundColor Green
