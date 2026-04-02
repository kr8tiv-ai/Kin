#!/bin/bash
# Legacy compatibility wrapper for adaptive installer core.
# Use: ./setup.sh [installer flags]

set -euo pipefail

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║      KIN Setup (adaptive installer)          ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

echo "setup.sh now delegates to deploy-easy.sh."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "deploy-easy.sh" ]; then
  echo "❌ Missing deploy-easy.sh"
  exit 1
fi

chmod +x deploy-easy.sh 2>/dev/null || true
exec ./deploy-easy.sh "$@"
