# Cipher Runtime Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the next executable Cipher runtime core step so the repo can assemble bounded truth, apply precedence, decide route/disclosure/refusal behavior, and evaluate provenance-aware learning in one inspectable flow.

**Architecture:** Extend the existing `runtime_types/` package instead of inventing a parallel runtime. Tighten the top-level truth contract, add a dedicated route-decision seam, enrich promotion lifecycle metadata, and make `runtime_step.py` orchestrate those focused helpers. Verify the result with schema checks, targeted unit tests, and a small multi-scenario runtime harness.

**Tech Stack:** Python 3, `TypedDict`, `Literal`, JSON Schema in `schemas/`, repo-local schema validator in `tools/validate_schemas.py`, pytest-style test layout.

---

### Task 1: Tighten the top-level truth contract

**Files:**
- Modify: `runtime_types/contracts.py`
- Modify: `runtime_types/__init__.py`
- Test: `tests/runtime_types/test_contracts.py`
- Modify/Create as needed: `schemas/*.schema.json`
- Modify/Create as needed: `schemas/examples/*.example.json`

**Step 1: Write the failing contract tests**

Create `tests/runtime_types/test_contracts.py` with tests that assert the runtime contract can represent:
- route capability context
- refusal constraints
- optional evaluation state
- optional conflict ledger
- richer lifecycle fields for durable preference/promotion review

Example skeleton:

```python
from runtime_types.contracts import TruthSurface


def test_truth_surface_supports_route_capability_and_refusal_context() -> None:
    payload: TruthSurface = {
        "active_spec": {"resolved_rules": {}},
        "active_policy": {},
        "current_task": {},
        "persona_anchor": {},
        "routing_policy": {},
        "fallback_policy": {},
        "critique_policy": {},
        "revision_budget": {},
        "active_project_preferences": [],
        "active_owner_preferences": [],
        "recent_explicit_feedback": [],
        "recent_behavior_signals": [],
        "disclosure_state": {},
        "route_capabilities": {"supports_local": True},
        "refusal_constraints": {"privacy_locked": True},
    }
    assert payload["route_capabilities"]["supports_local"] is True
```

**Step 2: Run the focused test to see it fail**

Run:

```bash
pytest tests/runtime_types/test_contracts.py -q
```

Expected: FAIL because the added keys/types do not exist yet.

**Step 3: Tighten `runtime_types/contracts.py` minimally**

Add or refine typed structures for:
- route capabilities
- refusal constraints
- evaluation state
- conflict ledger
- lifecycle/review metadata for promoted preferences or decisions

Prefer small `TypedDict` helpers over more `dict[str, object]`.

**Step 4: Export new types in `runtime_types/__init__.py`**

Add any new typed helpers to the public exports so downstream modules and tests import from one place.

**Step 5: Add or update schema coverage**

If the top-level truth surface schema or adjacent schemas need extending, update the matching schema/example files under `schemas/` and `schemas/examples/` so the new fields are represented explicitly.

**Step 6: Re-run contract tests**

Run:

```bash
pytest tests/runtime_types/test_contracts.py -q
```

Expected: PASS.

**Step 7: Re-run schema validation**

Run:

```bash
python tools/validate_schemas.py
```

Expected: PASS, with checked schema/example counts printed.

**Step 8: Commit**

```bash
git add runtime_types/contracts.py runtime_types/__init__.py tests/runtime_types/test_contracts.py schemas tools/validate_schemas.py
git commit -m "feat: tighten cipher runtime truth contracts"
```

---

### Task 2: Add explicit route decision and refusal handling

**Files:**
- Create: `runtime_types/routing.py`
- Modify: `runtime_types/contracts.py`
- Modify: `runtime_types/__init__.py`
- Test: `tests/runtime_types/test_routing.py`

**Step 1: Write failing routing tests**

Create `tests/runtime_types/test_routing.py` for these cases:
- local task stays local
- privacy-restricted task refuses fallback
- hybrid-capable task uses hybrid and requires disclosure
- external route marks learned effect appropriately

Example skeleton:

```python
from runtime_types.routing import decide_route


def test_privacy_locked_task_refuses_fallback() -> None:
    decision = decide_route(
        current_task={"task_class": "sensitive/private drafting"},
        fallback_policy={"allow_external": True},
        refusal_constraints={"privacy_locked": True},
        route_capabilities={"supports_local": True, "supports_hybrid": True},
    )
    assert decision["fallback_refused"] is True
    assert decision["mode"] == "local"
    assert "privacy" in decision["route_reason"].lower()
```

**Step 2: Run the routing tests to verify failure**

Run:

```bash
pytest tests/runtime_types/test_routing.py -q
```

Expected: FAIL because the routing module does not exist yet.

**Step 3: Implement `runtime_types/routing.py`**

