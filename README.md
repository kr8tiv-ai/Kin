# KR8TIV Runtime Truth Contracts

Public schema-first contract repo for KR8TIV local-first routing, governed fallback, scoped feedback learning, and auditable behavioral shaping.

## What this is
This repo defines a small runtime-truth surface for systems that need to decide:
- what rule wins right now
- when fallback must be disclosed
- when feedback should remain local
- when feedback can be promoted
- how quiet behavioral evidence like repair or non-adoption should shape future learning

It is intentionally contract-oriented rather than product-complete.

## Repo structure
- `schemas/` — portable JSON Schemas for truth surfaces, feedback, preferences, provenance, promotion, and behavioral signals
- `runtime_types/` — Python `TypedDict` layer and thin runtime helpers
- `packages/node-runtime/` — minimal Node persistence seam and schema-validated record writers
- `tools/` — schema validator, demo script, org-repo helpers, and runtime scenario harness
- `tests/` — stdlib regression tests for logic, parser boundaries, and audit formatting
- `runtime/` — supporting runtime notes and contract context
- `specs/` — design/reference specs
- `verification/` — validation checklists and contract verification notes
- `docs/plans/` — design and implementation plans used to shape the current contract

A good starting note for the public shape of the work is:
- `specs/why-this-exists-and-node-atomicity.md`

## Current capabilities
- precedence resolution across spec, explicit feedback, preferences, and defaults
- concierge onboarding lifecycle derivation plus a support-safe inspection restore point
- Telegram voice-turn derivation gated by concierge lifecycle truth plus a support-safe inspection restore point
- Cipher continuity derivation that preserves bounded persona and spoken-manner markers plus a support-safe inspection restore point
- website-specialist harness derivation that composes concierge activation truth, Telegram continuity, Cipher continuity, and routing provenance into one operator-facing restore point
- design-teaching and research derivation that composes website-specialist harness with bounded lesson summaries and research provenance
- taste-adaptation memory boundary derivation that composes S05 truth with preference, feedback, behavior-signal, and precedence helpers
- provenance disclosure formatting for local, hybrid, external, and fallback-refused paths
- feedback promotion decisions with behavioral shaping
- scope-aware explicit feedback selection
- behavioral evidence summarization for:
  - repair
  - non-adoption
  - reversion
  - accepted-without-edit
- compact promotion-audit formatting for scripts and future UI/reporting
- first Node-side atomic persistence seam for small runtime state files
- first Node-side schema-validated record writers for:
  - truth surface
  - promotion decision record
  - routing provenance event

## Verification
Run:
- `python tools/validate_schemas.py`
- `python -c "import runpy; runpy.run_path('tests/test_runtime_types.py', run_name='__main__')"`
- `python -m unittest tests.test_telegram_voice_loop`
- `python tools/inspect_telegram_voice_loop.py`
- `python tools/runtime_scenarios.py`
- `cd packages/node-runtime && npm test`

## S05 design-teaching and research seam
S05 adds a dedicated design-teaching and current-reference research seam on top of the canonical S04 website-specialist harness:
- `runtime_types.design_teaching_research.derive_design_teaching_research_record(...)`
- `tools/inspect_design_teaching_research.py`
- `tests/test_design_teaching_research.py`
- `schemas/examples/design-teaching-research-record.*.example.json`

That seam shows whether Cipher can teach the design reasoning from canonical S04 website-specialist truth, disclose bounded hybrid research support honestly, and stay anti-slop without pretending a live browser/runtime exists.
Use S04 when the operator question is about website-specialist route honesty and execution state; use S05 when the question is about teaching posture, research provenance/freshness/disclosure, and support-safe explanation layered on top of that S04 truth.

The S05 proof is intentionally support-safe:
- it exposes lesson summaries, anti-slop rationale, provenance mode, freshness, and disclosure text
- it does **not** expose raw transcripts, private memory, or raw current-reference/reference dumps
- it does **not** claim that a live browsing or production website runtime is wired in this repo

