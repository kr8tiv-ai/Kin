# Provenance Disclosure Formatter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-pass formatter that turns routing/provenance events into stable disclosure text and disclosure metadata.

**Architecture:** Keep the formatter narrow and deterministic. Accept a `RoutingProvenanceEvent`, derive a disclosure level, and return a structured result with plain user-facing text. Avoid UI assumptions, persistence, or policy engines.

**Tech Stack:** Python standard library, existing `runtime_types` package.

---

### Task 1: Add disclosure formatter module skeleton

**Files:**
- Create: `runtime_types/disclosure.py`
- Modify: `runtime_types/__init__.py`
- Test: `python -c "from runtime_types.disclosure import format_provenance_disclosure"`

**Step 1: Write the failing checklist**

Add placeholders for:
- disclosure level type
- disclosure result type
- formatting function

**Step 2: Verify it fails**

Run: `python -c "from runtime_types.disclosure import format_provenance_disclosure"`
Expected: import fails because module does not exist.

**Step 3: Write minimal implementation**

Create `runtime_types/disclosure.py` with:
- disclosure level literals
- result type
- formatter skeleton

Update exports if useful.

**Step 4: Run test to verify it passes**

Run: `python -c "from runtime_types.disclosure import format_provenance_disclosure; print('disclosure import ok')"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/disclosure.py runtime_types/__init__.py
git commit -m "feat: add provenance disclosure formatter skeleton"
```

### Task 2: Implement first-pass disclosure rules

**Files:**
- Modify: `runtime_types/disclosure.py`
- Test: simple one-liners for local/hybrid/external/refused cases

**Step 1: Write the failing rule checklist**

Need support for:
- local -> minimal disclosure
- hybrid -> explicit disclosure
- external -> explicit disclosure
- fallback refused -> mention refusal when applicable

**Step 2: Verify it fails**

Run simple formatter calls.
Expected: incomplete or wrong behavior until rules are implemented.

**Step 3: Write minimal implementation**

Implement formatter returning:
- disclosure level
- disclosure text
- mention_external_help boolean

Use route mode and fallback fields to derive output.

**Step 4: Run test to verify it passes**

Run one-liners showing stable outputs for:
- local event
- hybrid event
- external event
- fallback-refused event

**Step 5: Commit**

```bash
git add runtime_types/disclosure.py
git commit -m "feat: implement provenance disclosure formatter"
```

### Task 3: Document disclosure behavior

**Files:**
- Modify: `runtime_types/README.md`
- Test: manual read-back

**Step 1: Write the failing docs checklist**

Add placeholders for:
- what disclosure formatter does
- how disclosure levels are used
- what remains out of scope

**Step 2: Verify it fails**

Read `runtime_types/README.md`.
Expected: no disclosure formatter docs yet.

**Step 3: Write minimal implementation**

Add a section documenting:
- disclosure levels
- when external help must be mentioned
- limits of the first pass

**Step 4: Run review to verify it passes**

Read README.
Expected: future contributors can understand the honesty layer quickly.

**Step 5: Commit**

```bash
git add runtime_types/README.md
git commit -m "docs: describe provenance disclosure formatter"
```

### Task 4: Record executable honesty behavior in project artifacts

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: read-back verification

**Step 1: Write the failing state checklist**

Need to record that the repo now has executable disclosure behavior in addition to validation and decision logic.

**Step 2: Verify it fails**

Read current artifacts.
Expected: no mention of disclosure formatter yet.

**Step 3: Write minimal implementation**

Update project/state to note the new disclosure formatter and point the next pass toward richer rule normalization or a small domain service.

**Step 4: Run review to verify it passes**

Read updated artifacts.
Expected: the next agent can see that user-facing honesty behavior has become executable.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md runtime_types/disclosure.py runtime_types/README.md runtime_types/__init__.py
git commit -m "docs: record executable disclosure behavior"
```
