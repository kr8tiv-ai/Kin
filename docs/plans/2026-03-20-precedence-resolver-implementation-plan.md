# Precedence Resolver Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimal executable precedence resolver that applies the M003 ordering rules to validated runtime payloads.

**Architecture:** Keep the resolver narrow and deterministic. Accept a `TruthSurface`, inspect known layers in order, and return a structured resolution result. Do not mutate state or implement promotion/storage behavior.

**Tech Stack:** Python standard library, existing `runtime_types` package.

---

### Task 1: Add resolution result type and resolver module skeleton

**Files:**
- Create: `runtime_types/precedence.py`
- Modify: `runtime_types/__init__.py`
- Test: `python -c "from runtime_types.precedence import resolve_precedence"`

**Step 1: Write the failing checklist**

Add placeholders for:
- resolution result shape
- rule lookup helpers
- main resolver function

**Step 2: Verify it fails**

Run: `python -c "from runtime_types.precedence import resolve_precedence"`
Expected: import fails because module does not exist.

**Step 3: Write minimal implementation**

Create `runtime_types/precedence.py` with:
- a small result type
- helper(s) to inspect known sources
- `resolve_precedence(...)`

Update exports if useful.

**Step 4: Run test to verify it passes**

Run: `python -c "from runtime_types.precedence import resolve_precedence; print('precedence import ok')"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/precedence.py runtime_types/__init__.py
git commit -m "feat: add precedence resolver skeleton"
```

### Task 2: Implement first-pass resolution rules

**Files:**
- Modify: `runtime_types/precedence.py`
- Test: simple one-liner or helper call

**Step 1: Write the failing rule checklist**

Need support for this precedence order:
- active spec
- explicit current feedback
- project preference
- owner preference
- default

**Step 2: Verify it fails**

Run a simple resolver call against a constructed payload.
Expected: incorrect or incomplete resolution until logic is written.

**Step 3: Write minimal implementation**

Implement rule lookup using a simple convention:
- first read from `active_spec["resolved_rules"]` if present
- then scan `recent_explicit_feedback` for matching target/key hints
- then project preferences by normalized `rule`/key mapping
- then owner preferences
- finally default

Keep the first pass narrow and explicit rather than generic/clever.

**Step 4: Run test to verify it passes**

Run a one-liner or short script proving:
- a spec-level value wins over lower layers
- a default is returned when no layer matches

**Step 5: Commit**

```bash
git add runtime_types/precedence.py
git commit -m "feat: implement first-pass precedence rules"
```

### Task 3: Document resolver contract and caveats

**Files:**
- Modify: `runtime_types/README.md`
- Test: manual read-back

**Step 1: Write the failing docs checklist**

Add placeholders for:
- what precedence resolver does
- what key format it expects
- what it does not do

**Step 2: Verify it fails**

Read `runtime_types/README.md`.
Expected: no resolver documentation yet.

**Step 3: Write minimal implementation**

Add a short section documenting:
- precedence order
- expected `resolved_rules` convention for spec-level inputs
- limits of the first pass

**Step 4: Run review to verify it passes**

Read README.
Expected: future contributors can understand resolver scope quickly.

**Step 5: Commit**

```bash
git add runtime_types/README.md
git commit -m "docs: describe precedence resolver"
```

### Task 4: Record executable decision behavior in project artifacts

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: read-back verification

**Step 1: Write the failing state checklist**

Need to record that the repo now has executable precedence behavior, not only schemas/types/parsers.

**Step 2: Verify it fails**

Read current artifacts.
Expected: no mention of precedence resolver yet.

**Step 3: Write minimal implementation**

Update project/state to note the new precedence module and set the next pass toward a second executable behavior, likely feedback promotion evaluation or disclosure formatting.

**Step 4: Run review to verify it passes**

Read updated artifacts.
Expected: the next agent can see the move from contract to executable decision logic.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md runtime_types/precedence.py runtime_types/README.md runtime_types/__init__.py
git commit -m "docs: record executable precedence behavior"
```
