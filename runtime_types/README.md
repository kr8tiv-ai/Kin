# Python Runtime Contract Types

## Purpose
This package provides the first Python consumer-facing type layer above the schema package.

It mirrors the validated runtime contract using:
- `Literal` aliases for bounded string states
- `TypedDict` definitions for the core runtime objects
- thin parser/bridge helpers that validate payloads against the schema contract before returning typed runtime objects

## Files
- `contracts.py` — core aliases and `TypedDict` contracts
- `schema_validation.py` — shared recursive schema validation core
- `parsers.py` — typed loader/bridge functions
- `feedback_selection.py` — scope-aware relevant-feedback selector
- `behavior_signals.py` — behavioral evidence summarization helpers
- `promotion_audit.py` — compact formatter for promotion audit summaries
- `__init__.py` — public exports

## Relationship to `schemas/`
- `schemas/` is the canonical portable contract layer.
- `runtime_types/` is the first Python-native consumer layer.
- The Python types intentionally remain thin and close to the JSON-shaped contract.

## What is modeled here
- `FeedbackLedgerEntry`
- `PreferenceRecord`
- `RoutingProvenanceEvent`
- `PromotionDecisionRecord`
- `BehaviorSignalEntry`
- `TruthSurface`
- shared schema validation helpers
- thin parser/bridge functions
- a first-pass precedence resolver

## What is not modeled yet
- business logic
- storage
- service interfaces
- promotion engines
- coercive parsing or default injection

## Bridge behavior
The parser layer is intentionally thin:
- validates payloads against the schema contract
- returns typed runtime payloads
- raises `ValueError` on invalid data
- does not infer, mutate, or repair inputs

## Why TypedDicts
TypedDicts are the lowest-risk first consumer layer for a schema-first repo: standard-library only, easy to import, and faithful to JSON-shaped runtime payloads.

## First executable behavior
A first-pass precedence resolver now exists in `runtime_types/precedence.py`.

It currently resolves a single key using this order:
1. active spec (`active_spec.resolved_rules`)
2. explicit feedback
3. project preference
4. owner preference
5. default

This is intentionally narrow. It does not mutate state, promote feedback, or implement domain-specific inference.

## First executable learning behavior
A first-pass feedback promotion evaluator now exists in `runtime_types/promotion.py`.

It currently decides between:
- `reject`
- `local-only`
- `project`
- `owner`

based on explicit safety, repeat counts, provenance warning state, and summarized behavioral evidence such as user repair, non-adoption, reversion, or acceptance without edit.

Its result now also exposes a small audit surface:
- `blocking_signal_type`
- `supporting_signal_used`

A compact summary formatter now exists in `runtime_types/promotion_audit.py` for downstream scripts, demos, or future UI/reporting layers.

This keeps promotion decisions inspectable without persisting extra runtime state.

## First executable honesty behavior
A first-pass provenance disclosure formatter now exists in `runtime_types/disclosure.py`.

It currently derives a disclosure result from a routing/provenance event and can distinguish:
- local path
- hybrid path
- external path
- fallback-refused path

It returns a small structured result with disclosure level, text, and whether external help must be mentioned.

## Rule normalization refinement
A small normalization helper now exists in `runtime_types/rules.py`.

It normalizes rule keys and candidate text into a more stable comparison shape so precedence matching is less brittle across casing and separator differences.
It is intentionally simple and does not implement fuzzy ranking or a larger ontology.

## First composed service layer
A first-pass runtime step service now exists in `runtime_types/runtime_step.py`.

It composes existing behavior for one step by combining:
- precedence resolution
- optional provenance disclosure formatting
- optional feedback promotion evaluation

The promotion result now passes through its behavioral audit fields unchanged, so callers can inspect whether a blocking signal or supporting acceptance signal affected the promotion outcome.

It is intentionally thin and does not persist, mutate, or orchestrate multiple steps.

## Demo restore point
A runnable demonstration now exists at `tools/demo_runtime_step.py`.

It loads the example truth surface, passes it through the parser bridge, runs the composed runtime step, and prints a compact summary showing precedence, disclosure, and promotion behavior together.

## Scenario restore point
A lightweight multi-scenario harness now exists at `tools/runtime_scenarios.py`.

It exercises multiple representative paths across precedence, promotion, disclosure, and promotion-audit formatting behavior and prints PASS/FAIL results. It now includes both acceptance-supported and repair-blocked promotion scenarios, making it a stronger restore point than the single demo because it checks several core contract behaviors and their audit surfaces in one run.

## Formal test restore point
A first stdlib test layer now exists at `tests/test_runtime_types.py`.

It mirrors the current runtime scenarios and adds direct coverage for:
- active-spec precedence over feedback
- scope-aware explicit feedback selection
- parser/schema boundary enforcement for behavioral signals
- stale/superseded preference filtering during resolution
- blocking behavioral signals such as repair and non-adoption
- supporting acceptance signals that can weakly support project promotion
- promotion audit fields (`blocking_signal_type`, `supporting_signal_used`)
- compact promotion-audit formatting for blocked, supported, and neutral cases
- disclosure formatting for hybrid and fallback-refused paths
- composed runtime-step behavior, including propagation of promotion audit fields
