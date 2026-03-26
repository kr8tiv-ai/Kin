@echo off
cd /d C:\Users\lucid\Desktop\Kin\website-model-lab

echo === Git Status ===
git status --short

echo.
echo === Adding Files ===
git add -A

echo.
echo === Committing ===
git commit -m "feat: Complete M024 24-Hour Platform Completion" -m "Implemented: Telegram bot, local LLM, voice processing, website building, API, Tailscale, Solana NFT scaffold, 6 companions, health monitoring" -m "42 files, ~25K lines of code"

echo.
echo === Pushing to GitHub ===
git push origin main

echo.
echo Done!
