@echo off
chcp 65001 >nul
echo ======================================
echo   BaseProxy Scheduled Task Installer
echo ======================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Administrator privileges required.
    echo        Right-click this file and select 'Run as administrator'.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%~dp0setup-scheduled-task.ps1"
if %errorLevel% neq 0 (
    echo.
    echo Installation failed. See error above.
    pause
    exit /b %errorLevel%
)

echo.
pause