Create a focused route-decision helper that returns one structured route result with:
- mode
- route reason
- fallback used
- fallback refused
- learned effect allowed
- optional refusal category / disclosure-required signal if useful

Keep the first implementation simple and rule-based.

**Step 4: Add any supporting contract types**

If route decision needs its own result type in `contracts.py`, add it there and export it.

**Step 5: Re-run routing tests**

Run:

```bash
pytest tests/runtime_types/test_routing.py -q
```

Expected: PASS.

**Step 6: Commit**

```bash
git add runtime_types/routing.py runtime_types/contracts.py runtime_types/__init__.py tests/runtime_types/test_routing.py
git commit -m "feat: add cipher route decision core"
```

---

### Task 3: Extend precedence beyond simple rule lookup

**Files:**
- Modify: `runtime_types/precedence.py`
- Test: `tests/runtime_types/test_precedence.py`

**Step 1: Write failing precedence tests**

Add tests for:
- active spec beats explicit feedback and preferences
- explicit feedback beats stored preference
- contradicted/paused preferences are ignored
- clarification-needed or gate state blocks lower-precedence defaulting when present

Example skeleton:

```python
from runtime_types.precedence import resolve_precedence


def test_active_spec_beats_feedback_and_preferences() -> None:
    truth = {
        "active_spec": {"resolved_rules": {"tone": "minimal"}},
        "active_policy": {},
        "current_task": {},
        "persona_anchor": {},
        "routing_policy": {},
        "fallback_policy": {},
        "critique_policy": {},
        "revision_budget": {},
        "active_project_preferences": [{"rule": "tone: maximal", "conflict_status": "active", "preference_id": "p1", "scope": "project", "confidence": 0.7, "evidence_count": 2, "last_confirmed_at": "2026-03-20T00:00:00Z", "origin_feedback_ids": ["f1"], "provenance_level": "local-proven"}],
        "active_owner_preferences": [],
        "recent_explicit_feedback": [],
        "recent_behavior_signals": [],
        "disclosure_state": {},
    }
    result = resolve_precedence("tone", truth)
    assert result["winner_source"] == "active_spec"
```

**Step 2: Run the precedence tests**

Run:

```bash
pytest tests/runtime_types/test_precedence.py -q
```

Expected: FAIL for the new gating/clarification cases.

**Step 3: Extend `runtime_types/precedence.py` minimally**

Keep the existing structure, but add support for:
- gate/clarification-aware blocking states
- more explicit reason text for blocked lower-precedence fallback
- optionally a small field in `ResolutionResult` for gate state if needed

Avoid rewriting the whole module.

**Step 4: Re-run precedence tests**

Run:

```bash
pytest tests/runtime_types/test_precedence.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/precedence.py tests/runtime_types/test_precedence.py
git commit -m "feat: extend cipher precedence resolution"
```

---

### Task 4: Enrich promotion lifecycle and rejection reasons

**Files:**
- Modify: `runtime_types/promotion.py`
- Modify: `runtime_types/contracts.py`
- Test: `tests/runtime_types/test_promotion.py`

**Step 1: Write failing promotion tests**

Add tests for:
- one-off feedback stays local-only
- repeated project feedback promotes project-wide
- cross-project or explicit durable feedback promotes owner-wide
- unsafe feedback rejects with explicit safety reason
- external-only success raises provenance warning and optional review requirement

**Step 2: Run the promotion tests**

Run:

```bash
pytest tests/runtime_types/test_promotion.py -q
```

Expected: FAIL for the new lifecycle/review expectations.

**Step 3: Extend promotion result shape**

Add small result fields such as:
- `review_required`
- `rejection_category`
- `promotion_scope` if useful

Prefer extending `PromotionEvaluationResult` over inventing a parallel result type.

**Step 4: Update implementation minimally**

Keep the current repeat-count logic, but enrich the result so callers can distinguish:
- rejected for safety
- rejected for weak evidence
- local-only pending more evidence
- promotable but provenance-sensitive

**Step 5: Re-run promotion tests**

Run:

```bash
pytest tests/runtime_types/test_promotion.py -q
```

Expected: PASS.

**Step 6: Commit**

```bash
git add runtime_types/promotion.py runtime_types/contracts.py tests/runtime_types/test_promotion.py
git commit -m "feat: enrich cipher promotion lifecycle"
```

---

### Task 5: Make runtime_step the real orchestration seam

**Files:**
- Modify: `runtime_types/runtime_step.py`
- Modify: `runtime_types/disclosure.py`
- Modify: `runtime_types/__init__.py`
- Test: `tests/runtime_types/test_runtime_step.py`

**Step 1: Write failing orchestration tests**

Create `tests/runtime_types/test_runtime_step.py` covering:
- runtime step returns precedence + route + disclosure
- promotion result is included when feedback matches
- refusal/disclosure stay consistent with route decision
- a contradicted preference does not win when spec is active

**Step 2: Run the orchestration tests**

