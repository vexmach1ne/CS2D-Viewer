@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required. Install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\electron\package.json" (
  echo Installing project dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm.cmd run dev
if errorlevel 1 pause
