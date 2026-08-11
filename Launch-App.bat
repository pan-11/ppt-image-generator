@echo off
setlocal
cd /d "%~dp0"
title Local Image Generator

echo.
echo ==================================
echo   Local Image Generator Launcher
echo ==================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js 20 or newer, then run this file again.
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo Please reinstall Node.js, then try again.
  pause
  exit /b 1
)

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo A new .env file was created.
  echo Please set TOAPIS_API_KEY first, then run this file again.
  start "" notepad ".env"
  pause
  exit /b 1
)

findstr /b /c:"TOAPIS_API_KEY=replace-me" ".env" >nul
if not errorlevel 1 (
  echo TOAPIS_API_KEY is still not set.
  echo Replace replace-me with your real key, save the file, then run again.
  start "" notepad ".env"
  pause
  exit /b 1
)

findstr /r /c:"^TOAPIS_API_KEY=$" ".env" >nul
if not errorlevel 1 (
  echo TOAPIS_API_KEY is empty.
  start "" notepad ".env"
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies for the first run...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed. Please check your network and try again.
    pause
    exit /b 1
  )
)

if not exist "app-data" mkdir "app-data"
for /f "tokens=1,2 delims=|" %%P in ('powershell -NoProfile -Command "$self = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $PID); $parent = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $self.ParentProcessId); $parent.ProcessId.ToString() + '|' + $parent.CreationDate.ToUniversalTime().Ticks"') do (
  set "APP_PID=%%P"
  set "APP_STARTED=%%Q"
)

if not defined APP_PID (
  echo Could not record the launcher process.
  pause
  exit /b 1
)

>"app-data\launcher.pid" echo %APP_PID%^|%APP_STARTED%

echo Starting app...
echo Browser will open at http://127.0.0.1:5173
echo Double-click the stop script or close this window to stop the app.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://127.0.0.1:5173'"
call npm.cmd run dev

echo.
echo App stopped.
>"app-data\launcher.pid" type nul
pause
