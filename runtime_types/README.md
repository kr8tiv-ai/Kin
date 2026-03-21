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
- `runtime_step.py` — composed one-step runtime seam with runtime-owned artifact output
- `runtime_operations.py` — operational readiness and mismatch-localization helpers for one runtime step
- `telegram_voice_loop.py` — deterministic Telegram voice-turn derivation gated by concierge lifecycle truth
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
- `RuntimeStepArtifacts`
- `RuntimeReadinessSummary`
- `TelegramInboundVoiceNoteRecord`
- `TelegramVoiceTranscriptRecord`
- `TelegramVoiceReplyRecord`
- `TelegramVoiceContinuityRecord`
- `TelegramVoiceTurnRecord`
- shared schema validation helpers
- thin parser/bridge functions
- a first-pass precedence resolver

## What is not modeled yet
- storage
- service interfaces beyond one composed runtime step
- long-horizon orchestration
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

## Runtime-owned artifact seam
`resolve_runtime_step(...)` now always returns an `artifacts` block alongside the precedence result and any optional disclosure/promotion convenience fields.

That artifact block contains three always-present sections:
- `provenance` — route mode, route reason, fallback state, and disclosure details derived from the same route/disclosure seam the runtime used
- `feedback_selection` — whether a relevant feedback entry was selected, which one, and why
- `promotion_analysis` — whether promotion was evaluated, the decision when present, and a stable audit summary

This is the first inspection surface for S03+ drift. If route truth, disclosure truth, feedback selection, or promotion evidence seem inconsistent, inspect `result["artifacts"]` before reading lower-level helpers.

## Operational readiness seam
`evaluate_runtime_readiness(...)` now provides the first MVP-facing operational check over one runtime-step result.

It does not recompute truth. It inspects the already-composed runtime result and answers:
- is the artifacts block present?
- does `result["disclosure"]` still match artifact provenance?
- does `result["promotion"]` still match artifact promotion analysis?

It returns a compact summary with:
- `status` (`ready` or `not-ready`)
- `checks`
- `failed_checks`
- `mismatches`

This is the first inspection surface for S04+ MVP-honesty doubts.

## Empty-case semantics
The artifact block is present even when no relevant feedback exists.

In that case:
- `feedback_selection.selected` is `false`
- `feedback_selection.selected_feedback_id` is `null`
- `promotion_analysis.status` is `not-evaluated`
- `promotion_analysis.decision` is `null`

This avoids ambiguity between “not evaluated” and “missing output”.

## Demo restore point
A runnable demonstration exists at `tools/demo_runtime_step.py`.

It loads the example truth surface, runs one populated and one empty-case runtime step, and prints concise artifact summaries.

Run:
- `python tools/demo_runtime_step.py`

Note: in this environment the standalone demo entrypoint still crashes intermittently, so prefer the test and readiness surfaces below when you need dependable verification.

## Operational readiness restore point
A dedicated readiness script now exists at `tools/runtime_operational_readiness.py`.

It loads the repo truth-surface fixture and prints:
- a healthy populated case
- a deliberately drifted promotion-artifact mismatch case
- a healthy empty-feedback case

Run:
- `python tools/runtime_operational_readiness.py`

Inspect `failed_checks` and `mismatches` first when MVP honesty is in doubt.

## Scenario restore point
A lightweight multi-scenario harness now exists at `tools/runtime_scenarios.py`.

It exercises precedence, disclosure, promotion, populated/empty artifact cases, and readiness drift detection.

Run:
- `python tools/runtime_scenarios.py`

## Concierge restore point
A dedicated concierge inspection restore point now exists at `tools/inspect_concierge_claim.py`.

It derives representative concierge onboarding states through `derive_concierge_lifecycle(...)` and prints a stable, support-safe summary for:
- `claim_status`
- `setup_stage`
- `activation_ready`
- `blocking_reason`
- `manual_checkpoint`
- `next_user_step`
- setup-guidance summary and support-safe notes

Run:
- `python tools/inspect_concierge_claim.py`

Use this script first when a future agent needs to understand whether a concierge claim is:
- claimed but still waiting on setup
- blocked and waiting on a manual checkpoint
- activation ready

This is the authoritative S01 restore point for concierge onboarding truth. It intentionally reuses the schema-backed runtime helper instead of maintaining a separate CLI-only output model.

## Telegram voice restore point
A dedicated Telegram voice-loop inspection restore point now exists at `tools/inspect_telegram_voice_loop.py`.

It derives representative blocked, activation-ready, and continuity-carryover Telegram voice turns through `derive_telegram_voice_turn(...)` and prints a stable, line-oriented summary for:
- `voice_turn_status`
- `activation_gate_status`
- `blocked_reason`
- support-safe transcript and intent summaries
- voiced-reply readiness/status
- continuity/session state and carryover summary

Run:
- `python tools/inspect_telegram_voice_loop.py`

Use this script first when a future agent needs to inspect whether a Telegram voice turn is blocked on onboarding, ready for voiced concierge follow-up, or carrying forward support-safe continuity across turns.

This is the authoritative S02 restore point for the Telegram voice-loop seam. It intentionally reuses the schema-backed derivation helper instead of maintaining a separate CLI-only formatter model, and it proves only the contract and support-safe inspection surface — not live Telegram Bot API transport wiring.

## Formal test restore points
Stdlib test layers now exist at:
- `tests/test_runtime_types.py`
- `tests/test_schema_validation.py`
- `tests/test_runtime_operations.py`

They cover:
- active-spec precedence over feedback
- scope-aware explicit feedback selection
- parser/schema boundary enforcement for behavioral signals
- parser/schema boundary enforcement for runtime-step artifacts
- example/schema validation behavior
- blocking behavioral signals such as repair and non-adoption
- supporting acceptance signals that can weakly support project promotion
- promotion audit fields (`blocking_signal_type`, `supporting_signal_used`)
- disclosure formatting for hybrid and fallback-refused paths
- composed runtime-step behavior, including artifact population for both empty and non-empty cases
- readiness classification for healthy, drifted, and missing-artifact results

Run:
- `python -m unittest tests.test_runtime_types tests.test_schema_validation tests.test_runtime_operations`

## Schema restore point
The schema examples under `schemas/examples/` include dedicated runtime-step artifact fixtures:
- `runtime-step-artifacts.example.json`
- `runtime-step-artifacts-empty.example.json`

Use them with:
- `python tools/validate_schemas.py`

If schema validation fails, check example-to-schema mapping first, then compare fixture shape against the parser boundary.
 compare fixture shape against the parser boundary.
