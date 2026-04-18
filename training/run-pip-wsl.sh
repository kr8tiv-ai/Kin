#!/usr/bin/env bash
set -euo pipefail

if [[ -x "$HOME/.venvs/kin-train/bin/pip3" ]]; then
  PIP="$HOME/.venvs/kin-train/bin/pip3"
elif [[ -x "$HOME/.venvs/kin-train/bin/pip" ]]; then
  PIP="$HOME/.venvs/kin-train/bin/pip"
else
  PIP="pip3"
fi

exec "$PIP" "$@"
