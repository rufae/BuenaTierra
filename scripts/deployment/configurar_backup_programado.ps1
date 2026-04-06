param(
    [string]$PgDumpPath = "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$Database = "buenatierra",
    [string]$User = "buenatierra_admin",
    [string]$Password = "",
    [string]$BackupDir = "C:\\BuenaTierra\\backups",
    [string]$TaskName = "BuenaTierra_Postgres_Backup_Diario",
    [string]$AtTime = "23:30"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PgDumpPath)) {
    throw "No se encontró pg_dump en: $PgDumpPath"
}

if ([string]::IsNullOrWhiteSpace($Password)) {
    $secure = Read-Host "Password PostgreSQL de $User" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

$scriptFile = Join-Path $BackupDir "run_backup.ps1"
$backupScript = @"
`$ErrorActionPreference = 'Stop'
`$env:PGPASSWORD = '$Password'
`$date = Get-Date -Format 'yyyyMMdd_HHmm'
`$out = Join-Path '$BackupDir' ("buenatierra_`$date.backup")
& '$PgDumpPath' -h '$HostName' -p $Port -U '$User' -d '$Database' -F c -f `$out
if (`$LASTEXITCODE -ne 0) { throw 'Error en pg_dump' }
Get-ChildItem '$BackupDir' -Filter '*.backup' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force
"@

Set-Content -Path $scriptFile -Value $backupScript -Encoding UTF8

schtasks /Create /F /SC DAILY /TN $TaskName /TR "powershell -ExecutionPolicy Bypass -File `"$scriptFile`"" /ST $AtTime | Out-Null

Write-Host "Backup automático configurado: $TaskName a las $AtTime" -ForegroundColor Green
