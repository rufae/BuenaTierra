param(
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$Database = "buenatierra",
    [string]$User = "buenatierra_admin",
    [string]$Password = "",
    [string]$UpgradeScript = "database/init/05_upgrade_v2_20260328.sql"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontro el comando '$Name'. Instala PostgreSQL client (psql) y vuelve a ejecutar."
    }
}

Require-Command "psql"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $root $UpgradeScript

if (-not (Test-Path $scriptPath)) {
    throw "No existe el script de upgrade: $scriptPath"
}

if ([string]::IsNullOrWhiteSpace($Password)) {
    $secure = Read-Host "Password de PostgreSQL para usuario '$User'" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

$env:PGPASSWORD = $Password

Write-Host "Aplicando upgrade incremental en $HostName:$Port/$Database..." -ForegroundColor Cyan
& psql -h $HostName -p $Port -U $User -d $Database -v "ON_ERROR_STOP=1" -f $scriptPath

if ($LASTEXITCODE -ne 0) {
    throw "Fallo aplicando upgrade incremental. Revisa el error anterior."
}

Write-Host "Upgrade completado correctamente." -ForegroundColor Green
