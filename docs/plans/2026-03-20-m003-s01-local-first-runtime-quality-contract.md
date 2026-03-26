# M003 S01 Local-First Runtime Quality Contract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the planning and runtime-facing artifacts that make Cipher’s local-first model path concrete through routing rules, quality thresholds, and escalation semantics.

**Architecture:** This slice is document-and-contract driven. It adds one authoritative local-routing artifact, one paired local-quality evaluation artifact, and one validation artifact that prevents overclaiming about live integrations. The implementation should preserve compatibility with the existing Telegram-first, Mission Control-governed Cipher runtime while creating stable boundaries for later hybrid-routing and creative-web slices.

**Tech Stack:** Markdown artifacts under `.gsd/` and `runtime/`; existing GSD planning conventions; shell-based file existence and content verification.

---

### Task 1: Create the local-routing contract

**Files:**
- Create: `runtime/local-intelligence/local-routing-contract.md`
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S01/S01-PLAN.md`
- Test: shell verification against `runtime/local-intelligence/local-routing-contract.md`

**Step 1: Write the failing test**

```bash
test -f runtime/local-intelligence/local-routing-contract.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/local-intelligence/local-routing-contract.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/local-intelligence/local-routing-contract.md` with these sections:

```md
# Local Routing Contract

## Purpose
Explain that this artifact defines when Cipher should prefer the local model path and when escalation is allowed.

## Task Classes
List concrete classes such as casual companionship, lightweight planning, website critique, web-structure ideation, sensitive/private drafting, broad research synthesis, and high-risk/computer-use reasoning.

## Default Routing Rules
For each class, say whether local-first is required, preferred, optional, or discouraged.

## Local Failure Modes
Name failure categories like low coherence, missing design specificity, weak instruction retention, hallucinated certainty, and unsafe action reasoning.

## Escalation Semantics
Define when local retry is allowed, when frontier escalation is allowed, and what should be narrated to the user.

## Non-Goals
State explicitly that this document does not claim a live wired model stack yet.
```

**Step 4: Run test to verify it passes**

Run: `test -f runtime/local-intelligence/local-routing-contract.md && grep -c "^## " runtime/local-intelligence/local-routing-contract.md`
Expected: PASS with a section count of at least 5.

**Step 5: Commit**

```bash
git add runtime/local-intelligence/local-routing-contract.md .gsd/milestones/M003-2cpdzh/slices/S01/S01-PLAN.md
git commit -m "docs: define local routing contract for M003 S01"
```

### Task 2: Create the local-quality evaluation contract

**Files:**
- Create: `runtime/local-intelligence/local-quality-evaluation.md`
- Modify: `runtime/local-intelligence/local-routing-contract.md`
- Test: shell verification against `runtime/local-intelligence/local-quality-evaluation.md`

**Step 1: Write the failing test**

```bash
test -f runtime/local-intelligence/local-quality-evaluation.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/local-intelligence/local-quality-evaluation.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/local-intelligence/local-quality-evaluation.md` with these sections:

```md
# Local Quality Evaluation

## Purpose
Define how local output quality is judged before Cipher stays local or escalates.

## Evaluation Dimensions
Include instruction following, coherence, privacy suitability, design specificity, taste alignment, and action safety.

## Threshold Model
Describe pass, borderline, and fail thresholds with plain-language criteria.

## Retry vs Escalate Rules
Explain when to retry locally, when to ask the user a narrower question, and when to escalate.

## Website-Specific Considerations
Add criteria for anti-slop web guidance, reference usage, critique sharpness, and generic-template avoidance.

## Failure Examples
List a few concrete patterns that should trigger escalation.
```

Update the routing contract if needed so both docs reference each other consistently.

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/local-intelligence/local-quality-evaluation.md') -and (Select-String -Path 'runtime/local-intelligence/local-quality-evaluation.md' -Pattern 'threshold')) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/local-intelligence/local-quality-evaluation.md runtime/local-intelligence/local-routing-contract.md
git commit -m "docs: define local quality evaluation contract"
```

### Task 3: Add truth-surface validation for S01

**Files:**
- Create: `runtime/validation/validate-local-intelligence-truth.md`
- Modify: `runtime/local-intelligence/local-routing-contract.md`
- Modify: `runtime/local-intelligence/local-quality-evaluation.md`
- Test: shell verification against `runtime/validation/validate-local-intelligence-truth.md`

**Step 1: Write the failing test**

```bash
test -f runtime/validation/validate-local-intelligence-truth.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/validation/validate-local-intelligence-truth.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/validation/validate-local-intelligence-truth.md` with these sections:

```md
# Validate Local Intelligence Truth

## Contract Truth Checks
Verify the docs describe routing and quality rules without claiming live model orchestration.

## Consistency Checks
Verify routing classes, thresholds, and escalation rules do not contradict each other.

## Overclaiming Checks
Flag wording that implies implemented telemetry, real-time model benchmarks, or live internet/model integrations that do not yet exist.

## Review Questions for S02 and S03
List what later slices must preserve when adding fallback and creative-web specialization.
```

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/validation/validate-local-intelligence-truth.md') -and (Select-String -Path 'runtime/validation/validate-local-intelligence-truth.md' -Pattern 'contract truth')) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/validation/validate-local-intelligence-truth.md runtime/local-intelligence/local-routing-contract.md runtime/local-intelligence/local-quality-evaluation.md
git commit -m "docs: add local intelligence truth validation"
```

### Task 4: Record the slice summary and handoff

**Files:**
- Create: `.gsd/milestones/M003-2cpdzh/slices/S01/S01-SUMMARY.md`
- Modify: `.gsd/STATE.md`
- Test: shell verification against `.gsd/milestones/M003-2cpdzh/slices/S01/S01-SUMMARY.md`

**Step 1: Write the failing test**

```bash
test -f .gsd/milestones/M003-2cpdzh/slices/S01/S01-SUMMARY.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f .gsd/milestones/M003-2cpdzh/slices/S01/S01-SUMMARY.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `.gsd/milestones/M003-2cpdzh/slices/S01/S01-SUMMARY.md` with YAML frontmatter and concise sections for:

```md
---
title: S01 Summary
slice: S01
milestone: M003-2cpdzh
status: complete
---

## What changed
- Added local-routing contract
- Added local-quality evaluation contract
- Added truthfulness validation surface

## Verification
- List the file existence and grep checks actually run

## Outcome
- State exactly what S01 now proves and what it still does not prove
```

Update `.gsd/STATE.md` so the next action points to `M003-2cpdzh/S02` once S01 is actually complete.

**Step 4: Run test to verify it passes**

Run: `test -f .gsd/milestones/M003-2cpdzh/slices/S01/S01-SUMMARY.md`
Expected: PASS.

**Step 5: Commit**

```bash
git add .gsd/milestones/M003-2cpdzh/slices/S01/S01-SUMMARY.md .gsd/STATE.md
git commit -m "docs: record M003 S01 completion"
```
