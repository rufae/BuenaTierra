param(
    [string]$TaskName = "BuenaTierra-Weekly-Supabase-Backup",
    [string]$DayOfWeek = "Sunday",
    [string]$At = "23:00"
)

$ErrorActionPreference = "Stop"

$runScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "run_supabase_backup.ps1"))
if (-not (Test-Path $runScript)) {
    throw "No existe el script de backup: $runScript"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$next = $task | Get-ScheduledTaskInfo

Write-Output "Tarea creada/actualizada:"
Write-Output ("- Nombre: {0}" -f $task.TaskName)
Write-Output ("- Estado: {0}" -f $task.State)
Write-Output ("- Proxima ejecucion: {0}" -f $next.NextRunTime)
