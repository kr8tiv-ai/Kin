#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import urllib.request
from pathlib import Path


def load_dotenv_token() -> str | None:
    env_path = Path('.env')
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding='utf-8').splitlines():
        if line.startswith('GITHUB_TOKEN='):
            return line.split('=', 1)[1].strip()
    return None


def read_git_remotes() -> dict[str, str]:
    try:
        result = subprocess.run(
            ["git", "config", "--get-regexp", r"^remote\..*\.url$"],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception as exc:  # noqa: BLE001
        return {"error": f"git invocation failed: {exc}"}

    if result.returncode != 0:
        return {"error": (result.stderr or result.stdout or "git config failed").strip()}

    remotes: dict[str, str] = {}
    for line in result.stdout.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2:
            continue
        key, url = parts
        remotes[key] = url
    return remotes


def list_org_repos(org: str, token: str) -> object:
    req = urllib.request.Request(
        f"https://api.github.com/orgs/{org}/repos?type=all&per_page=100",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "website-model-lab-agent",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN") or load_dotenv_token()
    if not token:
        print(json.dumps({"error": "GITHUB_TOKEN not available"}, indent=2))
        return 1

    payload = {
        "cwd": str(Path.cwd()),
        "git_remotes": read_git_remotes(),
    }

    try:
        repos = list_org_repos("kr8tiv-ai", token)
        payload["org_repos"] = [
            {
                "name": repo.get("name"),
                "visibility": repo.get("visibility"),
                "private": repo.get("private"),
                "fork": repo.get("fork"),
                "url": repo.get("html_url"),
                "description": repo.get("description"),
            }
            for repo in repos
        ]
    except Exception as exc:  # noqa: BLE001
        payload["org_repos_error"] = str(exc)

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
