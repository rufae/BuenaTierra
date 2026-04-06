param(
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$Database = "buenatierra",
    [string]$User = "buenatierra_admin",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontro el comando '$Name'. Instala PostgreSQL client (psql) y vuelve a ejecutar."
    }
}

function Query-Scalar([string]$Sql) {
    $result = & psql -h $HostName -p $Port -U $User -d $Database -t -A -c $Sql
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo consultando base de datos."
    }
    return ($result | Out-String).Trim()
}

Require-Command "psql"

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

$errors = New-Object System.Collections.Generic.List[string]

$produccionesCheck = Query-Scalar "SELECT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'producciones' AND pg_get_constraintdef(c.oid) LIKE '%Planificada%EnProceso%Finalizada%Cancelada%');"
if ($produccionesCheck -ne "t") {
    $errors.Add("Constraint de producciones.estado no alineado con EnProceso/Finalizada.")
}

$facturasCheck = Query-Scalar "SELECT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'facturas' AND pg_get_constraintdef(c.oid) LIKE '%Borrador%Emitida%Enviada%Cobrada%Anulada%');"
if ($facturasCheck -ne "t") {
    $errors.Add("Constraint de facturas.estado no incluye el estado Enviada o esta desalineado.")
}

$funcFinalizada = Query-Scalar "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'entrada_stock_produccion' AND n.nspname = 'public' AND pg_get_functiondef(p.oid) LIKE '%v_produccion.estado != ''Finalizada''%');"
if ($funcFinalizada -ne "t") {
    $errors.Add("Funcion entrada_stock_produccion no valida estado 'Finalizada' correctamente.")
}

$funcLegacy = Query-Scalar "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'entrada_stock_produccion' AND n.nspname = 'public' AND pg_get_functiondef(p.oid) LIKE '%v_produccion.estado != ''finalizada''%');"
if ($funcLegacy -eq "t") {
    $errors.Add("Funcion entrada_stock_produccion contiene comparacion legacy con 'finalizada' en minusculas.")
}

if ($errors.Count -gt 0) {
    Write-Host "Schema NO valido para produccion cliente:" -ForegroundColor Red
    foreach ($e in $errors) {
        Write-Host " - $e" -ForegroundColor Red
    }
    Write-Host "Ejecuta scripts/deployment/upgrade_cliente.ps1 para corregir drift." -ForegroundColor Yellow
    exit 1
}

Write-Host "Schema validado correctamente para instalacion cliente." -ForegroundColor Green
