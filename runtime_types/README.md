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

## Cipher continuity restore point
A dedicated Cipher continuity inspection restore point now exists at `tools/inspect_cipher_continuity.py`.

It derives representative activation-ready, carryover, and drift-guard continuity records through `derive_cipher_continuity(...)` and prints a stable, support-safe summary for:
- `continuity_status`
- `continuity_source`
- `identity_safety_status`
- `drift_guard_triggered`
- active persona markers
- spoken-manner markers
- carryover source reference
- policy / guardrail summaries

Run:
- `python tools/inspect_cipher_continuity.py`

Use this script when a future agent needs to inspect whether Cipher still presents one governed identity across truth-surface persona inputs and the canonical Telegram voice-turn seam.

This is the authoritative S03 restore point for identity/personality continuity. It intentionally layers on top of the S02 Telegram voice restore point instead of replacing it:
- S02 (`tools/inspect_telegram_voice_loop.py`) remains the factual voice/session seam for transcript, reply, and continuity-turn state.
- S03 (`tools/inspect_cipher_continuity.py`) is the identity continuity seam that interprets those voice-turn facts together with `TruthSurface` persona/policy truth.

Inspect S02 first when a bug might be in onboarding, reply readiness, or session carryover mechanics. Inspect S03 when the question is whether Cipher’s bounded persona markers, spoken posture, and drift guard behavior still read as one support-safe identity.

## Website-specialist harness restore point
A dedicated website-specialist harness inspection restore point now exists at `tools/inspect_website_specialist_harness.py`.

It derives representative local-success, hybrid-escalation, and fallback-refused website-specialist records through `derive_website_specialist_harness_record(...)` and prints a stable, support-safe summary for:
- request status and requested capability
- activation handoff status
- route mode and route reason
- disclosure level and disclosure text
- specialist status and task phase
- fallback-refused state
- continuity carryover refs
- persona and spoken-manner markers
- support-safe execution and outcome summaries

Run:
- `python tools/inspect_website_specialist_harness.py`

Use this script when a future agent needs to inspect whether a website request:
- stayed local end to end
- escalated through a bounded hybrid route with explicit disclosure
- remained support-safe while refusing external fallback

This is the authoritative S04 restore point for route-honest website-specialist execution truth. It intentionally composes the earlier seams instead of replacing them:
- S02 (`tools/inspect_telegram_voice_loop.py`) remains the factual Telegram voice/session seam.
- S03 (`tools/inspect_cipher_continuity.py`) remains the persona / continuity seam.
- S04 (`tools/inspect_website_specialist_harness.py`) is the composed website-specialist seam that adds routing provenance and execution-state honesty on top of those earlier facts.

Inspect S02 first when the problem might be in onboarding, voiced reply readiness, or session carryover. Inspect S03 when the question is whether Cipher still reads as one governed identity. Inspect S04 when the operator question is whether website-specialist work stayed local, used hybrid help, or explicitly refused fallback while preserving bounded continuity markers.

The S04 restore point proves the contract seam and support-safe inspection surface only. It does **not** claim that a live website execution runtime, browser automation loop, or external website mutation pipeline is fully wired in this repo.

## S05 design-teaching and research seam
A dedicated S05 restore point now exists at `tools/inspect_design_teaching_research.py`.

It derives representative local-teaching, hybrid-research, and blocked/suppressed records through `derive_design_teaching_research_record(...)` and prints a stable, support-safe summary for:
- teaching status
- research status
- provenance mode
- freshness label
- disclosure level and disclosure text
- lesson summary
- anti-slop rationale
- translated signal summary
- composed support-safe summary

Run:
- `python tools/inspect_design_teaching_research.py`

Use this script when a future agent needs to inspect whether Cipher can:
- explain design choices from local S04 website-specialist truth alone
- disclose bounded hybrid current-reference support honestly
- remain blocked or suppressed without pretending live browsing, leaking raw references, or exposing private memory

This is the authoritative S05 restore point for design-teaching and research truth. It intentionally layers on top of S04 rather than replacing it:
- S04 (`tools/inspect_website_specialist_harness.py`) remains the factual website-specialist execution seam for route mode, fallback honesty, and continuity markers.
- S05 (`tools/inspect_design_teaching_research.py`) is the teaching/research interpretation seam that adds bounded lesson output, provenance/freshness/disclosure, and anti-slop rationale on top of canonical S04 harness truth.

Inspect S04 first when the question is whether website-specialist work stayed local, used bounded hybrid help, or refused fallback. Inspect S05 when the operator question is whether Cipher can teach the design reasoning, disclose research provenance honestly, and stay support-safe without exposing transcripts, raw reference dumps, or private memory.

## S06 taste adaptation and memory-boundary seam
A dedicated S06 restore point now exists at `tools/inspect_taste_adaptation_memory_boundary.py`.

It derives representative spec-suppressed, preserved-decisions, and hybrid-guarded taste-adaptation records through `derive_taste_adaptation_record(...)` and prints a stable, support-safe summary for:
- active taste signal targets and summaries
- suppressed taste signal targets, reasons, and summaries
- preserved decision targets and rationales
- changed decision targets and reasons
- precedence winners by target
- composed support-safe adaptation summary

Run:
- `python tools/inspect_taste_adaptation_memory_boundary.py`

Use this script when a future agent needs to inspect whether Cipher can:
- keep confirmed project taste active when no spec conflict exists
- suppress owner teaching taste when the active spec narrows the deliverable
- guard hybrid/external wins from laundering into owner memory
- show precedence outcomes with explicit reasons instead of silently disappearing conflicting signals

This is the authoritative S06 restore point for taste adaptation and memory-boundary truth. It intentionally layers on top of S05 rather than replacing it:
- S05 (`tools/inspect_design_teaching_research.py`) remains the factual design-teaching/research seam.
- S06 (`tools/inspect_taste_adaptation_memory_boundary.py`) is the adaptation/boundary seam that adds taste signals, decisions, and precedence outcomes on top of canonical S05 truth.

Inspect S05 first when the question is about design-teaching posture, research provenance, or anti-slop rationale. Inspect S06 when the operator question is about whether learned taste signals stayed active or got suppressed, whether decisions were preserved or changed, and whether hybrid/external wins were guarded from owner memory.

The S06 restore point proves the contract seam and support-safe inspection surface only. It does **not** claim that a live taste-learning pipeline, persistent preference storage, or production memory system is fully wired in this repo.

Pinned S06 proof now lives at:
- `tests/test_taste_adaptation_memory_boundary.py`
- `tests/test_runtime_types.py`
- `schemas/examples/taste-adaptation-record.*.example.json`

Preferred verification commands for the current seam are:
- `python tools/inspect_taste_adaptation_memory_boundary.py`
- `python -m unittest tests.test_taste_adaptation_memory_boundary`
- `python tmp_verify_s06.py`

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