Run:

```bash
pytest tests/runtime_types/test_runtime_step.py -q
```

Expected: FAIL because `runtime_step.py` does not yet orchestrate route decision fully.

**Step 3: Refactor `runtime_types/runtime_step.py`**

Make it orchestrate, not decide internally:
- precedence from `precedence.py`
- route from `routing.py`
- disclosure from `disclosure.py`
- promotion from `promotion.py`

The output should clearly expose all major sub-results in one inspectable object.

**Step 4: Keep disclosure formatting honest and compact**

Only adjust `runtime_types/disclosure.py` if needed to align with the new route decision result. Do not over-style the text.

**Step 5: Re-run orchestration tests**

Run:

```bash
pytest tests/runtime_types/test_runtime_step.py -q
```

Expected: PASS.

**Step 6: Commit**

```bash
git add runtime_types/runtime_step.py runtime_types/disclosure.py runtime_types/__init__.py tests/runtime_types/test_runtime_step.py
git commit -m "feat: compose cipher runtime step orchestration"
```

---

### Task 6: Add schema examples and an end-to-end harness

**Files:**
- Modify/Create: `schemas/examples/*.example.json`
- Modify: `runtime_types/schema_validation.py`
- Modify/Create: `tools/validate_schemas.py`
- Create/Modify: `tools/` runtime harness script (use the existing harness location if already present)
- Test: `tests/runtime_types/test_harness_scenarios.py`

**Step 1: Write failing harness tests**

Add a scenario-based test module that exercises at least these cases:
- routine local path
- privacy-locked fallback refusal
- hybrid route with explicit disclosure
- one-off local-only feedback
- repeated feedback promotion
- unsafe feedback rejection

If an existing harness script already exists, test through that seam rather than inventing another runner.

**Step 2: Run the scenario tests**

Run:

```bash
pytest tests/runtime_types/test_harness_scenarios.py -q
```

Expected: FAIL until the harness and scenarios are wired.

**Step 3: Add or update schema examples**

Create example JSON payloads for any new route/promotion/truth-surface structures so schema validation continues to prove something meaningful.

**Step 4: Implement the harness**

Create or extend one CLI/harness entrypoint that prints compact pass/fail summaries for the representative scenarios.

**Step 5: Run the schema validator**

Run:

```bash
python tools/validate_schemas.py
```

Expected: PASS.

**Step 6: Run the scenario tests**

Run:

```bash
pytest tests/runtime_types/test_harness_scenarios.py -q
```

Expected: PASS.

**Step 7: Run the whole targeted runtime suite**

Run:

```bash
pytest tests/runtime_types -q
```

Expected: PASS.

**Step 8: Run the harness manually**

Run:

```bash
python tools/validate_schemas.py
python tools/run_runtime_harness.py
```

Expected: both commands PASS, and the harness prints scenario-level outcomes with route/disclosure/promotion details.

**Step 9: Commit**

```bash
git add schemas runtime_types tools tests/runtime_types
git commit -m "test: add cipher runtime scenario harness"
```

---

### Task 7: Final verification and docs alignment

**Files:**
- Modify: `docs/plans/2026-03-20-cipher-runtime-core-design.md` if implementation drift needs documenting
- Modify: `docs/plans/2026-03-20-cipher-runtime-core.md` if progress notes are useful
- Modify if needed: `.gsd/PROJECT.md`

**Step 1: Run the full verification set**

Run:

```bash
python tools/validate_schemas.py
pytest tests/runtime_types -q
python tools/run_runtime_harness.py
```

Expected: all PASS.

**Step 2: Inspect outputs for honesty**

Confirm the runtime still does all of these:
- does not hide hybrid/external contribution
- does not promote unsafe feedback
- does not let stale preference beat active spec
- does not treat refusal as a silent fallback

**Step 3: Update docs only if needed**

If implementation introduced a meaningful change from the design doc, update the design doc succinctly. Do not pad.

**Step 4: Commit**

```bash
git add docs/plans .gsd/PROJECT.md
git commit -m "docs: align cipher runtime core docs with implementation"
```

---

## Verification checklist

### Observable truths
- Runtime truth assembly supports the fields needed for route, refusal, evaluation, and learning decisions.
- Precedence is deterministic and inspectable.
- Route decisions can express local, hybrid, external, and refusal behavior honestly.
- Disclosure matches route behavior.
- Promotion decisions preserve safety and provenance concerns.
- Representative scenarios pass in one harness.

### Commands

```bash
python tools/validate_schemas.py
pytest tests/runtime_types -q
python tools/run_runtime_harness.py
```

### Anti-patterns to reject during implementation
- adding a second top-level truth model parallel to `TruthSurface`
- burying route logic inside disclosure formatting
- silently coercing malformed trust-critical inputs
- adding persistence/database work in this milestone
- writing another high-level contract doc instead of finishing the executable runtime seam
