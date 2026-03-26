#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

ORG = "kr8tiv-ai"
REPO = "kr8tiv-runtime-truth-contracts"
DESCRIPTION = "Public schema-first runtime contracts for local-first routing, governed fallback, scoped feedback learning, and auditable behavioral shaping."


def load_dotenv_token() -> str | None:
    env_path = Path('.env')
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding='utf-8').splitlines():
        if line.startswith('GITHUB_TOKEN='):
            return line.split('=', 1)[1].strip()
    return None


def api_request(method: str, url: str, token: str, payload: dict | None = None) -> tuple[int, object]:
    data = None if payload is None else json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            'Accept': 'application/vnd.github+json',
            'Authorization': f'Bearer {token}',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'website-model-lab-agent',
            'Content-Type': 'application/json',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode('utf-8')
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8')
        return exc.code, json.loads(body) if body else {}


def main() -> int:
    token = os.environ.get('GITHUB_TOKEN') or load_dotenv_token()
    if not token:
        print(json.dumps({'error': 'GITHUB_TOKEN not available'}, indent=2))
        return 1

    repo_url = f'https://api.github.com/repos/{ORG}/{REPO}'
    status, body = api_request('GET', repo_url, token)
    if status == 200:
        print(json.dumps({'status': 'exists', 'repo': body.get('html_url')}, indent=2))
        return 0

    create_url = f'https://api.github.com/orgs/{ORG}/repos'
    payload = {
        'name': REPO,
        'description': DESCRIPTION,
        'private': False,
        'visibility': 'public',
        'has_issues': True,
        'has_projects': True,
        'has_wiki': False,
        'auto_init': False,
    }
    status, body = api_request('POST', create_url, token, payload)
    print(json.dumps({'status_code': status, 'response': body}, indent=2))
    return 0 if status in {200, 201} else 1


if __name__ == '__main__':
    raise SystemExit(main())
