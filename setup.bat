@echo off
REM Legacy compatibility wrapper for adaptive installer core.
REM Use: setup.bat [installer flags]
setlocal

echo.
echo   ========================================
echo   KIN Setup ^(adaptive installer^)
echo   ========================================
echo.
echo setup.bat now delegates to deploy-easy.bat.

cd /d %~dp0
if not exist deploy-easy.bat (
  echo Missing deploy-easy.bat
  exit /b 1
)

call deploy-easy.bat %*
