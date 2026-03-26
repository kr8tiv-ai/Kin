#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

ORG = 'kr8tiv-ai'
REPO = 'kr8tiv-runtime-truth-contracts'
TOPICS = [
    'json-schema',
    'runtime-contracts',
    'local-first',
    'python',
    'governance',
    'agent-systems',
    'feedback-learning',
    'behavioral-signals',
]


def load_dotenv_token() -> str | None:
    env_path = Path('.env')
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding='utf-8').splitlines():
        if line.startswith('GITHUB_TOKEN='):
            return line.split('=', 1)[1].strip()
    return None


def main() -> int:
    token = os.environ.get('GITHUB_TOKEN') or load_dotenv_token()
    if not token:
        print(json.dumps({'error': 'GITHUB_TOKEN not available'}, indent=2))
        return 1

    req = urllib.request.Request(
        f'https://api.github.com/repos/{ORG}/{REPO}/topics',
        data=json.dumps({'names': TOPICS}).encode('utf-8'),
        method='PUT',
        headers={
            'Accept': 'application/vnd.github+json',
            'Authorization': f'Bearer {token}',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'website-model-lab-agent',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode('utf-8'))
    print(json.dumps({'names': body.get('names', [])}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
