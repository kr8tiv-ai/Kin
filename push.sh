#!/bin/bash
# Git push script for WSL

cd /mnt/c/Users/lucid/Desktop/Kin/website-model-lab

echo "=== Git Status ==="
git status --short

echo ""
echo "=== Adding Files ==="
git add -A

echo ""
echo "=== Committing ==="
git commit -m "feat: Complete M024 24-Hour Platform Completion" \
  -m "Implemented modules:" \
  -m "- Telegram bot with Cipher personality" \
  -m "- Local LLM integration (Ollama + fallback)" \
  -m "- Voice processing (Whisper + TTS)" \
  -m "- Website building pipeline" \
  -m "- Production API (Fastify + JWT + WebSocket)" \
  -m "- Tailscale remote access with trust ladder" \
  -m "- Solana NFT scaffold" \
  -m "- All 6 Genesis Six companions" \
  -m "- Health monitoring daemon" \
  -m "- Integration tests" \
  -m "" \
  -m "42 files, ~25K lines of code"

echo ""
echo "=== Pushing to GitHub ==="
git push origin main

echo ""
echo "✅ Push complete!"
