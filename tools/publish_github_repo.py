#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path

REMOTE_URL = 'https://github.com/kr8tiv-ai/kr8tiv-runtime-truth-contracts.git'


def run(*args: str) -> dict[str, object]:
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    return {
        'args': list(args),
        'returncode': result.returncode,
        'stdout': result.stdout.strip(),
        'stderr': result.stderr.strip(),
    }


def main() -> int:
    payload: dict[str, object] = {}

    payload['branch'] = run('git', 'branch', '--show-current')
    payload['remote_v'] = run('git', 'remote', '-v')

    remotes = run('git', 'remote')
    remote_names = set(remotes['stdout'].split()) if remotes['returncode'] == 0 else set()

    if 'origin' in remote_names:
        payload['set_origin'] = run('git', 'remote', 'set-url', 'origin', REMOTE_URL)
    else:
        payload['add_origin'] = run('git', 'remote', 'add', 'origin', REMOTE_URL)

    payload['status'] = run('git', 'status', '--short')
    payload['add'] = run('git', 'add', 'README.md', 'schemas', 'runtime_types', 'tests', 'tools', 'runtime', 'specs', 'verification', '.gitignore', '.mcp.json', 'docs')

    commit_check = run('git', 'diff', '--cached', '--quiet')
    payload['cached_diff_quiet'] = commit_check
    if commit_check['returncode'] != 0:
        payload['commit'] = run('git', 'commit', '-m', 'feat: publish runtime truth contracts')
    else:
        payload['commit'] = {'skipped': 'no staged changes'}

    payload['push'] = run('git', 'push', '-u', 'origin', 'HEAD:main')

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
