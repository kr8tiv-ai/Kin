# Runtime Scenario Suite Design

> Drafted for the next restore point after the single-path demo script

## Goal
Add a small scriptable scenario suite that exercises multiple representative runtime paths through the current stack.

## Why this next
A single demo proves the happy path. A small scenario suite gives better coverage while staying much lighter than a formal test framework.

## Recommended approach
Create a standalone script under `tools/` that runs a few named scenarios and prints PASS/FAIL summaries.

## Proposed file
- `tools/runtime_scenarios.py`

## Initial scenarios
- spec-wins-over-default
- project-promotion
- owner-promotion
- unsafe-feedback-reject
- hybrid-disclosure
- fallback-refused-disclosure

## Constraints
- no test framework required
- no new dependencies
- no persistence or networking

## Success criteria
- script runs from repo root
- multiple representative behaviors are checked in one pass
- output is compact and useful as a sanity harness
