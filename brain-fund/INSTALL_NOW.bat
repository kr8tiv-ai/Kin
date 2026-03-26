@echo off
setlocal enabledelayedexpansion

echo ========================================
echo  Get Shit Done (GSD) Installer
echo  Multiple installation methods
echo ========================================
echo.

REM Method 1: Try npx directly
echo [1/3] Trying direct npx installation...
npx get-shit-done-cc@latest --claude --global 2>nul
if %errorlevel% == 0 (
    echo SUCCESS! GSD installed via npx.
    goto :success
)
echo Failed. Trying alternative method...
echo.

REM Method 2: Download and install
echo [2/3] Trying download method via PowerShell...
powershell.exe -ExecutionPolicy Bypass -Command "& {Invoke-WebRequest -Uri 'https://api.github.com/repos/gsd-build/get-shit-done/zipball/main' -OutFile '%TEMP%\gsd.zip'; Expand-Archive -Path '%TEMP%\gsd.zip' -DestinationPath '%TEMP%\gsd' -Force; $dir = Get-ChildItem '%TEMP%\gsd' -Directory | Select-Object -First 1; Set-Location $dir.FullName; node bin/install.js --claude --global; Remove-Item '%TEMP%\gsd.zip' -Force; Remove-Item '%TEMP%\gsd' -Recurse -Force}" 2>nul
if %errorlevel% == 0 (
    echo SUCCESS! GSD installed via download.
    goto :success
)
echo Failed. Trying git clone method...
echo.

REM Method 3: Git clone and install
echo [3/3] Trying git clone method...
if exist "%TEMP%\gsd-temp" rmdir /s /q "%TEMP%\gsd-temp"
git clone https://github.com/gsd-build/get-shit-done.git "%TEMP%\gsd-temp" 2>nul
if %errorlevel% == 0 (
    cd /d "%TEMP%\gsd-temp"
    node bin/install.js --claude --global
    cd /d "%~dp0"
    rmdir /s /q "%TEMP%\gsd-temp"
    echo SUCCESS! GSD installed via git clone.
    goto :success
)
echo Failed. All methods exhausted.
echo.

:failure
echo ========================================
echo  Installation Failed
echo ========================================
echo.
echo All automatic installation methods failed.
echo.
echo Please try manually:
echo   1. Open PowerShell as Administrator
echo   2. Run: npx get-shit-done-cc@latest --claude --global
echo.
echo Or visit: https://github.com/gsd-build/get-shit-done
echo.
pause
exit /b 1

:success
echo.
echo ========================================
echo  Installation Successful!
echo ========================================
echo.
echo GSD has been installed to: %USERPROFILE%\.claude\
echo.
echo Available commands:
echo   /gsd:help              - Show all GSD commands
echo   /gsd:new-project       - Initialize a new project
echo   /gsd:plan-phase        - Plan a phase
echo   /gsd:execute-phase     - Execute a phase
echo.
echo Restart Claude Code to use GSD commands.
echo.
pause
exit /b 0
