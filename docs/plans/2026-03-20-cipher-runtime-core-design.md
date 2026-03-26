# Cipher Runtime Core Design

**Date:** 2026-03-20
**Status:** Approved for planning
**Scope:** Next implementation-oriented milestone after M003

## Goal

Turn Cipher’s M003 contract surfaces into one executable runtime core that can assemble bounded truth, apply precedence, decide route/disclosure/refusal behavior, and evaluate scoped feedback promotion without overclaiming a fully wired production runtime.

## Why this is the next move

The repo already contains the right contract direction and a partial executable layer:

- JSON Schema contracts under `schemas/`
- typed runtime contracts in `runtime_types/contracts.py`
- a precedence resolver in `runtime_types/precedence.py`
- a promotion evaluator in `runtime_types/promotion.py`
- provenance disclosure formatting in `runtime_types/disclosure.py`
- a composed runtime-step service in `runtime_types/runtime_step.py`
- schema validation tooling in `tools/validate_schemas.py`

That means the next step is not more high-level spec writing. It is tightening and extending the existing runtime core until one full decision cycle is represented coherently in code.

## Recommended approach

### Chosen approach: thin vertical runtime loop

Build and verify one full inspectable runtime step:

1. assemble a canonical truth surface
2. apply deterministic precedence
3. decide route / fallback / refusal
4. generate honest provenance disclosure
5. evaluate whether feedback stays local, promotes, or is rejected
6. run several representative scenarios through one harness

### Alternatives considered

#### Foundation-first shared layer
Pros:
- cleaner abstractions
- easier future scaling

Cons:
- can delay proof that Cipher’s behavior actually works end-to-end
- risks building internal machinery without exposing integration problems

#### Web-quality vertical first
Pros:
- hits Cipher’s strongest differentiator quickly

Cons:
- can bypass the route/provenance/trust problems that M003 was meant to settle
- risks making website quality look live while runtime honesty is still thin

## Design

## 1. Canonical runtime truth object

The repo already has `TruthSurface` in `runtime_types/contracts.py`. It is the right anchor, but still too permissive and too incomplete.

### What to improve

- keep it as the single top-level runtime input contract
- make more of its nested fields explicitly typed instead of `dict[str, object]`
- add lifecycle and review fields needed by later promotion and route decisions
- preserve the principle that this object is bounded and excludes raw secrets, logs, and inspiration hoards

### Minimum fields that should remain central

- active spec / resolved rules
- active policy / privacy posture
- current task context
- persona anchor
- routing policy
- fallback policy
- critique policy
- revision budget
- project preferences
- owner preferences
- recent explicit feedback
- recent behavior signals
- disclosure state

### Additions to support the next runtime step cleanly

- route capability context
- refusal constraints
- clarification-needed flags
- optional evaluation state for pass / borderline / fail
- optional conflict ledger for contradicted preferences

This should stay in-memory and typed for now. No database work is needed in this milestone.

## 2. Deterministic precedence

The current `resolve_precedence()` function already encodes most of the intended winner order:

- active spec
- explicit feedback
- project preference
- owner preference
- default

That is a good base, but it is still narrower than the S05 contract.

### What to extend

Add explicit representation for:
- clarification / grounding before stylistic defaulting
- critique as a gate, not just another rule source
- refusal paths when a higher-order policy constraint blocks execution

### Important design rule

Precedence must stay deterministic and inspectable. The result should explain:
- which layer won
- which layers lost
- why
- whether any blocked or gated state prevented lower-precedence fallback

The existing `ResolutionResult` shape is close; it likely needs a small extension rather than replacement.

## 3. Route, fallback, and refusal result

Right now `RoutingProvenanceEvent` plus `format_provenance_disclosure()` cover provenance and user-facing disclosure, but route decision itself is still underrepresented.

### What to add

Introduce a dedicated route decision result that can represent:
- chosen mode (`local`, `hybrid`, `external`, or refused state)
- route reason
- whether fallback was used
- whether fallback was refused
- whether disclosure is required
- whether learned effect is allowed
- optional refusal reason category

### Why this matters

Cipher’s honesty depends on route choice and disclosure staying coupled. A later runtime should not be able to say “local-first” while quietly routing everything through external support.

