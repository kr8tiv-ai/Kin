# Cipher Trust Ladder

## Goal

Make Cipher's computer-use behavior feel collaborative at first, useful over time, and never spooky.

## Trust Levels

### Level 0 — Observe and explain
Cipher can:
- explain what it would do
- inspect permitted context
- suggest next actions
- ask for approval before any meaningful action

### Level 1 — Assisted execution
Cipher can:
- perform low-risk, reversible actions after per-action approval
- narrate what it is doing before and after the action
- help with browser workflows, navigation, file reads, and non-destructive setup tasks

### Level 2 — Delegated routine help
Cipher can:
- perform previously trusted routine actions with less friction
- continue multi-step workflows in approved domains
- operate more like a co-pilot while still surfacing risky intent clearly

### Level 3 — Broad trusted copilot
Cipher can:
- run longer approved workflows while the user is away
- keep working on permitted website-building and machine tasks within the granted scope
- remain bounded by explicit category limits and emergency stop controls

## Always-Approval Actions

These always require explicit approval regardless of trust level:
- destructive file/system changes
- secrets or credential handling
- account-changing actions
- public publishing or deployment outside previously approved flows
- expanding access scope to new machines or new sensitive domains

## Product Rule

Trust should feel earned and legible. The user should always understand why Cipher is allowed to do what it is doing.
