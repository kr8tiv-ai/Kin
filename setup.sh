#!/bin/bash
# KIN Platform — One-Command Setup
# Run: chmod +x setup.sh && ./setup.sh

set -e

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║       KIN Platform Setup          ║"
echo "  ║   Your AI Companion Family        ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# ─── Check Node.js ──────────────────────────────────────────
NODE_VERSION=$(node -v 2>/dev/null || echo "none")
if [ "$NODE_VERSION" = "none" ]; then
  echo "❌ Node.js is not installed."
  echo "   Install it from: https://nodejs.org (version 20+)"
  exit 1
fi

NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js 20+ required. You have $NODE_VERSION"
  echo "   Update from: https://nodejs.org"
  exit 1
fi
echo "✓ Node.js $NODE_VERSION"

# ─── Install Dependencies ───────────────────────────────────
echo ""
echo "📦 Installing dependencies..."
npm install --silent 2>/dev/null
echo "✓ Dependencies installed"

# ─── Create .env if missing ─────────────────────────────────
if [ ! -f .env ]; then
  echo ""
  echo "📝 Creating .env from template..."
  cp .env.example .env

  # Generate JWT secret
  JWT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT/" .env
  else
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT/" .env
  fi
  echo "✓ JWT_SECRET generated"

  # Prompt for bot token
  echo ""
  echo "🤖 Telegram Bot Token Required"
  echo "   1. Open Telegram and message @BotFather"
  echo "   2. Send /newbot and follow the steps"
  echo "   3. Copy the token it gives you"
  echo ""
  read -p "   Paste your bot token (or press Enter to skip): " BOT_TOKEN
  if [ -n "$BOT_TOKEN" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=$BOT_TOKEN/" .env
    else
      sed -i "s/TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=$BOT_TOKEN/" .env
    fi
    echo "   ✓ Bot token saved"
  else
    echo "   ⚠ Skipped — add TELEGRAM_BOT_TOKEN to .env before starting"
  fi

  # Prompt for owner Telegram ID
  echo ""
  echo "👤 Owner Telegram ID (optional)"
  echo "   Message @userinfobot on Telegram to find your ID"
  read -p "   Your Telegram user ID (or press Enter to skip): " OWNER_ID
  if [ -n "$OWNER_ID" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/OWNER_TELEGRAM_ID=.*/OWNER_TELEGRAM_ID=$OWNER_ID/" .env
    else
      sed -i "s/OWNER_TELEGRAM_ID=.*/OWNER_TELEGRAM_ID=$OWNER_ID/" .env
    fi
    echo "   ✓ Owner ID saved"
  fi
else
  echo "✓ .env already exists"
fi

# ─── Create data directory ──────────────────────────────────
mkdir -p data
echo "✓ Data directory ready"

# ─── Check Ollama ───────────────────────────────────────────
echo ""
OLLAMA_STATUS=$(curl -s http://127.0.0.1:11434/api/tags 2>/dev/null && echo "ok" || echo "down")
if [ "$OLLAMA_STATUS" = "down" ]; then
  echo "⚠ Ollama is not running"
  echo "  Install from: https://ollama.com"
  echo "  Then run: ollama pull llama3.2"
else
  echo "✓ Ollama is running"
fi

# ─── Done ───────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  Start KIN:   npm run dev"
echo "  Run tests:   npm test"
echo "  Health check: send /health in Telegram"
echo "═══════════════════════════════════════"
echo ""
