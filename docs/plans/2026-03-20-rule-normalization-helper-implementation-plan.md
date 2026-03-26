# Rule Normalization Helper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a small rule normalization helper and use it in the precedence resolver to improve matching quality without introducing a larger rule engine.

**Architecture:** Keep the helper tiny and deterministic. Normalize rule keys and candidate strings into a common shape, then use exact or containment checks on normalized values. Avoid fuzzy libraries or hidden heuristics.

**Tech Stack:** Python standard library, existing `runtime_types` package.

---

### Task 1: Add normalization helper module

**Files:**
- Create: `runtime_types/rules.py`
- Modify: `runtime_types/__init__.py`
- Test: `python -c "from runtime_types.rules import normalize_rule_key, rule_matches"`

**Step 1: Write the failing checklist**

Add placeholders for:
- normalization function
- matching function

**Step 2: Verify it fails**

Run: `python -c "from runtime_types.rules import normalize_rule_key, rule_matches"`
Expected: import fails because module does not exist.

**Step 3: Write minimal implementation**

Create `runtime_types/rules.py` with:
- `normalize_rule_key(value: str) -> str`
- `rule_matches(key: str, candidate: str) -> bool`

**Step 4: Run test to verify it passes**

Run: `python -c "from runtime_types.rules import normalize_rule_key, rule_matches; print(normalize_rule_key('Routing Prefer-Local'))"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/rules.py runtime_types/__init__.py
git commit -m "feat: add rule normalization helper"
```

### Task 2: Use helper in precedence resolver

**Files:**
- Modify: `runtime_types/precedence.py`
- Test: simple one-liners proving improved matching

**Step 1: Write the failing rule checklist**

Need precedence matching to stop relying on raw substring checks.

**Step 2: Verify it fails**

Run a resolver call with slightly different separators/casing.
Expected: matching is brittle before helper integration.

**Step 3: Write minimal implementation**

Update precedence helper functions to use `normalize_rule_key` / `rule_matches` for:
- feedback target checks
- feedback text matching
- preference rule matching

**Step 4: Run test to verify it passes**

Run one-liners showing keys like:
- `routing.prefer_local`
- `Routing Prefer Local`
- `routing-prefer-local`

resolve consistently.

**Step 5: Commit**

```bash
git add runtime_types/precedence.py runtime_types/rules.py
git commit -m "feat: normalize precedence rule matching"
```

### Task 3: Document the helper and record state

**Files:**
- Modify: `runtime_types/README.md`
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: read-back verification

**Step 1: Write the failing docs checklist**

Add placeholders for:
- rule normalization purpose
- relationship to precedence resolver
- limits of the helper

**Step 2: Verify it fails**

Read current docs/state.
Expected: no mention of rule normalization yet.

**Step 3: Write minimal implementation**

Update docs/state to note:
- normalized rule lookup now exists
- next work can build on cleaner matching rather than crude substring checks

**Step 4: Run review to verify it passes**

Read updated files.
Expected: next agent can see this as a refinement layer, not a new architecture.

**Step 5: Commit**

```bash
git add runtime_types/README.md .gsd/PROJECT.md .gsd/STATE.md runtime_types/rules.py runtime_types/precedence.py runtime_types/__init__.py
git commit -m "docs: record normalized rule matching"
```