## 4. Feedback promotion lifecycle

`evaluate_feedback_promotion()` is already a solid start. It handles:
- local-only
- project promotion
- owner promotion
- reject

It also respects:
- explicit durable intent
- repeat counts
- unsafe-to-learn rejection
- behavior signals
- provenance warning for external-only success

### What to add next

Add lifecycle richness to the contracts and promotion output:
- `review_required`
- `origin_context`
- optional `expires_at`
- optional `superseded_by`
- explicit distinction between “rejected for safety” and “rejected for weak evidence”

### Design rule

One-off feedback must remain cheap to apply for the current turn, but expensive to make durable.

## 5. Honest disclosure in Cipher’s voice

The current disclosure formatter is structurally correct but still generic. It should stay plain, but later refinement should preserve companion continuity so disclosure does not sound like unrelated system text.

### For this milestone

Keep disclosure functional and explicit:
- local path = concise confirmation
- hybrid path = explicit material assistance disclosure
- external path = explicit reliance disclosure
- refused fallback = plain refusal explanation

Do not over-optimize the style yet. Truth before polish.

## 6. Scenario harness

This milestone needs one command that proves the runtime core actually composes.

### Required scenarios

1. routine local task stays local
2. privacy-sensitive task refuses fallback
3. hybrid-capable task triggers explicit disclosure
4. one-off correction stays local-only
5. repeated correction promotes to project or owner scope
6. spec overrides stored taste
7. unsafe learning attempt gets rejected

### Output expectations

The harness should print:
- scenario name
- pass/fail
- route mode
- disclosure summary
- promotion decision
- key precedence winner

## 7. Error handling

Trust-critical runtime code should fail clearly.

### Treat these as structured failures

- malformed truth surface payload
- unsupported enum/state transitions
- preference records missing provenance
- promotion decisions missing supporting evidence context
- route decisions that contradict fallback/refusal state

The runtime core should not silently coerce these into “best effort” success.

## 8. What this milestone intentionally does not do

- no Telegram integration
- no real model provider wiring
- no persistent database
- no crawling or ingestion jobs
- no UI/dashboard
- no long-term memory layer

This keeps the milestone honest and small enough to finish.

## Implementation direction by existing file seams

### Existing files to extend

- `runtime_types/contracts.py`
  - strengthen typing around truth surface and route/promotion lifecycle objects
- `runtime_types/precedence.py`
  - extend precedence to capture more of the S05 contract semantics
- `runtime_types/promotion.py`
  - add richer lifecycle/result information
- `runtime_types/disclosure.py`
  - preserve honest disclosure behavior while keeping output compact
- `runtime_types/runtime_step.py`
  - make this the main orchestration seam for one runtime decision cycle
- `runtime_types/schema_validation.py`
  - ensure new schema/example files validate alongside the existing set
- `tools/validate_schemas.py`
  - no major redesign expected; should remain the main CLI verification entrypoint

### Likely new files

- a dedicated route-decision module under `runtime_types/`
- example payloads under `schemas/examples/` for any new/expanded schema contracts
- tests for precedence, route decisions, promotion, and integrated runtime-step scenarios
- a lightweight runtime harness script if one does not already exist in a suitable form

## Success criteria

This design is successful when the repo can demonstrate:

- one canonical top-level truth surface used by the runtime step
- precedence decisions that are deterministic and inspectable
- route/disclosure/refusal logic that is executable
- promotion logic that is provenance-aware and lifecycle-aware
- several representative scenarios passing from one harness entrypoint
- no path that silently converts hybrid or external success into fake local competence

## Risks

### Risk: overfitting the runtime step to current examples
Mitigation:
- keep result shapes generic and typed
- verify multiple scenarios, not one golden path

### Risk: duplicating logic across precedence, route, and promotion
Mitigation:
- make `runtime_step.py` orchestration-only
- keep decision logic in focused modules

### Risk: making the truth surface too loose again
Mitigation:
- keep adding typed nested structures instead of generic dictionaries where possible
- add schema/examples for new durable contracts

## Recommendation

Implement this as the next milestone using a TDD-style plan centered on the existing `runtime_types/` package. The plan should target the live seams already present rather than introducing a parallel runtime architecture.
