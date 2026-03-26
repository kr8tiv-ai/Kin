# Get Shit Done (GSD) Installation Guide for Windows

## The Problem
Claude Code's Bash tool has a known bug on Windows with cygpath, preventing direct installation. But we can work around it!

## Solution: Manual Installation

### Option 1: PowerShell (RECOMMENDED)
Open PowerShell and run:
```powershell
npx get-shit-done-cc@latest --claude --global
```

### Option 2: Command Prompt
Open Command Prompt (cmd.exe) and run:
```cmd
npx get-shit-done-cc@latest --claude --global
```

### Option 3: Use the Batch File
I've created `install-gsd.bat` for you. Just double-click it to run the installation.

### Option 4: Use the PowerShell Script
Run this command in PowerShell:
```powershell
.\install-gsd.ps1
```

## Installation Options

### For Claude Code (this environment):
```bash
npx get-shit-done-cc@latest --claude --global
```

### For local project only:
```bash
npx get-shit-done-cc@latest --claude --local
```

## What Gets Installed

GSD will be installed to:
- **Global**: `~/.claude/` (C:\Users\lucid\.claude\)
- **Local**: `./.claude/` in your current project

## Verify Installation

After installation, check that GSD commands are available:
```bash
/gsd:help
```

## Requirements
- Node.js >= 20.0.0

## Next Steps
After installation, you can use GSD commands like:
- `/gsd:new-project` - Initialize a new project
- `/gsd:plan-phase` - Create a phase plan
- `/gsd:execute-phase` - Execute a phase
- `/gsd:help` - Get help

## Troubleshooting

If you encounter issues:
1. Make sure you're running from PowerShell or CMD, not Git Bash
2. Check Node.js version: `node --version`
3. Try running with administrator privileges if permission errors occur

---
**Ready to install?** Open PowerShell and run the command above!
