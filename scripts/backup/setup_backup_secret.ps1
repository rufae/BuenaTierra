param(
    [string]$SecretFile = "",
    [string]$PasswordPlain = ""
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

if ([string]::IsNullOrWhiteSpace($SecretFile)) {
    $SecretFile = Join-Path $PSScriptRoot ".supabase_backup_secret.txt"
}

if ([string]::IsNullOrWhiteSpace($PasswordPlain)) {
    $PasswordPlain = Get-EnvOrDefault -Name "BUENATIERRA_SUPABASE_DB_PASSWORD" -DefaultValue ""
}

$securePassword = $null
if (-not [string]::IsNullOrWhiteSpace($PasswordPlain)) {
    $securePassword = ConvertTo-SecureString $PasswordPlain -AsPlainText -Force
}
else {
    $securePassword = Read-Host "Introduce la password de Supabase para backups" -AsSecureString
}

$encrypted = $securePassword | ConvertFrom-SecureString
Set-Content -Path $SecretFile -Value $encrypted -Encoding UTF8

Write-Output ("Secreto de backup guardado en: {0}" -f $SecretFile)
Write-Output "El archivo esta cifrado con DPAPI y solo este usuario en esta maquina puede descifrarlo."
