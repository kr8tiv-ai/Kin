@echo off
REM KIN Platform — One-Command Setup (Windows)
REM Run: setup.bat

echo.
echo   =======================================
echo        KIN Platform Setup
echo      Your AI Companion Family
echo   =======================================
echo.

REM Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
  echo X Node.js is not installed.
  echo   Install from: https://nodejs.org ^(version 20+^)
  exit /b 1
)
for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_VER=%NODE_VER:v=%
if %NODE_VER% LSS 20 (
  echo X Node.js 20+ required.
  echo   Update from: https://nodejs.org
  exit /b 1
)
echo + Node.js OK

REM Install dependencies
echo.
echo Installing dependencies...
call npm install --silent 2>nul
echo + Dependencies installed

REM Create .env if missing
if not exist .env (
  echo.
  echo Creating .env from template...
  copy .env.example .env >nul

  REM Generate JWT secret
  for /f %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set JWT=%%i
  powershell -Command "(Get-Content .env) -replace 'JWT_SECRET=.*', 'JWT_SECRET=%JWT%' | Set-Content .env"
  echo + JWT_SECRET generated

  echo.
  echo BOT TOKEN: Open Telegram, message @BotFather, send /newbot
  set /p BOT_TOKEN="Paste your bot token (or press Enter to skip): "
  if defined BOT_TOKEN (
    powershell -Command "(Get-Content .env) -replace 'TELEGRAM_BOT_TOKEN=.*', 'TELEGRAM_BOT_TOKEN=%BOT_TOKEN%' | Set-Content .env"
    echo + Bot token saved
  ) else (
    echo   Skipped — add TELEGRAM_BOT_TOKEN to .env before starting
  )
) else (
  echo + .env already exists
)

REM Create data directory
if not exist data mkdir data
echo + Data directory ready

REM Done
echo.
echo =======================================
echo   Setup complete!
echo.
echo   Start KIN:   npm run dev
echo   Run tests:   npm test
echo =======================================
echo.
