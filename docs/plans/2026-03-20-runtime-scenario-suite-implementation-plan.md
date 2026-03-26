# Runtime Scenario Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight multi-scenario runtime harness that exercises representative precedence, promotion, and disclosure paths without introducing a formal test framework.

**Architecture:** Keep the suite as a standalone script. Each scenario should build minimal inputs, run the relevant runtime helper or composed service, and print PASS/FAIL with a short explanation. Exit non-zero if any scenario fails.

**Tech Stack:** Python standard library, existing `runtime_types` package.

---

### Task 1: Add scenario suite skeleton

**Files:**
- Create: `tools/runtime_scenarios.py`
- Test: manual read-back

**Step 1: Write the failing checklist**

Add placeholders for:
- scenario runner
- assertion helper
- main function
- named scenarios

**Step 2: Verify it fails**

Read repo state.
Expected: no scenario suite exists yet.

**Step 3: Write minimal implementation**

Create `tools/runtime_scenarios.py` with:
- repo-root path setup
- scenario registration/list
- PASS/FAIL accumulator

**Step 4: Run review to verify it passes**

Read the file.
Expected: shape is clear and lightweight.

**Step 5: Commit**

```bash
git add tools/runtime_scenarios.py
git commit -m "feat: add runtime scenario suite skeleton"
```

### Task 2: Implement first six scenarios

**Files:**
- Modify: `tools/runtime_scenarios.py`
- Test: `python tools/runtime_scenarios.py`

**Step 1: Write the failing scenario checklist**

Need at least:
- spec-wins-over-default
- project-promotion
- owner-promotion
- unsafe-feedback-reject
- hybrid-disclosure
- fallback-refused-disclosure

**Step 2: Verify it fails**

Run: `python tools/runtime_scenarios.py`
Expected: fail or incomplete output until scenarios are implemented.

**Step 3: Write minimal implementation**

Implement the scenarios using the current runtime layer modules.
Each should return pass/fail plus a one-line reason.

**Step 4: Run test to verify it passes**

Run: `python tools/runtime_scenarios.py`
Expected: all listed scenarios PASS with readable output.

**Step 5: Commit**

```bash
git add tools/runtime_scenarios.py
git commit -m "feat: implement runtime scenario suite"
```

### Task 3: Record the scenario harness as a restore point

**Files:**
- Modify: `runtime_types/README.md`
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: `python tools/runtime_scenarios.py`

**Step 1: Write the failing docs checklist**

Add placeholders for:
- how to run the scenario suite
- what it covers
- why it is a stronger restore point than a single demo

**Step 2: Verify it fails**

Read current docs/state.
Expected: only the single demo is documented.

**Step 3: Write minimal implementation**

Update docs/state to note:
- scenario suite exists
- it covers multiple representative paths
- next work can either deepen scenario coverage or start introducing a formal test layer

**Step 4: Run review to verify it passes**

Run: `python tools/runtime_scenarios.py`
Read updated docs.
Expected: restore point is clear.

**Step 5: Commit**

```bash
git add runtime_types/README.md .gsd/PROJECT.md .gsd/STATE.md tools/runtime_scenarios.py
git commit -m "docs: record runtime scenario restore point"
```
