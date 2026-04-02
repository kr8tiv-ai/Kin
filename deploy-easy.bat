@echo off
REM KIN adaptive installer entrypoint (Windows)
setlocal
cd /d %~dp0
npx tsx scripts/deploy-easy.ts %*
