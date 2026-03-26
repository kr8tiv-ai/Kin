# Precedence Resolver Design

> Drafted for the first executable domain behavior built on top of the runtime contract

## Goal
Implement a small, explicit precedence resolver that decides which source of guidance wins when active spec, explicit feedback, project preferences, owner preferences, and model defaults conflict.

## Why this next
The M003 integration contract is centered on precedence. This is the smallest meaningful domain behavior that turns the contract from structure into executable decision logic without prematurely building a full runtime.

## Recommended approach
Add a thin Python module that accepts already-validated runtime payloads and resolves a single guidance decision.

## Proposed files
- `runtime_types/precedence.py`
- optional examples or notes in `runtime_types/README.md`

## Behavior
The resolver should encode this order:
1. active spec
2. explicit current-unit feedback
3. project preference
4. owner preference
5. default/model prior

It should return a structured result describing:
- winning source
- winning rule/value
- any overridden candidates
- reason or explanation string

## Inputs
Keep the API narrow.
Possible function shape:
- `resolve_precedence(key: str, truth_surface: TruthSurface, default: object | None = None) -> ResolutionResult`

Where `key` is something like:
- `design.glossiness`
- `workflow.teaching_mode`
- `routing.prefer_local`

The first pass should stay simple and work with a generic rule lookup pattern rather than building a full DSL.

## Output type
Add a small TypedDict-like result shape or dataclass-lite dict structure containing:
- `key`
- `winner_source`
- `winner_value`
- `overridden_sources`
- `reason`

## Rules
- No inference beyond declared precedence.
- No mutation of the truth surface.
- No feedback promotion logic here.
- No storage side effects.
- If nothing matches, fall back to provided default.

## Success criteria
- Resolver imports cleanly.
- Resolver can produce a deterministic result for a simple key.
- Behavior matches the M003 precedence contract.
- The repo gains the first executable domain decision module above the parser bridge.
