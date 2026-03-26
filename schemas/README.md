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
- `promotion-ledger-event.schema.json`
- `concierge-claim-lifecycle.schema.json`
- `concierge-setup-guidance.schema.json`
- `telegram-voice-transcript.schema.json`
- `telegram-voice-reply.schema.json`
- `telegram-voice-continuity.schema.json`
- `telegram-voice-turn.schema.json`
- `cipher-persona-anchor.schema.json`
- `cipher-voice-expression.schema.json`
- `cipher-continuity-record.schema.json`
- `website-specialist-request.schema.json`
- `website-specialist-execution.schema.json`
- `website-specialist-harness-record.schema.json`

## Included examples
- `examples/truth-surface.example.json`
- `examples/feedback-ledger-entry.example.json`
- `examples/behavior-signal-entry.example.json`
- `examples/preference-record.example.json`
- `examples/routing-provenance-event.example.json`
- `examples/promotion-decision-record.example.json`
- `examples/promotion-ledger-event.example.json`
- `examples/concierge-claim-lifecycle.claimed-awaiting-setup.example.json`
- `examples/concierge-claim-lifecycle.blocked-manual-checkpoint.example.json`
- `examples/concierge-claim-lifecycle.activation-ready.example.json`
- `examples/concierge-setup-guidance.awaiting-device-setup.example.json`
- `examples/concierge-setup-guidance.blocked-support-followup.example.json`
- `examples/telegram-voice-turn.blocked.example.json`
- `examples/telegram-voice-turn.activation-ready.example.json`
- `examples/telegram-voice-turn.continuity-carryover.example.json`
- `examples/cipher-continuity-record.activation-ready.example.json`
- `examples/cipher-continuity-record.carryover.example.json`
- `examples/cipher-continuity-record.drift-guard.example.json`
- `examples/website-specialist-harness-record.local-success.example.json`
- `examples/website-specialist-harness-record.hybrid-escalation.example.json`

## Design rules
- Governance-critical fields are required.
- Bounded states use explicit enums.
- Schemas default to `additionalProperties: false`.
- The package is neutral and should remain portable across future runtimes.
- Concierge onboarding examples under `schemas/examples/` are the authoritative support-safe fixtures for claimed-awaiting-setup, blocked/manual-checkpoint, activation-ready, and plain-language setup-guidance states.
- Telegram voice-loop examples under `schemas/examples/` are the authoritative support-safe fixtures for blocked, activation-ready, and continuity-carryover voice turns; they expose summaries only and must not be extended with raw transcript or private-memory detail.
- Cipher continuity examples under `schemas/examples/` are the authoritative support-safe fixtures for activation-ready, carryover, and drift-guard continuity states; they carry bounded persona / spoken-manner markers rather than transcript or hidden memory payloads.
- Website-specialist harness examples under `schemas/examples/` are the authoritative support-safe fixtures for local-success and hybrid-escalation website execution truth; they expose route honesty, disclosure state, and bounded continuity refs without claiming live website automation already exists.

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

## S04 website-specialist seam
S04 adds a dedicated website-specialist contract family on top of the earlier onboarding, Telegram voice, Cipher continuity, and routing seams:
- `website-specialist-request.schema.json`
- `website-specialist-execution.schema.json`
- `website-specialist-harness-record.schema.json`
- `examples/website-specialist-harness-record.local-success.example.json`
- `examples/website-specialist-harness-record.hybrid-escalation.example.json`

Those records are intentionally support-safe and local-first:
- they expose route mode, disclosure level/text, specialist task state, fallback-refused state, bounded continuity refs, and persona markers
- they do **not** embed transcripts, private memory, or hidden browser/session payloads
- they document whether work stayed local or needed bounded hybrid help without overstating that a live website runtime is already wired

Future runtimes should inspect these S04 schemas when the question is about operator-visible website route honesty and composed continuity truth, while still using the S02/S03 schemas for the lower-level voice/session and identity seams.

## S05 design-teaching and research seam
S05 adds a dedicated support-safe contract family on top of the canonical S04 website-specialist harness seam:
- `design-teaching-summary.schema.json`
- `design-research-summary.schema.json`
- `design-teaching-research-record.schema.json`
- `examples/design-teaching-research-record.local-teaching.example.json`
- `examples/design-teaching-research-record.hybrid-research.example.json`
- `examples/design-teaching-research-record.blocked.example.json`

Those records are intentionally composed rather than flattened:
- the canonical S04 `website-specialist-harness-record` remains nested under `harness`
- S05 adds one bounded `teaching` subrecord and one bounded `research` subrecord
- the seam exposes teaching status, research status, provenance mode, freshness, disclosure, anti-slop rationale, and support-safe summaries
- it does **not** embed raw transcripts, private memory, raw current-reference dumps, or claims that live browsing/runtime execution occurred

Future runtimes should inspect S04 schemas when the question is about route honesty and website-specialist execution truth, and inspect S05 schemas when the question is about design-teaching posture, bounded research provenance, and anti-slop explanation layered on top of that S04 truth.

## S06 taste adaptation and memory boundary seam
S06 adds a dedicated support-safe contract family on top of the canonical S05 design-teaching-research seam:
- `taste-signal-summary.schema.json`
- `adaptation-decision-summary.schema.json`
- `spec-precedence-summary.schema.json`
- `taste-adaptation-record.schema.json`
- `examples/taste-adaptation-record.spec-suppressed.example.json`
- `examples/taste-adaptation-record.preserved-decisions.example.json`
- `examples/taste-adaptation-record.hybrid-guarded.example.json`

Those records are intentionally composed rather than standalone:
- the canonical S05 `design-teaching-research-record` remains nested under `design_teaching_research`
- S06 adds bounded `active_taste_signals`, `suppressed_taste_signals`, `preserved_decisions`, `changed_decisions`, and `precedence_summaries` arrays
- the seam exposes active/suppressed taste signals with reasons, preserved vs changed decisions, precedence winners, and support-safe summaries
- it does **not** embed raw feedback text, transcripts, private memory, raw reference dumps, or intimate owner profile fields

The S06 seam enables Cipher to adapt to owner taste and preserved decisions while:
- preserving active spec and project intent as higher priority than learned taste
- keeping conflicting learned signals visible as suppressed with explicit reasons
- preventing hybrid/external wins from laundering into owner memory without local confirmation
- maintaining anti-creepy boundaries and support-safe summaries

Future runtimes should inspect S05 schemas when the question is about design-teaching and research truth, and inspect S06 schemas when the question is about taste adaptation, memory-boundary guarding, and precedence outcomes layered on top of that S05 truth.

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
