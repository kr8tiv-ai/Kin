# Neutral Runtime Schema Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a neutral `schemas/` package that encodes the runtime-truth and feedback-learning contract as portable JSON Schema plus examples and documentation.

**Architecture:** Keep the package small, strict, and neutral. Use one schema file per core object, a package README, and example JSON payloads. Avoid any guessed runtime engine, storage system, or app framework.

**Tech Stack:** JSON Schema, Markdown, example JSON files.

---

### Task 1: Create the schema package skeleton

**Files:**
- Create: `schemas/README.md`
- Create: `schemas/examples/.gitkeep`
- Test: manual read-back

**Step 1: Write the failing package checklist**

In `schemas/README.md`, start with placeholders for:
- purpose
- included schemas
- design rules
- how examples should be used

**Step 2: Verify it fails**

Read the repo state.
Expected: no `schemas/` package exists yet.

**Step 3: Write minimal implementation**

Create `schemas/README.md` with package purpose and file inventory.
Create `schemas/examples/.gitkeep` so the example directory exists cleanly.

**Step 4: Run review to verify it passes**

Read `schemas/README.md`.
Expected: package purpose is clear and aligned with M003/S05.

**Step 5: Commit**

```bash
git add schemas/README.md schemas/examples/.gitkeep
git commit -m "feat: add neutral runtime schema package scaffold"
```

### Task 2: Add core JSON Schemas

**Files:**
- Create: `schemas/truth-surface.schema.json`
- Create: `schemas/feedback-ledger-entry.schema.json`
- Create: `schemas/preference-record.schema.json`
- Create: `schemas/routing-provenance-event.schema.json`
- Create: `schemas/promotion-decision-record.schema.json`
- Test: manual read-back against `.gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md`

**Step 1: Write the failing schema checklist**

List every required field and enum per schema based on `S05-RESEARCH.md`.

**Step 2: Verify it fails**

Read `S05-RESEARCH.md`.
Expected: field definitions exist only in docs, not as schema files.

**Step 3: Write minimal implementation**

Create the five JSON Schema files with:
- `$schema`
- `title`
- `type: object`
- `description`
- `additionalProperties: false`
- `properties`
- `required`
- enums where applicable

**Step 4: Run review to verify it passes**

Read each schema file.
Expected: all required fields and bounded enums are present.

**Step 5: Commit**

```bash
git add schemas/*.schema.json
git commit -m "feat: add runtime truth and feedback schemas"
```

### Task 3: Add example payloads

**Files:**
- Create: `schemas/examples/truth-surface.example.json`
- Create: `schemas/examples/feedback-ledger-entry.example.json`
- Create: `schemas/examples/preference-record.example.json`
- Create: `schemas/examples/routing-provenance-event.example.json`
- Create: `schemas/examples/promotion-decision-record.example.json`
- Test: manual schema/example consistency review

**Step 1: Write the failing example checklist**

For each schema, note that it still lacks a concrete example instance.

**Step 2: Verify it fails**

Read the schema directory.
Expected: no example payloads yet.

**Step 3: Write minimal implementation**

Create one valid example JSON file per schema using realistic values that match M003/S05 rules.

**Step 4: Run review to verify it passes**

Read examples and confirm:
- examples obey enums
- examples reflect spec precedence and provenance honesty
- no unsafe fields appear

**Step 5: Commit**

```bash
git add schemas/examples/*.json
git commit -m "feat: add runtime schema example payloads"
```

### Task 4: Tighten README and contract notes

**Files:**
- Modify: `schemas/README.md`
- Test: manual review against `docs/plans/2026-03-20-neutral-runtime-schema-package-design.md`

**Step 1: Write the failing documentation checklist**

Add placeholders for:
- schema intent
- field philosophy
- exclusions
- provenance and learning notes
- future integration notes

**Step 2: Verify it fails**

Read `schemas/README.md`.
Expected: it still lacks full contract guidance.

**Step 3: Write minimal implementation**

Expand the README to explain:
- what each schema represents
- what the package intentionally does not do yet
- how provenance and learning scopes should be interpreted
- how future runtimes should use the package

**Step 4: Run review to verify it passes**

Read `schemas/README.md`.
Expected: a new engineer could use it without reading the entire milestone history.

**Step 5: Commit**

```bash
git add schemas/README.md
git commit -m "docs: document neutral runtime schema package"
```

### Task 5: Update project artifacts to point to the new code-real contract layer

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md`
- Test: read-back verification

**Step 1: Write the failing state checklist**

Note the need to record that the runtime-truth contract now exists both as docs and as concrete schema files.

**Step 2: Verify it fails**

Read current artifacts.
Expected: they describe the contract but do not mention a code-real schema package.

**Step 3: Write minimal implementation**

Update project/state/summary artifacts to reference the new `schemas/` package as the first implementation surface for the runtime-truth contract.

**Step 4: Run review to verify it passes**

Read back the updated artifacts.
Expected: the next agent can see both the design docs and the concrete schema package.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md .gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md schemas/
git commit -m "docs: connect M003 runtime contract to schema package"
```
