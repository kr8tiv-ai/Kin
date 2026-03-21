# Runtime Step Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a small composition service that combines precedence resolution, optional disclosure formatting, and optional promotion evaluation for one runtime step.

**Architecture:** Keep the service flat and transparent. Accept already-validated runtime payloads and optional route events, then return a structured result aggregating existing module outputs. Avoid persistence, mutation, async behavior, or storage concerns.

**Tech Stack:** Python standard library, existing `runtime_types` package.

---

### Task 1: Add runtime step service skeleton

**Files:**
- Create: `runtime_types/runtime_step.py`
- Modify: `runtime_types/__init__.py`
- Test: `python -c "from runtime_types.runtime_step import resolve_runtime_step"`

**Step 1: Write the failing checklist**

Add placeholders for:
- result type
- service function
- optional route event integration

**Step 2: Verify it fails**

Run: `python -c "from runtime_types.runtime_step import resolve_runtime_step"`
Expected: import fails because module does not exist.

**Step 3: Write minimal implementation**

Create `runtime_types/runtime_step.py` with:
- a structured result type
- `resolve_runtime_step(...)` skeleton

Update exports if useful.

**Step 4: Run test to verify it passes**

Run: `python -c "from runtime_types.runtime_step import resolve_runtime_step; print('runtime step import ok')"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/runtime_step.py runtime_types/__init__.py
git commit -m "feat: add runtime step service skeleton"
```

### Task 2: Implement first-pass composition behavior

**Files:**
- Modify: `runtime_types/runtime_step.py`
- Test: simple one-liner combining precedence + disclosure

**Step 1: Write the failing behavior checklist**

Need support for:
- precedence result always
- disclosure result when route event present
- promotion result when a current feedback entry is supplied or inferred simply

**Step 2: Verify it fails**

Run simple example composition call.
Expected: incomplete behavior until composition is implemented.

**Step 3: Write minimal implementation**

Implement `resolve_runtime_step(...)` so it:
- calls `resolve_precedence`
- optionally calls `format_provenance_disclosure`
- optionally calls `evaluate_feedback_promotion` on the most recent matching feedback entry when requested
- returns one aggregate result object

**Step 4: Run test to verify it passes**

Run a one-liner showing:
- winner source from precedence
- disclosure level from route event

Expected: PASS.

**Step 5: Commit**

```bash
git add runtime_types/runtime_step.py
git commit -m "feat: compose runtime step decision helpers"
```

### Task 3: Document the new service layer

**Files:**
- Modify: `runtime_types/README.md`
- Test: manual read-back

**Step 1: Write the failing docs checklist**

Add placeholders for:
- what runtime step service does
- why it exists
- what it still avoids

**Step 2: Verify it fails**

Read current README.
Expected: no service-layer section yet.

**Step 3: Write minimal implementation**

Add a short section describing:
- composed result shape
- included behaviors
- non-goals

**Step 4: Run review to verify it passes**

Read README.
Expected: service layer is understandable and still clearly bounded.

**Step 5: Commit**

```bash
git add runtime_types/README.md
git commit -m "docs: describe runtime step service"
```

### Task 4: Record a restore point in project artifacts

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: read-back verification

**Step 1: Write the failing state checklist**

Need to record that the runtime layer now includes a composed step-level service.

**Step 2: Verify it fails**

Read current artifacts.
Expected: no mention of runtime step orchestration yet.

**Step 3: Write minimal implementation**

Update project/state to note the new service and set the next pass toward either a richer feedback selection helper or a first end-to-end demo artifact.

**Step 4: Run review to verify it passes**

Read updated artifacts.
Expected: next agent sees this as a restore point and next launch surface.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md runtime_types/runtime_step.py runtime_types/README.md runtime_types/__init__.py
git commit -m "docs: record runtime step restore point"
```
