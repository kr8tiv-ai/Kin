#!/usr/bin/env bash
set -euo pipefail

if [[ -x "$HOME/.venvs/kin-train/bin/python3" ]]; then
  PY="$HOME/.venvs/kin-train/bin/python3"
else
  PY="python3"
fi

exec "$PY" "$@"
