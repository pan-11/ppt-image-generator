@echo off
setlocal
cd /d "%~dp0"
title Stop Local Image Generator

set "PID_FILE=app-data\launcher.pid"

if not exist "%PID_FILE%" goto not_running
for /f "tokens=1,2 delims=|" %%P in (%PID_FILE%) do (
  set "APP_PID=%%P"
  set "APP_STARTED=%%Q"
)

if not defined APP_PID goto not_running
if not defined APP_STARTED goto not_running

powershell -NoProfile -Command "$launcherPid = 0; $started = 0L; if (-not [int]::TryParse($env:APP_PID, [ref]$launcherPid) -or -not [long]::TryParse($env:APP_STARTED, [ref]$started)) { exit 2 }; $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $launcherPid) -ErrorAction SilentlyContinue; if ($null -eq $process -or $process.Name -ne 'cmd.exe' -or $process.CreationDate.ToUniversalTime().Ticks -ne $started) { exit 3 }; & taskkill.exe /PID $launcherPid /T /F | Out-Null; exit $LASTEXITCODE"

if errorlevel 1 goto not_running

>"%PID_FILE%" type nul
echo Project stopped.
powershell -NoProfile -Command "Start-Sleep -Seconds 2"
exit /b 0

:not_running
echo Project is not running.
powershell -NoProfile -Command "Start-Sleep -Seconds 2"
exit /b 0
