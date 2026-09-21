@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_supabase_backup.ps1"
endlocal
