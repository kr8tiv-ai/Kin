# Python Schema Validation Harness Design

> Drafted for post-schema package verification

## Goal
Add a tiny Python-based validation harness that makes the neutral runtime schema package executable without committing the repo to a full Node or package-managed toolchain.

## Recommended approach
Create a single Python script under `tools/` that performs honest, limited validation for the current repo needs.

The harness should:
- parse all schema files
- parse all example payloads
- match examples to schemas by filename convention
- verify required top-level fields are present
- verify example enum values match schema enums
- verify no unexpected top-level fields appear when `additionalProperties` is `false`
- fail with clear messages and non-zero exit code

## Why this approach
- Lowest repo assumptions
- No dependency on Node or package managers
- Good enough to catch drift in governance-critical structures
- Easy to replace or extend later with full JSON Schema validation

## Alternatives considered

### 1. Node-based validator
Not chosen.
Better ecosystem for full JSON Schema later, but it forces a tooling decision the repo has not made.

### 2. No executable validation
Not chosen.
Leaves the schema package static and unverified.

### 3. Python smoke-test validator
Chosen.
It is small, honest, and portable.

## Scope of validation
This harness is intentionally limited.
It is a **schema sanity validator**, not a complete Draft 2020-12 JSON Schema implementation.

It should validate:
- JSON parse correctness
- example-to-schema mapping
- required top-level fields
- enum values used in examples
- top-level extra fields under strict schemas

It should not claim to fully validate:
- nested schema composition
- advanced JSON Schema keywords
- recursive references
- all format semantics

## Proposed files
- `tools/validate_schemas.py`
- optional usage note in `schemas/README.md`

## Command surface
The harness should be runnable with a simple command like:
- `python tools/validate_schemas.py`

## Success criteria
This pass is complete when:
- the validator script exists
- it checks all current schemas and examples
- it exits non-zero on failure
- it prints clear pass/fail messages
- the repo has a first executable validation layer for the schema package
