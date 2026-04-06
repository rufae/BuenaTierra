param(
    [string]$BackupFile,
    [string]$PgRestorePath = "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_restore.exe",
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$Database = "buenatierra",
    [string]$User = "buenatierra_admin",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BackupFile) -or -not (Test-Path $BackupFile)) {
    throw "Debes indicar un backup válido en -BackupFile"
}

if (-not (Test-Path $PgRestorePath)) {
    throw "No se encontró pg_restore en: $PgRestorePath"
}

if ([string]::IsNullOrWhiteSpace($Password)) {
    $secure = Read-Host "Password PostgreSQL de $User" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$env:PGPASSWORD = $Password

Write-Host "Iniciando rollback de base de datos desde $BackupFile" -ForegroundColor Yellow
& $PgRestorePath -h $HostName -p $Port -U $User -d $Database --clean --if-exists --no-owner --no-privileges $BackupFile

if ($LASTEXITCODE -ne 0) {
    throw "Rollback fallido. Revisa salida de pg_restore."
}

Write-Host "Rollback completado correctamente." -ForegroundColor Green
