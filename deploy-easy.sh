#!/bin/bash
# KIN adaptive installer entrypoint (Unix)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

npx tsx scripts/deploy-easy.ts "$@"
