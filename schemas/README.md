# Neutral Runtime Schema Package

## Purpose
This package is the first code-real implementation surface for the M003 runtime-truth and feedback-learning contract.

It encodes portable JSON Schemas for the core governance objects needed to support:
- local-first routing with governed fallback
- explicit provenance and fallback honesty
- bounded feedback-driven learning
- scoped preferences (`project`, `owner`)
- conflict visibility and promotion rules

## Included schemas
- `truth-surface.schema.json`
- `feedback-ledger-entry.schema.json`
- `behavior-signal-entry.schema.json`
- `preference-record.schema.json`
- `routing-provenance-event.schema.json`
- `promotion-decision-record.schema.json`

## Included examples
- `examples/truth-surface.example.json`
- `examples/feedback-ledger-entry.example.json`
- `examples/behavior-signal-entry.example.json`
- `examples/preference-record.example.json`
- `examples/routing-provenance-event.example.json`
- `examples/promotion-decision-record.example.json`

## Design rules
- Governance-critical fields are required.
- Bounded states use explicit enums.
- Schemas default to `additionalProperties: false`.
- The package is neutral and should remain portable across future runtimes.

## What this package does not do
This package does not yet implement:
- storage
- routing logic
- promotion engine logic
- dashboard/UI
- tenant memory backend
- policy execution

It is a contract layer, not a runtime engine.

## Unsafe exclusions
These schemas should not be extended to include:
- secrets
- credentials
- raw chat transcripts
- cross-tenant memory data
- unsupported inferred personality claims without provenance

## How to use this package later
Future runtime components should use these schemas at service boundaries to:
- validate payloads
- generate typed interfaces
- protect governance fields from drift
- keep provenance and learning semantics explicit

A first Python consumer layer now exists under `runtime_types/`, where the current contract is mirrored with `TypedDict` and `Literal` definitions.

## Validation harness
Run:
- `python tools/validate_schemas.py`

What it checks today:
- schema JSON parses successfully
- example JSON parses successfully
- example filenames map to the expected schema filenames
- required fields exist
- enum values used by examples are allowed
- unexpected fields are rejected when a schema sets `additionalProperties: false`
- nested arrays and nested objects used by current schemas
- local `$ref` links within `schemas/`
- primitive array items such as string ID lists

What it does **not** claim to do:
- full Draft 2020-12 JSON Schema validation
- support for `oneOf`, `anyOf`, `allOf`, remote refs, or pattern properties
- deep `format` enforcement beyond the current repo needs
- exhaustive validation of every JSON Schema keyword

This is a repo-local **schema sanity validator**, not a complete schema engine.

## Contract source
The authoritative design/research inputs for this package are:
- `.gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md`
- `.gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md`
- `docs/plans/2026-03-20-neutral-runtime-schema-package-design.md`
