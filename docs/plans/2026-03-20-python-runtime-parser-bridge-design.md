# Python Runtime Parser Bridge Design

> Drafted for the first usable runtime utility layer above schemas and TypedDict contracts

## Goal
Add a thin Python parser/bridge layer that validates incoming payloads against the existing schema contract and returns typed runtime objects without introducing hidden business logic.

## Approach
Create a reusable validation core and a small parser module.

### Proposed files
- `runtime_types/schema_validation.py`
- `runtime_types/parsers.py`

## Responsibilities

### `schema_validation.py`
- shared schema loading
- local `$ref` resolution
- recursive validation against the repo’s supported schema subset
- reusable error reporting for both CLI and runtime parsers

### `parsers.py`
- `load_truth_surface(data)`
- `load_feedback_ledger_entry(data)`
- `load_preference_record(data)`
- `load_routing_provenance_event(data)`
- `load_promotion_decision_record(data)`

Each function should:
- validate the given payload against the matching schema
- return the same payload typed as the corresponding `TypedDict`
- raise `ValueError` with readable path-aware messages on failure

## Rules
- no coercion
- no defaults
- no business logic
- no promotion/mutation behavior
- no silent cleanup of invalid payloads

## Why this is the right next step
The repo already has:
- contract docs
- schemas
- example payloads
- a validator CLI
- Python contract types

The missing piece is the first reusable runtime utility that turns “schema exists” into “payload can be safely loaded into code”.

## Success criteria
- CLI validator and parser layer share the same validation core
- typed loaders import cleanly
- valid payloads load successfully
- invalid payloads fail clearly
- the repo gains a usable runtime contract bridge without inventing domain behavior
