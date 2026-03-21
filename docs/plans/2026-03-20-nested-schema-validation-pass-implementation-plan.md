# Nested Schema Validation Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the Python schema validation harness so it validates nested arrays, nested objects, and local `$ref` links used by the current schema package.

**Architecture:** Keep the validator dependency-free and explicit. Add a recursive validation function that supports only the subset of JSON Schema currently used in this repo. Preserve honest documentation about limits.

**Tech Stack:** Python standard library, JSON files, Markdown usage notes.

---

### Task 1: Refactor validator into recursive schema walker

**Files:**
- Modify: `tools/validate_schemas.py`
- Test: `python tools/validate_schemas.py`

**Step 1: Write the failing expectation**

Document the new requirements inside the file or plan notes:
- local `$ref` resolution
- nested object validation
- nested array validation
- primitive type checks

**Step 2: Verify it fails**

Run: `python tools/validate_schemas.py`
Expected: current script passes but does not yet exercise nested structures deeply.

**Step 3: Write minimal implementation**

Refactor into a recursive validator that can:
- resolve local refs like `./preference-record.schema.json`
- validate nested `object` properties
- validate array `items`
- validate primitive types
- reuse required/enum/additionalProperties rules recursively

**Step 4: Run test to verify it passes**

Run: `python tools/validate_schemas.py`
Expected: PASS for current schemas/examples after recursive validation is added.

**Step 5: Commit**

```bash
git add tools/validate_schemas.py
git commit -m "feat: add recursive schema validation support"
```

### Task 2: Tighten example/schema alignment if validator reveals drift

**Files:**
- Modify as needed: `schemas/examples/*.json`
- Modify as needed: `schemas/*.schema.json`
- Test: `python tools/validate_schemas.py`

**Step 1: Write the failing checklist**

List likely breakpoints:
- array item mismatches
- nested missing required keys
- wrong primitive types in example arrays

**Step 2: Verify it fails if drift exists**

Run: `python tools/validate_schemas.py`
Expected: either PASS immediately or reveal exact nested mismatch errors.

**Step 3: Write minimal implementation**

If any nested mismatches exist, fix the smallest correct source of truth:
- update example payloads if examples are wrong
- update schema only if research/design contract proves the schema is wrong

**Step 4: Run test to verify it passes**

Run: `python tools/validate_schemas.py`
Expected: PASS with recursive checks active.

**Step 5: Commit**

```bash
git add schemas/*.schema.json schemas/examples/*.json tools/validate_schemas.py
git commit -m "fix: align schema examples with recursive validator"
```

### Task 3: Update README with stronger validator scope

**Files:**
- Modify: `schemas/README.md`
- Test: manual read-back

**Step 1: Write the failing docs checklist**

Add placeholders for:
- recursive validation support
- local `$ref` support
- still-unsupported features

**Step 2: Verify it fails**

Read `schemas/README.md`.
Expected: README still describes only shallow validation.

**Step 3: Write minimal implementation**

Update README so it accurately says the validator now checks:
- nested arrays/objects
- local `$ref`
- primitive arrays

And still does not fully support all JSON Schema features.

**Step 4: Run review to verify it passes**

Read `schemas/README.md`.
Expected: documentation matches implementation honestly.

**Step 5: Commit**

```bash
git add schemas/README.md
git commit -m "docs: describe recursive schema validation scope"
```

### Task 4: Record the stronger executable contract in project artifacts

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: read-back verification

**Step 1: Write the failing state checklist**

Note the need to record that validation now covers nested contract structures, not just top-level smoke tests.

**Step 2: Verify it fails**

Read current artifacts.
Expected: they describe executable validation, but not the deeper scope.

**Step 3: Write minimal implementation**

Update project/state artifacts to note the stronger nested validation posture and point the next pass toward typed runtime consumers.

**Step 4: Run review to verify it passes**

Read back updated files.
Expected: next agent can see that the schema contract is now both concrete and recursively validated.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md schemas/README.md tools/validate_schemas.py
git commit -m "docs: record recursive schema validation support"
```
