# Nested Schema Validation Pass Design

> Drafted for the next executable contract-strengthening step

## Goal
Strengthen the Python schema validation harness so it validates the nested structures that matter for the runtime-truth and feedback-learning contract, without pretending to be a full JSON Schema engine.

## Recommended approach
Extend `tools/validate_schemas.py` into a repo-local recursive validator with limited, explicit support for the subset of JSON Schema features currently used in `schemas/`.

## Why this approach
- Current top-level validation is useful but too shallow for the most important contract fields.
- The most important learning/provenance structures are nested inside `TruthSurface`.
- Strengthening validation before generating runtime types reduces the chance of codifying drift.

## Scope to support
- nested `object` traversal
- nested `array` traversal
- local `$ref` resolution within `schemas/`
- `required`
- `enum`
- `type`
- `additionalProperties: false`
- primitive arrays like string ID lists

## Scope to avoid for now
- full Draft 2020-12 support
- `oneOf`, `anyOf`, `allOf`
- remote refs
- regex/pattern properties
- deep format semantics
- exhaustive keyword support

## Files affected
- `tools/validate_schemas.py`
- `schemas/README.md`
- optionally one or two example files if the validator reveals a contract mismatch

## Success criteria
- validator follows local `$ref` between schema files
- validator checks nested arrays of referenced objects
- validator checks nested primitive arrays
- current example payloads still pass
- future nested contract drift would fail loudly
