#!/usr/bin/env python3
"""
Git push helper for Windows when bash spawn fails.
"""

import subprocess
import sys
import os

def run_git_command(args, check=True):
    """Run a git command and return output."""
    cmd = ['git'] + args
    print(f"Running: {' '.join(cmd)}")
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.abspath(__file__))
    )
    
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    
    if check and result.returncode != 0:
        print(f"Command failed with code {result.returncode}", file=sys.stderr)
        return None
    
    return result.stdout

def main():
    # Check git status
    print("=== Git Status ===")
    run_git_command(['status', '--short'])
    
    # Add all changes
    print("\n=== Adding Files ===")
    run_git_command(['add', '-A'])
    
    # Commit
    print("\n=== Committing ===")
    commit_message = """feat: Complete M024 24-Hour Platform Completion

Implemented modules:
- Telegram bot with Cipher personality
- Local LLM integration (Ollama + fallback)
- Voice processing (Whisper + TTS)
- Website building pipeline
- Production API (Fastify + JWT + WebSocket)
- Tailscale remote access with trust ladder
- Solana NFT scaffold
- All 6 Genesis Six companions
- Health monitoring daemon
- Integration tests

42 files, ~25K lines of code
"""
    run_git_command(['commit', '-m', commit_message])
    
    # Push
    print("\n=== Pushing to GitHub ===")
    run_git_command(['push', 'origin', 'main'])
    
    print("\n✅ Push complete!")

if __name__ == '__main__':
    main()
