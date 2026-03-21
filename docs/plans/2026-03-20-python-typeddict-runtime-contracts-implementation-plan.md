# Python TypedDict Runtime Contracts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimal Python package of importable runtime contract types that mirrors the validated schema package using `TypedDict` and `Literal`.

**Architecture:** Keep the package small and standard-library only. Mirror the schema package closely, using `Literal` aliases for bounded states and `TypedDict` for object shapes. Avoid behavior, helpers, or storage concerns.

**Tech Stack:** Python standard library typing primitives, Markdown docs.

---

### Task 1: Create the runtime type package skeleton

**Files:**
- Create: `runtime_types/__init__.py`
- Create: `runtime_types/contracts.py`
- Test: manual read-back

**Step 1: Write the failing package checklist**

Start with placeholders for:
- bounded literal aliases
- typed dict definitions
- exported symbols

**Step 2: Verify it fails**

Read repo state.
Expected: no `runtime_types/` package exists yet.

**Step 3: Write minimal implementation**

Create:
- `runtime_types/contracts.py`
- `runtime_types/__init__.py` re-exporting the public types

**Step 4: Run review to verify it passes**

Read both files.
Expected: package shape is clear and neutral.

**Step 5: Commit**

```bash
git add runtime_types/__init__.py runtime_types/contracts.py
git commit -m "feat: add runtime contract package skeleton"
```

### Task 2: Add literal aliases and TypedDict contracts

**Files:**
- Modify: `runtime_types/contracts.py`
- Modify: `runtime_types/__init__.py`
- Test: `python -c "import runtime_types"`

**Step 1: Write the failing type checklist**

List the required aliases and types:
- scope/provenance/polarity/route literals
- `FeedbackLedgerEntry`
- `PreferenceRecord`
- `RoutingProvenanceEvent`
- `PromotionDecisionRecord`
- `TruthSurface`

**Step 2: Verify it fails**

Run: `python -c "import runtime_types"`
Expected: fail or import without useful exported types because definitions are incomplete.

**Step 3: Write minimal implementation**

Add `Literal` aliases and `TypedDict` definitions that mirror current schema intent.
Use generic dict fields for:
- `active_spec`
- `active_policy`
- `current_task`
- `persona_anchor`
- `routing_policy`
- `fallback_policy`
- `critique_policy`
- `revision_budget`
- `disclosure_state`

**Step 4: Run test to verify it passes**

Run: `python -c "import runtime_types; from runtime_types import TruthSurface, FeedbackLedgerEntry"`
Expected: no import errors.

**Step 5: Commit**

```bash
git add runtime_types/__init__.py runtime_types/contracts.py
git commit -m "feat: add Python TypedDict runtime contracts"
```

### Task 3: Document the relationship between schemas and Python contracts

**Files:**
- Modify: `schemas/README.md`
- Create: `runtime_types/README.md`
- Test: manual read-back

**Step 1: Write the failing docs checklist**

Add placeholders for:
- purpose of the Python package
- relationship to the schema package
- what remains intentionally unmodeled

**Step 2: Verify it fails**

Read repo docs.
Expected: no dedicated runtime type README exists yet.

**Step 3: Write minimal implementation**

Create `runtime_types/README.md` and update `schemas/README.md` to explain:
- schemas are the canonical portable contract
- `runtime_types/` is the first Python consumer layer
- deeper runtime services still do not exist yet

**Step 4: Run review to verify it passes**

Read both README files.
Expected: the boundary between schemas and Python types is clear.

**Step 5: Commit**

```bash
git add runtime_types/README.md schemas/README.md
git commit -m "docs: describe Python runtime contract layer"
```

### Task 4: Verify package import and record state

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: `python -c "import runtime_types"`

**Step 1: Write the failing state checklist**

Note the need to record that the repo now has:
- validated schemas
- executable validator
- importable Python contract types

**Step 2: Verify it fails**

Read current project/state artifacts.
Expected: they do not yet mention the Python consumer type layer.

**Step 3: Write minimal implementation**

Update project/state artifacts to note the new consumer-facing Python contract package and point next work toward parsers/validators/services that consume these types.

**Step 4: Run test to verify it passes**

Run: `python -c "import runtime_types"`
Expected: PASS.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md runtime_types/__init__.py runtime_types/contracts.py runtime_types/README.md schemas/README.md
git commit -m "docs: record Python runtime contract layer"
```
