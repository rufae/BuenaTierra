param(
    [string]$ApiBaseUrl = "http://localhost:5001",
    [string]$HostName = "localhost",
    [int]$Port = 5432,
    [string]$Database = "buenatierra",
    [string]$User = "buenatierra_admin",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

function Get-ApiHealth {
    try {
        $response = Invoke-RestMethod -Uri "$ApiBaseUrl/health" -Method Get -TimeoutSec 8
        return [PSCustomObject]@{ ok = $true; status = $response.status; timestamp = $response.timestamp }
    }
    catch {
        return [PSCustomObject]@{ ok = $false; status = "down"; timestamp = (Get-Date).ToString("o") }
    }
}

function Get-DbHealth {
    if ([string]::IsNullOrWhiteSpace($Password)) {
        $secure = Read-Host "Password PostgreSQL de $User" -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $script:Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    }

    $env:PGPASSWORD = $Password
    $result = & psql -h $HostName -p $Port -U $User -d $Database -t -A -c "SELECT 'ok';"

    return [PSCustomObject]@{ ok = ($LASTEXITCODE -eq 0 -and ($result -join '').Trim() -eq 'ok') }
}

$api = Get-ApiHealth
$db = Get-DbHealth

$dbStatus = if ($db.ok) { "up" } else { "down" }

Write-Host "API: $($api.status) | DB: $dbStatus | Time: $($api.timestamp)"

if (-not $api.ok -or -not $db.ok) {
    exit 1
}
