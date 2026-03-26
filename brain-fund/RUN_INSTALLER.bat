@echo off
echo ========================================
echo  Get Shit Done (GSD) Installer
echo ========================================
echo.
echo This will install GSD for Claude Code...
echo.
pause
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0install-gsd-download.ps1"
echo.
pause
