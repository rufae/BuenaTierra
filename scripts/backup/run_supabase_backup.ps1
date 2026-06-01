param(
    [string]$BackupDir = "",
    [int]$RetentionWeeks = 12,
    [string]$SecretFile = ""
)

$ErrorActionPreference = "Stop"

function Get-EnvOrDefault {
    param(
        [string]$Name,
        [string]$DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, "User")
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, "Machine")
    }

    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $BackupDir = Join-Path $repoRoot "backups"
}

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

if ([string]::IsNullOrWhiteSpace($SecretFile)) {
    $SecretFile = Join-Path $PSScriptRoot ".supabase_backup_secret.txt"
}

$hostName = Get-EnvOrDefault -Name "BUENATIERRA_SUPABASE_DB_HOST" -DefaultValue "aws-0-eu-west-1.pooler.supabase.com"
$port = Get-EnvOrDefault -Name "BUENATIERRA_SUPABASE_DB_PORT" -DefaultValue "5432"
$dbName = Get-EnvOrDefault -Name "BUENATIERRA_SUPABASE_DB_NAME" -DefaultValue "postgres"
$userName = Get-EnvOrDefault -Name "BUENATIERRA_SUPABASE_DB_USER" -DefaultValue "postgres.uazklcesoebzcpyiktqv"

$password = ""
if (Test-Path $SecretFile) {
    try {
        $secure = Get-Content -Path $SecretFile -ErrorAction Stop | ConvertTo-SecureString
        $cred = New-Object System.Management.Automation.PSCredential("unused", $secure)
        $password = $cred.GetNetworkCredential().Password
    }
    catch {
        throw "No se pudo leer el secreto cifrado en $SecretFile. Ejecuta setup_backup_secret.ps1 para regenerarlo."
    }
}
else {
    $password = Get-EnvOrDefault -Name "BUENATIERRA_SUPABASE_DB_PASSWORD" -DefaultValue ""
}

if ([string]::IsNullOrWhiteSpace($password)) {
    throw "No hay password configurado. Ejecuta scripts/backup/setup_backup_secret.ps1."
}

$pgDumpCmd = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDumpCmd) {
    throw "No se encontro pg_dump en PATH. Instala PostgreSQL client tools o agrega pg_dump al PATH."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outFile = Join-Path $BackupDir ("{0}.sql" -f $timestamp)

$env:PGPASSWORD = $password
try {
    & pg_dump -h $hostName -p $port -U $userName -d $dbName -F p -f $outFile
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump devolvio codigo $LASTEXITCODE"
    }
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

if ($RetentionWeeks -gt 0) {
    $limitDate = (Get-Date).AddDays(-7 * $RetentionWeeks)
    Get-ChildItem -Path $BackupDir -File -Filter "*.sql" |
        Where-Object { $_.LastWriteTime -lt $limitDate } |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

$file = Get-Item $outFile
Write-Output ("Backup OK: {0} ({1} bytes)" -f $file.FullName, $file.Length)
