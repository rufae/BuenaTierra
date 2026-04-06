param(
    [string]$ApiBaseUrl = "http://localhost:5001",
    [string]$DbHost = "localhost",
    [int]$DbPort = 5432,
    [string]$DbName = "buenatierra",
    [string]$DbUser = "buenatierra_admin",
    [string]$DbPassword = "",
    [string]$LoginEmail = "admin@buenatierra.com",
    [string]$LoginPassword = "",
    [int]$EmpresaId = 1
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
    Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

function Ok([string]$msg) {
    Write-Host "[OK] $msg" -ForegroundColor Green
}

function Warn([string]$msg) {
    Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Fail([string]$msg) {
    Write-Host "[FAIL] $msg" -ForegroundColor Red
}

function Test-Port([string]$targetHost, [int]$targetPort) {
    $r = Test-NetConnection -ComputerName $targetHost -Port $targetPort -WarningAction SilentlyContinue
    return [bool]$r.TcpTestSucceeded
}

function Try-InvokeJson([string]$method, [string]$url, $body = $null, $headers = @{}) {
    if ($null -eq $body) {
        return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -ContentType "application/json" -TimeoutSec 10
    }

    return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 10
}

Write-Host "BuenaTierra - Post-instalación" -ForegroundColor White
Write-Host "API: $ApiBaseUrl"
Write-Host "DB : $DbHost`:$DbPort / $DbName"

# 1) Validar puertos
Write-Step "1) Validación de puertos"
$apiUri = [Uri]$ApiBaseUrl
$apiPort = if ($apiUri.IsDefaultPort) { if ($apiUri.Scheme -eq "https") { 443 } else { 80 } } else { $apiUri.Port }

if (Test-Port -targetHost $apiUri.Host -targetPort $apiPort) {
    Ok "Puerto API abierto: $($apiUri.Host):$apiPort"
} else {
    Fail "Puerto API cerrado: $($apiUri.Host):$apiPort"
}

if (Test-Port -targetHost $DbHost -targetPort $DbPort) {
    Ok "Puerto DB abierto: ${DbHost}:$DbPort"
} else {
    Fail "Puerto DB cerrado: ${DbHost}:$DbPort"
}

# 2) Health
Write-Step "2) Prueba /health"
try {
    $health = Try-InvokeJson -method "GET" -url "$ApiBaseUrl/health"
    if ($health.status -eq "healthy" -and $health.database -eq "connected") {
        Ok "/health OK (healthy + database connected)"
    } else {
        Warn "/health respondió pero no está healthy: $($health | ConvertTo-Json -Compress)"
    }
}
catch {
    Fail "No se pudo consultar /health: $($_.Exception.Message)"
}

# 3) Conexión DB (TCP + opcional query SQL)
Write-Step "3) Prueba conexión DB"
if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    Warn "No se recibió DbPassword, solo se validó puerto TCP."
} else {
    if (Get-Command psql -ErrorAction SilentlyContinue) {
        try {
            $env:PGPASSWORD = $DbPassword
            $sql = "SELECT current_database() AS db, current_user AS usr, current_setting('server_encoding') AS encoding;"
            $out = & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -A -c $sql
            Ok "Conexión SQL OK: $out"

            $corrupt = & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -A -c "SELECT COUNT(*) FROM clientes WHERE nombre LIKE '%?%' OR razon_social LIKE '%?%';"
            if ([int]$corrupt -gt 0) {
                Warn "Detectados $corrupt clientes con posible texto dañado ('?'). Revisar importación/normalización."
            } else {
                Ok "Sin indicios de texto dañado ('?') en clientes."
            }
        }
        catch {
            Fail "Error en prueba SQL: $($_.Exception.Message)"
        }
    }
    else {
        Warn "psql no está instalado. Se validó puerto DB, pero no query SQL."
    }
}

# 4) Estado IA actual (Groq/Ollama)
Write-Step "4) Validación configuración IA (Groq/Ollama)"
if ([string]::IsNullOrWhiteSpace($LoginPassword)) {
    Warn "No se recibió LoginPassword. No se puede validar /api/buenatierr-ai/status autenticado."
}
else {
    try {
        $loginBody = @{ email = $LoginEmail; password = $LoginPassword; empresaId = $EmpresaId }
        $login = Try-InvokeJson -method "POST" -url "$ApiBaseUrl/api/auth/login" -body $loginBody
        $token = $login.data.token
        if ([string]::IsNullOrWhiteSpace($token)) {
            throw "No se recibió token en login"
        }

        $headers = @{ Authorization = "Bearer $token" }
        $status = Try-InvokeJson -method "GET" -url "$ApiBaseUrl/api/buenatierr-ai/status" -headers $headers
        $ai = $status.data

        Ok "IA enabled=$($ai.enabled) model=$($ai.model) provider=$($ai.providerBaseUrl)"

        $provider = [string]$ai.providerBaseUrl
        if ($provider -match "localhost:11434") {
            Ok "Proveedor detectado: OLLAMA local"
            if ($ai.apiKeyRequired -eq $false) {
                Ok "API key NO requerida para proveedor local"
            } else {
                Warn "Se esperaba apiKeyRequired=false para proveedor local"
            }
        }
        elseif ($provider -match "groq.com") {
            Ok "Proveedor detectado: GROQ"
            if ($ai.apiKeyRequired -and -not $ai.apiKeyConfigured) {
                Warn "Groq requiere API key y no está configurada"
            }
        }
        elseif ($provider -match "openai.com") {
            Ok "Proveedor detectado: OPENAI"
            if ($ai.apiKeyRequired -and -not $ai.apiKeyConfigured) {
                Warn "OpenAI requiere API key y no está configurada"
            }
        }
        else {
            Warn "Proveedor IA no reconocido automáticamente: $provider"
        }

        if ($ai.configurationValid -eq $true) {
            Ok "Configuración IA válida"
        } else {
            Warn "Configuración IA inválida. Warnings: $($ai.warnings -join ' | ')"
        }
    }
    catch {
        Fail "No se pudo validar IA: $($_.Exception.Message)"
    }
}

Write-Host "`nPost-instalación finalizado." -ForegroundColor White
