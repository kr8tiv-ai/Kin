# Feedback Learning Runtime Design

> Drafted for M003-2cpdzh / S05

## Goal
Define how Cipher learns from feedback and changes over time while staying honest about local-first behavior, governed fallback, bounded ingestion, critique realism, and active-spec precedence.

## Design summary
Cipher should use a **scoped learning model** rather than flat memory. Feedback updates the current turn immediately, can persist for the current project when repeated or clearly relevant, and can promote to owner-level taste only when repeated across contexts or explicitly marked durable.

The runtime should expose a **single truth surface** that resolves conflicts before generation. It should contain current spec/policy, explicit recent feedback, bounded learned preferences, routing/fallback policy, critique/revision settings, and disclosure/provenance state. It should explicitly exclude secrets, full chat dumps, high-entropy corpora, and unsupported inferred preferences.

## Precedence ladder
When systems disagree, resolve in this order:

1. Active spec and policy
2. Explicit user feedback on the current unit
3. Bounded grounding and retrieval
4. Evaluation and critique gates
5. Governed fallback
6. Learned taste and local specialist defaults

## Learning layers

### 1. Turn layer
- Immediate corrections for the current response or revision loop
- Examples: “less glossy”, “teach more”, “don’t use this reference”, “keep this local if possible”
- Lifetime: current turn / current revision cycle

### 2. Project layer
- Preferences that should persist for the active project or milestone
- Promotion triggers:
  - repeated within the same project
  - explicitly stated as project-wide
  - validated through successful project outcomes
- Lifetime: project / milestone / slice-defined window

### 3. Owner layer
- Durable taste and workflow adaptation that can shape future work
- Promotion triggers:
  - repeated across projects
  - explicit user statement that it is a general preference
  - repeated successful outcomes showing stable preference
- Lifetime: durable until superseded or decayed

## Runtime objects

### Truth Surface
Minimum fields:
- active_spec
- active_policy
- current_task
- persona_anchor
- routing_policy
- fallback_policy
- critique_policy
- revision_budget
- active_project_preferences
- active_owner_preferences
- recent_explicit_feedback
- disclosure_state

### Feedback Ledger
Append-only entries with:
- feedback_text
- timestamp
- scope_requested
- target
- polarity
- source
- applied_to
- promotion_status
- provenance

### Preference Record
Normalized learned rule with:
- rule
- scope
- confidence
- evidence_count
- last_confirmed_at
- conflict_status
- origin_feedback_ids
- provenance_level

### Routing / Provenance Event
Per material generation/review step:
- provider
- model
- mode (local / hybrid / external)
- route_reason
- fallback_used
- fallback_refused
- learned_effect_allowed

### Promotion Decision Record
Whenever feedback becomes durable:
- promoted_rule
- source_feedback_ids
- destination_scope
- evidence_summary
- override_conditions
- decision_timestamp

## Mutation rules

### Immediate application
Explicit feedback affects the active task immediately.

### Promotion to project scope
Allowed when:
- repeated in the project
- strongly tied to current deliverable quality
- not contradicted by active spec

### Promotion to owner scope
Allowed when:
- repeated across projects
- explicitly marked as general preference
- backed by repeated validated success

### Rejection / decay
Demote or remove when:
- contradicted repeatedly
- superseded by explicit new preference
- only works under external fallback and is not locally realistic
- turns out to be project-specific rather than owner-specific

## Trust rules

### Disclosure
- Material external contribution must be disclosed
- Hybrid success that influenced learning should preserve provenance internally
- Local capability should never be overstated because an external route succeeded once

### Refusal
Do not learn or promote:
- secrets
- private traits unrelated to product usefulness
- cross-tenant patterns
- creepy or manipulative personalization
- policy-breaking requests

## Acceptance criteria
A reviewer should be able to verify:
- explicit feedback changes the current result
- repeated feedback changes future behavior in a traceable way
- one-off corrections do not permanently mutate the agent
- active spec overrides learned taste
- provenance remains visible when fallback influences learning
- local-first remains primary for routine work
- learned adaptation stays useful rather than creepy

## Next implementation step
Translate this design into implementation artifacts for:
- truth-surface schema
- feedback ledger schema
- promotion engine rules
- provenance event model
- acceptance and negative-test suite
