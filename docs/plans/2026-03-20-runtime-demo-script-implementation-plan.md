# Runtime Demo Script Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a small demo script that exercises the current runtime layer end-to-end using the example schema payloads.

**Architecture:** Keep the demo standalone and dependency-free. Load example JSON from disk, pass it through the parser bridge, compose a runtime step with a sample route event, and print a compact readable summary.

**Tech Stack:** Python standard library, existing `runtime_types` package, example JSON files.

---

### Task 1: Add demo script skeleton

**Files:**
- Create: `tools/demo_runtime_step.py`
- Test: manual read-back

**Step 1: Write the failing checklist**

Add placeholders for:
- repo-root path setup
- example loading
- runtime-step call
- printed summary

**Step 2: Verify it fails**

Read repo state.
Expected: no demo script exists yet.

**Step 3: Write minimal implementation**

Create `tools/demo_runtime_step.py` with:
- root path setup
- JSON loading helper
- main function skeleton

**Step 4: Run review to verify it passes**

Read the script.
Expected: shape is clear and repo-local.

**Step 5: Commit**

```bash
git add tools/demo_runtime_step.py
git commit -m "feat: add runtime demo script skeleton"
```

### Task 2: Implement first-pass demo flow

**Files:**
- Modify: `tools/demo_runtime_step.py`
- Test: `python tools/demo_runtime_step.py`

**Step 1: Write the failing behavior checklist**

Need the script to:
- load truth-surface example
- parse it via runtime parser
- build a sample route event
- run `resolve_runtime_step`
- print precedence/disclosure/promotion summary

**Step 2: Verify it fails**

Run: `python tools/demo_runtime_step.py`
Expected: fail or do nothing until behavior is implemented.

**Step 3: Write minimal implementation**

Implement the demo flow with one fixed key such as `routing.prefer_local`.

**Step 4: Run test to verify it passes**

Run: `python tools/demo_runtime_step.py`
Expected: readable output showing parser load + composed runtime result.

**Step 5: Commit**

```bash
git add tools/demo_runtime_step.py
git commit -m "feat: implement runtime demo flow"
```

### Task 3: Document the demo as a restore point

**Files:**
- Modify: `runtime_types/README.md`
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Test: manual read-back plus `python tools/demo_runtime_step.py`

**Step 1: Write the failing docs checklist**

Add placeholders for:
- how to run the demo
- what it demonstrates
- why it is a restore point

**Step 2: Verify it fails**

Read current docs/state.
Expected: no runtime demo documented yet.

**Step 3: Write minimal implementation**

Update docs/state to note:
- demo script exists
- current runtime stack can be exercised end-to-end
- next work can build from that demonstration into richer services or tests

**Step 4: Run review to verify it passes**

Run: `python tools/demo_runtime_step.py`
Read updated docs.
Expected: the restore point is clear.

**Step 5: Commit**

```bash
git add runtime_types/README.md .gsd/PROJECT.md .gsd/STATE.md tools/demo_runtime_step.py
git commit -m "docs: record runtime demo restore point"
```
