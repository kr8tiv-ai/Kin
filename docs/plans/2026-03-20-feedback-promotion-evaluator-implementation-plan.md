# Feedback Promotion Evaluator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-pass feedback promotion evaluator that applies the scoped-learning promotion rules without mutating state or introducing hidden heuristics.

**Architecture:** Keep the evaluator narrow and explicit. Accept one feedback entry plus simple contextual counters/flags, then return a structured promotion decision. Reuse existing runtime types where possible and avoid storage or persistence concerns.

**Tech Stack:** Python standard library, existing `runtime_types` package.

---

### Task 1: Add promotion decision types and evaluator module skeleton

**Files:**
- Create: `runtime_types/promotion.py`
- Modify: `runtime_types/__init__.py`
- Test: `python -c "from runtime_types.promotion import evaluate_feedback_promotion"`

**Step 1: Write the failing checklist**

Add placeholders for:
- decision type
- evaluator input flags
- main function

**Step 2: Verify it fails**

Run: `python -c "from runtime_types.promotion import evaluate_feedback_promotion"`
Expected: import fails because module does not exist.

**Step 3: Write minimal implementation**

Create `runtime_types/promotion.py` with:
- promotion decision literals
- a small result type
- evaluator function skeleton

Update exports if useful.

**Step 4: Run test to verify it passes**

Run: `python -c "from runtime_types.promotion import evaluate_feedback_promotion; print('promotion import ok')"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/promotion.py runtime_types/__init__.py
git commit -m "feat: add feedback promotion evaluator skeleton"
```

### Task 2: Implement first-pass promotion rules

**Files:**
- Modify: `runtime_types/promotion.py`
- Test: simple one-liners for local/project/owner/reject outcomes

**Step 1: Write the failing rule checklist**

Need support for:
- reject when unsafe
- owner when explicit durable or strong cross-project repeat
- project when repeated within project
- local-only otherwise
- provenance flag when evidence is external-only

**Step 2: Verify it fails**

Run simple evaluator calls.
Expected: incomplete or wrong behavior until rules are implemented.

**Step 3: Write minimal implementation**

Implement `evaluate_feedback_promotion(...)` with explicit parameters such as:
- `feedback`
- `project_repeat_count`
- `cross_project_repeat_count`
- `explicit_durable`
- `safe_to_learn`

Return a structured result with:
- decision
- reason
- provenance_warning

**Step 4: Run test to verify it passes**

Run a few one-liners proving:
- unsafe input rejects
- repeated project feedback promotes to project
- explicit durable promotes to owner

**Step 5: Commit**

```bash
git add runtime_types/promotion.py
git commit -m "feat: implement first-pass feedback promotion rules"
```

### Task 3: Document evaluator contract

**Files:**
- Modify: `runtime_types/README.md`
- Test: manual read-back

**Step 1: Write the failing docs checklist**

Add placeholders for:
- what the evaluator does
- which signals it uses
- what it does not do

**Step 2: Verify it fails**

Read `runtime_types/README.md`.
Expected: no promotion evaluator docs yet.

**Step 3: Write minimal implementation**

Add a short section documenting:
- first-pass promotion rules
- limits of the evaluator
- reminder that it does not mutate records or store decisions

**Step 4: Run review to verify it passes**

Read README.
Expected: next contributor can understand evaluator scope quickly.

**Step 5: Commit**

```bash
git add runtime_types/README.md
git commit -m "docs: describe feedback promotion evaluator"
```

### Task 4: Record executable learning behavior in project artifacts

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: read-back verification

**Step 1: Write the failing state checklist**

Need to record that the repo now has executable promotion behavior, not just precedence resolution.

**Step 2: Verify it fails**

Read current artifacts.
Expected: no mention of promotion evaluator yet.

**Step 3: Write minimal implementation**

Update project/state to note the new promotion evaluator and set the next pass toward a disclosure formatter or a richer rule lookup layer.

**Step 4: Run review to verify it passes**

Read updated artifacts.
Expected: the next agent can see that learning behavior has started becoming executable.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md runtime_types/promotion.py runtime_types/README.md runtime_types/__init__.py
git commit -m "docs: record executable promotion behavior"
```
