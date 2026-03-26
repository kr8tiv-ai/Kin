# Feedback Promotion Evaluator Design

> Drafted for the next executable behavior pass after precedence resolution

## Goal
Implement a small evaluator that decides whether a feedback item should stay local-only, promote to project scope, promote to owner scope, or be rejected.

## Why this next
The runtime contract now has:
- structure
- validation
- typed parsing
- precedence resolution

The next missing behavior is learning promotion. This is the second core decision surface in the M003 contract.

## Recommended approach
Add a narrow Python module that consumes feedback entries and optional context counts, then returns a promotion decision result without mutating state.

## Proposed file
- `runtime_types/promotion.py`

## Input model
Keep it simple and explicit. First pass can accept:
- one `FeedbackLedgerEntry`
- optional repeat count in current project
- optional repeat count across projects
- optional boolean for explicit durable preference
- optional boolean for policy-safe / tenant-safe

## Output
Return a structured result containing:
- decision (`local-only`, `project`, `owner`, `reject`)
- reason
- whether provenance blocks stronger promotion

## First-pass rules
- reject if unsafe or cross-tenant / policy-blocked
- promote to owner if explicit durable preference or strong cross-project repeat
- promote to project if repeated within project
- keep local-only otherwise
- do not treat `external-only` evidence as proof of local capability

## Constraints
- no storage
- no mutation
- no inference from unrelated personal details
- no hidden scoring heuristics beyond simple explicit rules

## Success criteria
- module imports cleanly
- one or two simple promotion decisions can be demonstrated from Python
- behavior aligns with the scoped-learning rules in M003/S05
