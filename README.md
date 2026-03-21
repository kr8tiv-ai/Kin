# KR8TIV Runtime Truth Contracts

Schema-first runtime contract repo for KR8TIV local-first routing, governed fallback, scoped feedback learning, and auditable behavioral shaping.

## What this repo contains
- `schemas/` — portable JSON Schemas for truth-surface, feedback, preferences, provenance, promotion, and behavioral signals
- `runtime_types/` — Python `TypedDict` consumer layer plus thin runtime helpers
- `tools/` — schema validator, demo script, and runtime scenario harness
- `tests/` — stdlib tests for precedence, promotion, disclosure, parser boundaries, and audit formatting
- `runtime/`, `specs/`, `verification/` — supporting design/runtime notes and validation context

## Current focus
- local-first routing with explicit provenance disclosure
- scoped preference learning
- shaping from both explicit feedback and quiet behavioral evidence
- auditable promotion outcomes

## Verification
- `python tools/validate_schemas.py`
- `python -c "import runpy; runpy.run_path('tests/test_runtime_types.py', run_name='__main__')"`
- `python tools/runtime_scenarios.py`

## Notes
This repo is intended to stay public and contract-oriented. It should not contain secrets, private tenant data, or raw sensitive transcripts.
