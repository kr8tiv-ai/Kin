# Escalation Observability Schema

## Purpose
This artifact defines what a future implementation must expose when an escalation decision happens. It describes the minimum decision record, state vocabulary, and inspection surface needed to debug routing behavior honestly without implying that live telemetry or runtime instrumentation already exists in this repository.

Use this schema alongside `runtime/local-intelligence/hybrid-escalation-contract.md`. The hybrid escalation contract defines the governed fallback posture and allowed escalation states; this schema defines what a later implementation should make inspectable when those decisions are evaluated, retried, supported, required, or blocked.

## Decision Record Fields
A future implementation should expose a decision record for each material escalation or fallback decision. The record should be implementation-facing, compact, and truthful about what was actually observed.

Required fields should include at least:

- **escalation_reason:** the plain-language reason the decision moved away from a pure local path, or why it stayed blocked.
- **source_task_class:** the task class or routing category that produced the initial local-first expectation.
- **local_quality_posture:** the local assessment at decision time, such as sufficient, uncertain, degraded, or failed.
- **risk_posture:** the governing risk frame that affected the decision, especially when external impact, high-stakes output, or low-confidence behavior is involved.
- **privacy_posture:** the privacy stance at decision time, including whether escalation would preserve, weaken, or violate the expected handling boundary.
- **narration_summary:** the truthful summary that should explain to a future agent or reviewer how the decision was framed without theatrical language or hidden assumptions.
- **fallback_state:** the selected state from the allowed escalation vocabulary.
- **truthfulness_caveat:** the explicit caveat describing what is not proven, not instrumented, or not yet implemented.

A later implementation may add supporting fields such as timestamps, retry counters, policy references, correlation IDs, or bounded evidence snapshots, but those additions must not replace the required plain-language record.

## State Transitions
Decision records should describe transitions between the bounded escalation states defined by the hybrid escalation contract.

Expected transitions include:

- **local_only → local_retry** when local handling remains the governing posture and the failure appears recoverable under constrained retry rules.
- **local_only → local_with_frontier_support** when local handling remains primary but a bounded support action is justified after truthful narration.
- **local_only → frontier_required** when local handling is not sufficient because scope, reliability, risk, or quality demands stronger support.
- **local_only → escalation_blocked** when escalation is not allowed due to privacy, policy, missing proof, or governance limits.
- **local_retry → local_only** when the retry succeeds and the request returns to a stable local outcome.
- **local_retry → local_with_frontier_support** when retry does not restore confidence but bounded support remains allowed.
- **local_retry → frontier_required** when repeated local handling shows that stronger support is required.
- **local_retry → escalation_blocked** when new evidence shows that escalation is prohibited.
- **local_with_frontier_support → local_only** when bounded support is no longer needed and the local path resumes cleanly.
- **local_with_frontier_support → frontier_required** when bounded support is no longer sufficient.
- **local_with_frontier_support → escalation_blocked** when privacy, policy, or truthfulness constraints invalidate further escalation.
- **frontier_required → escalation_blocked** when the system determines that required support still cannot be used lawfully or honestly.

Future implementations should treat these transitions as governed state changes rather than opaque internal heuristics. If a transition cannot be explained in plain language, the decision record is incomplete.

## Redaction and Storage Constraints
Decision records must not casually log or persist sensitive user content, secrets, raw private payloads, credentials, tokens, protected personal data, or any material that would exceed the minimum inspection need.

A future implementation should avoid persisting:

- raw request bodies when a short reason summary is sufficient
- sensitive message content copied verbatim into observability records
- hidden chain-of-thought or speculative internal reasoning presented as durable telemetry
- secret values, access tokens, credentials, or private system prompts
- casual copies of frontier request or response payloads unless separately governed and explicitly justified

Where storage is necessary, later implementation should prefer redacted summaries, bounded metadata, and policy-aware retention. This schema defines inspection needs, not blanket permission to collect or keep everything.

## Inspection Expectations
Use `runtime/validation/validate-hybrid-routing-truth.md` to review whether this schema still describes inspectable decision fields truthfully without sliding into claims of live telemetry or implemented dashboards.

A future agent debugging a routing decision should be able to inspect enough context to answer the following questions:

- What task class was this request treated as?
- What local-first expectation applied at the start?
- What changed, failed, or remained uncertain?
- Which fallback_state was selected, and why?
- What quality, risk, and privacy posture drove the decision?
- What user-facing narration summary should have accompanied the decision?
- What truthfulness caveat prevented the system from overstating its proof level?
- Whether the outcome reflects a retry, bounded support, required escalation, or a blocked path

Inspection should support debugging and governance review without pretending that the repository already contains live telemetry, automated dashboards, or production escalation traces.