Recommended S05 verification commands:
- `python -m unittest tests.test_design_teaching_research`
- `python tools/inspect_design_teaching_research.py`
- `python tools/validate_schemas.py`

## S06 taste adaptation and memory boundary loop
S06 adds a dedicated taste-adaptation memory boundary seam that composes canonical S05 design-teaching/research truth with existing preference, feedback, behavior-signal, and precedence helpers:
- `runtime_types.taste_adaptation_memory_boundary.derive_taste_adaptation_record(...)`
- `tools/inspect_taste_adaptation_memory_boundary.py`
- `tests/test_taste_adaptation_memory_boundary.py`
- `schemas/examples/taste-adaptation-record.*.example.json`

That seam exposes active taste signals, suppressed taste signals with explicit reasons, preserved decisions versus changed decisions, and spec-precedence outcomes on top of canonical S05 records. It enables Cipher to adapt to owner taste and preserved decisions without overriding the active spec, laundering hybrid/external wins into owner memory, or becoming creepy.

The S06 implementation is support-safe and memory-bounded:
- it summarizes signals and decisions with suppression/provenance/precedence metadata
- it excludes raw transcripts, raw references, intimate profile memory, or alternate storage models
- it preserves spec precedence and project intent over learned taste when conflicts exist

Recommended S06 verification commands:
- `python -m unittest tests.test_taste_adaptation_memory_boundary`
- `python tools/inspect_taste_adaptation_memory_boundary.py`
- `python tools/validate_schemas.py`

## Telegram voice, Cipher continuity, and website-specialist inspection seams
S02 adds a support-safe Telegram voice-loop contract seam backed by schemas, parser loaders, and one authoritative restore point:
- `runtime_types.telegram_voice_loop.derive_telegram_voice_turn(...)`
- `tools/inspect_telegram_voice_loop.py`
- `tests/test_telegram_voice_loop.py`
- `schemas/examples/telegram-voice-turn.*.example.json`

That seam proves blocked, activation-ready, and continuity-carryover Telegram voice scenarios without exposing raw transcript or private-memory detail.
It intentionally does **not** claim live Telegram Bot API transport wiring yet; this repo currently proves the contract surface and restore-point behavior only.

S03 layers a separate support-safe Cipher continuity seam on top of that factual S02 voice/session seam:
- `runtime_types.cipher_continuity.derive_cipher_continuity(...)`
- `tools/inspect_cipher_continuity.py`
- `tests/test_cipher_continuity.py`
- `schemas/examples/cipher-continuity-record.*.example.json`

That seam composes `TruthSurface` persona/policy inputs with canonical `TelegramVoiceTurnRecord` state to show whether Cipher remains activation-ready, in bounded cross-surface carryover, or under drift guard.
Use S02 to inspect what happened in the Telegram voice/session flow; use S03 to inspect whether the resulting text-and-voice identity still presents one governed Cipher continuity surface.

S04 adds a website-specialist execution seam that composes the earlier activation, voice/session, continuity, and routing truth into one operator-facing honesty surface:
- `runtime_types.website_specialist_harness.derive_website_specialist_harness_record(...)`
- `tools/inspect_website_specialist_harness.py`
- `tests/test_website_specialist_harness.py`
- `schemas/examples/website-specialist-harness-record.local-success.example.json`
- `schemas/examples/website-specialist-harness-record.hybrid-escalation.example.json`

That seam shows whether a website request stayed local, escalated through bounded hybrid help, or refused external fallback while preserving bounded continuity refs and persona markers.
Use S04 when the operator question is about route honesty and composed website-specialist execution state.
It intentionally does **not** claim that a live browser automation loop or production website execution runtime is fully wired in this repo yet; the current proof is the contract seam, examples, restore-point CLI, and pinned tests.

## Public-repo boundary
This repo should stay public-safe.
Do not add:
- secrets or credentials
- private tenant/user data
- raw sensitive transcripts
- `.gsd/` working state
- local browser/session artifacts

## Status
This is an active contract/prototype repo, not a finished runtime product. The goal is to keep the truth surface explicit, testable, and portable while the wider KR8TIV stack evolves.
