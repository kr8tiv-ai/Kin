# Python Runtime Parser Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reusable Python validation core and typed parser functions that bridge JSON-like payloads into the validated runtime contract layer.

**Architecture:** Extract the recursive schema validation logic into a reusable Python module under `runtime_types/`, then make the CLI validator call that shared module and add typed loader functions in `runtime_types/parsers.py`. Keep everything dependency-free and behavior-light.

**Tech Stack:** Python standard library, existing schema files, existing TypedDict contracts.

---

### Task 1: Extract shared validation core

**Files:**
- Create: `runtime_types/schema_validation.py`
- Modify: `tools/validate_schemas.py`
- Test: `python tools/validate_schemas.py`

**Step 1: Write the failing expectation**

Document the split:
- shared reusable validation functions in `runtime_types/schema_validation.py`
- CLI wrapper remains in `tools/validate_schemas.py`

**Step 2: Verify it fails**

Run: `python tools/validate_schemas.py`
Expected: current validator works but has no reusable importable core.

**Step 3: Write minimal implementation**

Move or replicate the reusable parts into `runtime_types/schema_validation.py`:
- schema loading
- local ref resolution
- recursive validation
- example/schema validation helpers

Refactor `tools/validate_schemas.py` to call the shared module.

**Step 4: Run test to verify it passes**

Run: `python tools/validate_schemas.py`
Expected: PASS with the same behavior as before.

**Step 5: Commit**

```bash
git add runtime_types/schema_validation.py tools/validate_schemas.py
git commit -m "refactor: extract shared schema validation core"
```

### Task 2: Add typed parser/loader functions

**Files:**
- Create: `runtime_types/parsers.py`
- Modify: `runtime_types/__init__.py`
- Test: `python -c "from runtime_types.parsers import load_truth_surface"`

**Step 1: Write the failing parser checklist**

List the required functions:
- `load_truth_surface`
- `load_feedback_ledger_entry`
- `load_preference_record`
- `load_routing_provenance_event`
- `load_promotion_decision_record`

**Step 2: Verify it fails**

Run: `python -c "from runtime_types.parsers import load_truth_surface"`
Expected: import failure because parser module does not exist yet.

**Step 3: Write minimal implementation**

Create `runtime_types/parsers.py` with loader functions that:
- accept `object`
- validate against matching schema
- return typed payloads
- raise `ValueError` with readable messages on invalid input

Update `runtime_types/__init__.py` exports if useful.

**Step 4: Run test to verify it passes**

Run: `python -c "from runtime_types.parsers import load_truth_surface; print('parser import ok')"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/parsers.py runtime_types/__init__.py
git commit -m "feat: add typed runtime parser bridge"
```

### Task 3: Add a happy-path parser check using example payloads

**Files:**
- Modify: `runtime_types/parsers.py`
- Test: `python -c "..."` one-liner using example JSON

**Step 1: Write the failing parser-use expectation**

We need to prove the parsers can load a real example payload from disk.

**Step 2: Verify it fails if loaders are incomplete**

Run a one-liner that loads `schemas/examples/truth-surface.example.json` and passes it into `load_truth_surface`.
Expected: fail until parser wiring is correct.

**Step 3: Write minimal implementation**

Fix any path/schema-name/wrapper issues so the example payload loads successfully.

**Step 4: Run test to verify it passes**

Run a one-liner that:
- loads the example JSON
- calls `load_truth_surface`
- prints a known field

Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/parsers.py runtime_types/schema_validation.py tools/validate_schemas.py
git commit -m "test: verify example payloads load through parser bridge"
```

### Task 4: Document the bridge layer and update project state

**Files:**
- Modify: `runtime_types/README.md`
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: manual read-back plus `python tools/validate_schemas.py`

**Step 1: Write the failing docs checklist**

Add placeholders for:
- parser bridge purpose
- relationship to schemas and TypedDicts
- what still is not implemented

**Step 2: Verify it fails**

Read docs/state.
Expected: they mention schemas and types but not a usable parser bridge.

**Step 3: Write minimal implementation**

Update docs/state to note:
- shared schema validation core exists
- parser bridge exists
- next work should focus on service interfaces or domain modules using these contracts

**Step 4: Run review to verify it passes**

Run: `python tools/validate_schemas.py`
Read back updated docs.
Expected: validation still passes and documentation reflects the new layer.

**Step 5: Commit**

```bash
git add runtime_types/README.md .gsd/PROJECT.md .gsd/STATE.md runtime_types/schema_validation.py runtime_types/parsers.py tools/validate_schemas.py
git commit -m "docs: record Python runtime parser bridge"
```
