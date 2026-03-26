# Python Schema Validation Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight Python harness that validates the schema package and example payloads without introducing external dependencies or a heavier toolchain.

**Architecture:** Implement a single self-contained Python script that reads schema JSON and example JSON, performs honest top-level structural checks, prints readable results, and exits non-zero on failure. Keep the validator narrow and explicit rather than pretending to be a full JSON Schema engine.

**Tech Stack:** Python standard library, JSON files, Markdown usage notes.

---

### Task 1: Add the validator script skeleton

**Files:**
- Create: `tools/validate_schemas.py`
- Test: manual read-back

**Step 1: Write the failing validator checklist**

Start the file with placeholders or comments for:
- schema discovery
- example discovery
- schema/example matching
- validation functions
- CLI main/exit code

**Step 2: Verify it fails**

Read repo state.
Expected: no validator script exists yet.

**Step 3: Write minimal implementation**

Create `tools/validate_schemas.py` with:
- file/path constants
- JSON loading helper
- entry-point function

**Step 4: Run review to verify it passes**

Read `tools/validate_schemas.py`.
Expected: structure is clear and repo-local.

**Step 5: Commit**

```bash
git add tools/validate_schemas.py
git commit -m "feat: add schema validation harness skeleton"
```

### Task 2: Implement top-level validation logic

**Files:**
- Modify: `tools/validate_schemas.py`
- Test: run `python tools/validate_schemas.py`

**Step 1: Write the failing test expectation**

Document expected checks:
- schemas parse
- examples parse
- example names map to schema names
- required top-level fields exist
- enum-backed example values are allowed
- extra top-level fields are rejected when strict

**Step 2: Verify it fails**

Run: `python tools/validate_schemas.py`
Expected: fail or no-op because validation logic is not complete yet.

**Step 3: Write minimal implementation**

Implement:
- schema discovery from `schemas/*.schema.json`
- example discovery from `schemas/examples/*.json`
- required field checks
- enum checks for top-level fields
- extra top-level field checks when `additionalProperties` is false
- readable PASS/FAIL output
- non-zero exit on failure

**Step 4: Run test to verify it passes**

Run: `python tools/validate_schemas.py`
Expected: PASS for all current schemas/examples.

**Step 5: Commit**

```bash
git add tools/validate_schemas.py
git commit -m "feat: implement schema sanity validator"
```

### Task 3: Document usage and limits

**Files:**
- Modify: `schemas/README.md`
- Test: manual read-back

**Step 1: Write the failing docs checklist**

Add placeholders for:
- how to run the validator
- what it checks
- what it does not check

**Step 2: Verify it fails**

Read `schemas/README.md`.
Expected: validator usage is not documented yet.

**Step 3: Write minimal implementation**

Add a validator section to the README including:
- command to run
- exact scope/limits of validation
- note that this is a sanity validator, not a full Draft 2020-12 implementation

**Step 4: Run review to verify it passes**

Read `schemas/README.md`.
Expected: future contributors can understand and run the validator.

**Step 5: Commit**

```bash
git add schemas/README.md
git commit -m "docs: document schema validation harness"
```

### Task 4: Update project state to reference executable schema verification

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: read-back verification

**Step 1: Write the failing state checklist**

Note the need to record that the schema package is now executable via a Python validation harness.

**Step 2: Verify it fails**

Read current artifacts.
Expected: they mention schema package existence but not executable validation.

**Step 3: Write minimal implementation**

Update project/state artifacts to note:
- the schema contract now has an executable sanity validator
- next work can add stronger validation or runtime consumers

**Step 4: Run review to verify it passes**

Read back updated files.
Expected: next agent can understand the current contract + validation posture.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md schemas/README.md tools/validate_schemas.py
git commit -m "docs: record executable schema validation"
```
