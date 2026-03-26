# Hybrid Escalation Contract

## Purpose
This artifact defines how frontier support can assist Cipher without replacing the local-first posture. It exists to make fallback assistance explicit, governed, and bounded rather than hidden behind vague claims of seamless intelligence.

The contract must remain compatible with Cipher's Telegram-first companion behavior, Mission Control governance, and premium website-builder identity. It defines the allowed support relationship between local handling and frontier help; it does not claim that a live runtime escalation stack is already wired in this repository.

Use this artifact alongside `runtime/local-intelligence/local-routing-contract.md`, `runtime/local-intelligence/escalation-observability-schema.md`, and `runtime/design-signals/reference-ingestion-contract.md`. The routing contract defines task-class defaults and the meaning of local-first selection; this contract defines the governed fallback posture when frontier assistance becomes relevant; the observability schema defines what a later implementation should expose for inspection when an escalation decision is made; the reference-ingestion contract defines how design-signal gathering stays bounded before it can become governed fallback context.

## Fallback Posture
Local-first remains the primary posture. Frontier support is secondary, conditional, and governed.

Frontier support may assist when local handling is weak, risky, or scope-constrained, but it must not quietly replace the local path as the default story. The system posture remains that local handling is the preferred first route where the routing contract says it should be.

Fallback must be framed as support behind the product promise, not as proof that the local layer is decorative. If escalation occurs, the narration and later implementation work must preserve that local handling was primary, evaluated, and either retried, supported, or blocked under explicit rules.

## Allowed Escalation States
The following states define the bounded escalation vocabulary for later slices.

- **local_only:** the request stays fully on the local path and does not call for frontier support.
- **local_retry:** the request remains local-first, but a constrained retry is justified because the local failure appears recoverable.
- **local_with_frontier_support:** the local path remains the governing posture, but frontier help assists a bounded part of the task after truthful narration.
- **frontier_required:** the request should not remain local-default because risk, scope, or reliability demands stronger support.
- **escalation_blocked:** escalation is not allowed because the request, policy, privacy framing, or proof level does not justify it.

These states are governance labels, not proof of a live runtime router. Later implementation may operationalize them, but this contract only defines the allowed decision surface.

## Escalation Guardrails
Escalation is prohibited when it would silently break the local-first promise, hide a privacy tradeoff, or imply live capabilities that are not actually present.

Explicit user awareness is required when escalation changes the privacy posture, changes the risk profile, or materially alters why the answer should be trusted. User awareness does not require theatrical wording, but it does require plain narration that the local path was insufficient or inappropriate for the request.

Narration must keep the following visible:

- whether the request began as local-first, local-preferred, or otherwise governed by the routing contract
- why local handling is being retried, supported, required to escalate, or blocked
- whether the deciding factor is quality, scope, risk, privacy, or governance
- that fallback support does not erase Mission Control boundaries or the local-first product posture

Escalation must also remain blocked when the system would otherwise overstate proof, such as implying telemetry-backed routing accuracy, live orchestration, or invisible reliability guarantees that have not been implemented.

## Review Boundaries
Later slices may add critique flows, ingestion, richer orchestration, or more concrete routing logic, but they must not break the following boundaries. Use `runtime/validation/validate-hybrid-routing-truth.md` as the standing review surface for checking that later changes preserve these rules rather than quietly softening them:

- local-first remains the primary posture where the routing contract says it is required or preferred
- frontier support remains governed fallback, not the quiet default behind local-facing language
- Mission Control governance remains in force for risky or externally impactful actions
- Telegram-first companion behavior and the premium website-builder identity remain intact
- contract language stays honest about proof level and does not claim live routing or telemetry unless those claims are separately validated

If later slices add richer machinery, they should refine these rules without weakening them.

## Non-Goals
This document does not claim live runtime routing.

This document does not claim telemetry-backed escalation decisions.

This document does not define vendor-specific model orchestration, infrastructure wiring, or deployment topology.

This document does not remove the need for truthful narration, validation work, or later implementation proof.
