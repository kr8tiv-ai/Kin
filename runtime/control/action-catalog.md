# Cipher Action Catalog

## Goal

Define the first runtime-facing action categories for browser and machine control.

## Browser Actions

### Low-risk
- open page
- search documentation or references
- inspect page structure
- gather text or design inspiration
- prepare form fields without submitting

### Medium-risk
- submit forms after approval
- modify CMS/admin content after approval
- upload website assets after approval
- trigger deployment-related UI actions after approval

### High-risk
- publish production changes
- alter billing/account settings
- delete content or environments
- connect third-party integrations

## Machine Actions

### Low-risk
- inspect directories
- read non-sensitive project files
- check process state
- collect environment diagnostics that do not expose secrets

### Medium-risk
- edit project files after approval
- run bounded build/deploy commands after approval
- manage approved browser sessions

### High-risk
- destructive shell actions
- secret extraction or credential movement
- broad filesystem mutation
- installing or modifying privileged system software

## Website Workflow Tie-In

Cipher’s machine/browser actions should support:
- gathering references
- creating or editing website files
- previewing builds
- explaining hosting/deployment steps
- carrying out approved deployment actions such as FTP-oriented publishing
