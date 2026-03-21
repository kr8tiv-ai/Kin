# Local Routing Contract

## Purpose
This artifact defines when Cipher should prefer the local model path, how local-first behavior should be interpreted across common task classes, and when escalation is allowed. It exists to make the local path a governed runtime contract rather than a vague architectural preference.

The contract must remain compatible with Cipher's Telegram-first companion behavior, Mission Control governance, and premium website-builder identity. It defines routing truth for future implementation work; it does not claim that a live wired model-routing stack already exists in this repository.

Use this artifact alongside `runtime/local-intelligence/local-quality-evaluation.md`, `runtime/local-intelligence/hybrid-escalation-contract.md`, and `runtime/validation/validate-local-intelligence-truth.md`. This routing contract defines default route selection and escalation posture by task class; the quality-evaluation contract defines how local output quality is judged before Cipher stays local, retries, asks a narrower question, or escalates; the hybrid escalation contract defines how frontier support may assist without replacing the local-first posture; the validation artifact checks that these claims remain truthful and internally consistent.

## Task Classes
The following task classes are the concrete routing buckets for this slice.

- **Casual companionship:** lightweight conversation, emotional check-ins, playful banter, low-stakes personal interaction, and general friend-like continuity work.
- **Lightweight planning:** simple next-step planning, short checklists, task breakdowns, and low-complexity organizational help.
- **Website critique:** critique of site structure, copy, aesthetics, hierarchy, conversion flow, and anti-slop quality for landing pages or product sites.
- **Web-structure ideation:** information architecture, page mapping, section planning, reference translation, and website concept generation before implementation.
- **Sensitive/private drafting:** private notes, sensitive drafts, personal reflection, secret-adjacent drafting, or content where locality/privacy is part of the user promise.
- **Broad research synthesis:** synthesis across many sources, trend aggregation, large-context comparisons, or tasks that depend on broad retrieval and dense summarization.
- **High-risk/computer-use reasoning:** reasoning that directly precedes risky browser or computer actions, permission-sensitive automation, or steps that may affect user systems or external accounts.

## Default Routing Rules
Each class has a default routing posture. The terms are intentionally narrow.

- **Local-first required:** the task should begin locally and should not escalate unless a defined failure mode or explicit escalation trigger is reached.
- **Local-first preferred:** the task should start locally in normal operation, but escalation is acceptable when quality or scope limits appear.
- **Local optional:** either path may be valid depending on surrounding context, but the choice must still respect Mission Control policy and user trust framing.
- **Local discouraged:** local handling may still contribute context or first-pass reasoning, but the final reasoning burden should not remain local by default.

Routing by class:

| Task class | Default route | Notes |
|---|---|---|
| Casual companionship | Local-first required | Protects continuity, privacy, and the sense of one continuous friend. |
| Lightweight planning | Local-first required | Should usually stay local unless complexity expands materially. |
| Website critique | Local-first preferred | Local critique should remain strong enough to support Cipher's premium web taste and anti-slop posture. |
| Web-structure ideation | Local-first preferred | Early ideation should usually stay local, with escalation reserved for clear quality failure or unusually complex scope. |
| Sensitive/private drafting | Local-first required | Privacy-sensitive drafting should default local unless the user knowingly accepts escalation. |
| Broad research synthesis | Local optional | Broad synthesis may exceed local context or retrieval quality; escalation may be the better fit. |
| High-risk/computer-use reasoning | Local discouraged | High-risk action reasoning needs stronger reliability and governance than local-default handling alone. |

## Local Failure Modes
Local handling should be treated as failed when one or more of these categories become materially visible in the output or reasoning process.

- **Low coherence:** the response loses structure, drifts, contradicts itself, or stops tracking the user's actual request.
- **Missing design specificity:** website or design guidance becomes generic, cliché, or too weak to support Cipher's premium website-builder identity.
- **Weak instruction retention:** the model drops constraints, forgets named references, loses tone or format requirements, or ignores prior user corrections.
- **Hallucinated certainty:** the model states uncertain claims too confidently, fabricates facts, or acts as if unverified reasoning is settled.
- **Unsafe action reasoning:** the model produces brittle or overconfident reasoning around computer use, permissions, or user-impacting operations.

These failure modes matter even when the answer is superficially fluent. Fluency alone is not evidence that local handling met the contract.

## Escalation Semantics
Escalation should remain governed, narrow, and truthfully narrated.

### Local retry allowed
A local retry is allowed when the task class remains local-first and the failure appears recoverable through constraint refresh, tighter prompting, shorter scope, or explicit reminder of design/taste requirements. A local retry is preferred before escalation when:

- the failure is primarily weak instruction retention
- the task is still bounded and low risk
- the user has not asked for broad research or high-risk action support
- privacy or continuity value is part of the point of staying local

### Frontier escalation allowed
Frontier escalation is allowed when at least one of these conditions is met:

- the local path has already failed in a meaningful way and a retry is unlikely to fix it
- the task class is broad research synthesis and the work needs larger context or richer synthesis
- the task involves high-risk/computer-use reasoning where stronger reasoning reliability is warranted
- the website/design task requires specificity, critique depth, or reference synthesis that the local path is not reaching
- the user knowingly prefers escalation after a truthful explanation of why local handling is weak

### User narration requirement
When escalation happens, Cipher should narrate it plainly. The narration should explain:

- that the local-first path was attempted, preferred, or considered
- why local handling is not meeting the contract for this request
- whether the reason is scope, quality, risk, or privacy tradeoff
- that escalation is support behind the local posture, not proof that the local path is fake

The narration should not imply a hidden seamless stack if no live routing implementation exists. Contract truth must stay separate from live integration truth.

## Non-Goals
This document does not claim that a live wired local-routing stack already exists.

This document does not define model vendor details, infrastructure wiring, or deployment topology.

This document does not override Mission Control safety and trust-ladder governance for browser or computer actions.

This document does not turn Cipher into a website-only specialist; the contract preserves the broader companion role while protecting the premium website-builder moat.
