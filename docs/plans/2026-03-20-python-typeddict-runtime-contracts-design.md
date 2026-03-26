# Python TypedDict Runtime Contracts Design

> Drafted for the first consumer-facing code layer above the schema package

## Goal
Add a minimal Python runtime contract package using `TypedDict` and `Literal` so future Python consumers can import stable types for the runtime-truth and feedback-learning objects.

## Recommended approach
Create a small `runtime_types/` package with one `contracts.py` module.

This package should mirror the existing schema package closely while staying light:
- `TypedDict` for object shapes
- `Literal` for bounded string states
- no runtime behavior
- no serialization helpers
- no storage logic

## Why this approach
- It is the lightest consumer-facing code layer.
- It matches the current schema-first architecture.
- It uses only the Python standard library.
- It avoids inventing object lifecycle and constructors prematurely.

## Proposed files
- `runtime_types/__init__.py`
- `runtime_types/contracts.py`

## Types to add
- `ScopeRequested`
- `FeedbackTarget`
- `FeedbackPolarity`
- `FeedbackSource`
- `PromotionStatus`
- `ProvenanceLevel`
- `PreferenceScope`
- `ConflictStatus`
- `RouteMode`
- `DestinationScope`
- `FeedbackLedgerEntry`
- `PreferenceRecord`
- `RoutingProvenanceEvent`
- `PromotionDecisionRecord`
- `TruthSurface`

## Modeling rules
- Keep flexible policy/spec/task blobs as generic dict-shaped fields for now.
- Match schema enum values exactly.
- Avoid optionality unless the schema truly allows it.
- Prefer clear aliases over repeated long `Literal[...]` strings.

## What not to do yet
- dataclasses
- runtime validators beyond what already exists
- parsing/coercion helpers
- code generation from schema
- business logic

## Success criteria
- Python package imports cleanly
- type contracts match schema intent
- future services can import these types without pulling in heavier infrastructure
- repo state reflects the first consumer-facing runtime type layer
