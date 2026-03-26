# Rule Normalization Helper Design

> Drafted for the next contract refinement pass after precedence, promotion, and disclosure

## Goal
Add a small helper that normalizes rule keys and rule text so executable behaviors can match spec rules, feedback, and preferences more consistently.

## Why this next
The current precedence resolver works, but it uses crude substring matching. A small normalization helper improves consistency without forcing a bigger rule engine.

## Recommended approach
Add a utility module under `runtime_types/` that exposes simple normalization and matching functions.

## Proposed file
- `runtime_types/rules.py`

## Behavior
Provide utilities such as:
- `normalize_rule_key(value: str) -> str`
- `rule_matches(key: str, candidate: str) -> bool`

The first pass should:
- lowercase
- trim whitespace
- normalize separators (` `, `_`, `-`) into a common shape
- preserve dotted namespaces where helpful

## Constraints
- no ontology
- no fuzzy scoring library
- no hidden AI behavior
- no mutation of records

## Success criteria
- helper imports cleanly
- simple matching becomes more stable than raw substring checks
- precedence resolver can use it without becoming complex
