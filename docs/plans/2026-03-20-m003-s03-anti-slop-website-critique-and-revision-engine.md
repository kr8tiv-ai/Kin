# M003 S03 Anti-Slop Website Critique and Revision Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the runtime-facing artifacts that define how Cipher critiques generic AI-web work, revises it into stronger outcomes, and calibrates premium website taste without overclaiming live design intelligence.

**Architecture:** This slice adds a web-quality layer on top of S01 and S02. One rubric names anti-slop failures, one revision artifact turns critique into concrete upgrade moves, and one taste-calibration/validation pair sets accept-avoid-reject boundaries while keeping quality claims honest. The work remains document-and-contract driven, not live model implementation.

**Tech Stack:** Markdown artifacts under `.gsd/`, `runtime/web-quality/`, and `runtime/validation/`; PowerShell-native verification commands; existing GSD planning conventions.

---

### Task 1: Create the anti-slop website critique rubric

**Files:**
- Create: `runtime/web-quality/anti-slop-critique-rubric.md`
- Modify: `runtime/local-intelligence/local-quality-evaluation.md`
- Test: PowerShell verification against `runtime/web-quality/anti-slop-critique-rubric.md`

**Step 1: Write the failing test**

```bash
test -f runtime/web-quality/anti-slop-critique-rubric.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/web-quality/anti-slop-critique-rubric.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/web-quality/anti-slop-critique-rubric.md` with these sections:

```md
# Anti-Slop Website Critique Rubric

## Purpose
Explain that this artifact defines how Cipher identifies generic AI-web failure patterns.

## Critique Categories
List concrete categories such as generic structure, vague positioning, limp hierarchy, cliché copy, flat visual rhythm, safe-but-forgettable layouts, and reference misuse.

## Failure Signatures
Describe what each category looks like when it appears in output.

## Severity Language
Define levels such as nudge, revise, and reject.

## Critique Response Rules
Explain how critique should be phrased so it leads to action rather than aesthetic hand-waving.

## Non-Goals
State explicitly that the artifact does not claim live scoring or automated design judgment.
```

Update `runtime/local-intelligence/local-quality-evaluation.md` if needed so it cross-links to the rubric.

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/web-quality/anti-slop-critique-rubric.md') -and ((Get-Content 'runtime/web-quality/anti-slop-critique-rubric.md' | Select-String '^## ').Count -ge 5)) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/web-quality/anti-slop-critique-rubric.md runtime/local-intelligence/local-quality-evaluation.md
git commit -m "docs: define anti-slop website critique rubric"
```

### Task 2: Create website revision patterns

**Files:**
- Create: `runtime/web-quality/revision-patterns.md`
- Modify: `runtime/web-quality/anti-slop-critique-rubric.md`
- Test: PowerShell verification against `runtime/web-quality/revision-patterns.md`

**Step 1: Write the failing test**

```bash
test -f runtime/web-quality/revision-patterns.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/web-quality/revision-patterns.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/web-quality/revision-patterns.md` with these sections:

```md
# Website Revision Patterns

## Purpose
Explain that this artifact turns critique into concrete upgrade moves.

## Before -> After Patterns
Include named transformations for copy, hierarchy, section structure, pacing, and visual contrast.

## Pattern Selection Rules
Explain when each revision pattern should be used.

## Anti-Regression Rules
Explain how revisions should avoid falling back into generic template output.

## Constraint Notes
State how revision patterns must respect local-first and governed fallback posture.
```

Update the critique rubric if needed so the two docs point at each other consistently.

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/web-quality/revision-patterns.md') -and (Select-String -Path 'runtime/web-quality/revision-patterns.md' -Pattern 'Before -> After')) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/web-quality/revision-patterns.md runtime/web-quality/anti-slop-critique-rubric.md
git commit -m "docs: define website revision patterns"
```

### Task 3: Create taste calibration and web-quality truth validation

**Files:**
- Create: `runtime/web-quality/taste-calibration.md`
- Create: `runtime/validation/validate-web-quality-truth.md`
- Modify: `runtime/web-quality/revision-patterns.md`
- Test: PowerShell verification against the new files

**Step 1: Write the failing tests**

```bash
test -f runtime/web-quality/taste-calibration.md
test -f runtime/validation/validate-web-quality-truth.md
```

Expected now: FAIL because the files do not exist yet.

**Step 2: Run tests to verify they fail**

Run: `test -f runtime/web-quality/taste-calibration.md; test -f runtime/validation/validate-web-quality-truth.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/web-quality/taste-calibration.md` with these sections:

```md
# Taste Calibration

## Purpose
Explain that this artifact defines premium website taste boundaries.

## Accept
Describe qualities Cipher should positively reinforce.

## Avoid
Describe patterns that may be workable but are weak or overused.

## Reject
Describe patterns that should be treated as beneath Cipher’s premium bar.

## Reference Translation Notes
Explain how references should influence decisions without being copied mechanically.
```

Create `runtime/validation/validate-web-quality-truth.md` with these sections:

```md
# Validate Web Quality Truth

## Premium Web Quality Checks
Verify the docs describe premium web quality concretely rather than vaguely.

## Anti-Slop Truth Checks
Verify critique and revision language does not pretend to be automated scoring or live design intelligence.

## Consistency Checks
Verify rubric, revision patterns, and taste calibration agree with S01/S02 contracts.

## Review Questions for S04 and S05
List what later slices must preserve when adding ingestion/adaptation and final integration.
```

Update `runtime/web-quality/revision-patterns.md` if needed so it cross-links to taste calibration.

**Step 4: Run tests to verify they pass**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/web-quality/taste-calibration.md') -and (Select-String -Path 'runtime/web-quality/taste-calibration.md' -Pattern 'Reject')) { exit 0 } else { exit 1 }"`
Expected: PASS.

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/validation/validate-web-quality-truth.md') -and (Select-String -Path 'runtime/validation/validate-web-quality-truth.md' -Pattern 'premium web quality')) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/web-quality/taste-calibration.md runtime/validation/validate-web-quality-truth.md runtime/web-quality/revision-patterns.md
git commit -m "docs: define web quality truth surfaces"
```

### Task 4: Record the slice summary and handoff

**Files:**
- Create: `.gsd/milestones/M003-2cpdzh/slices/S03/S03-SUMMARY.md`
- Modify: `.gsd/STATE.md`
- Test: shell verification against `.gsd/milestones/M003-2cpdzh/slices/S03/S03-SUMMARY.md`

**Step 1: Write the failing test**

```bash
test -f .gsd/milestones/M003-2cpdzh/slices/S03/S03-SUMMARY.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f .gsd/milestones/M003-2cpdzh/slices/S03/S03-SUMMARY.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `.gsd/milestones/M003-2cpdzh/slices/S03/S03-SUMMARY.md` with YAML frontmatter and concise sections for:

```md
---
title: S03 Summary
slice: S03
milestone: M003-2cpdzh
status: complete
---

## What changed
- Added anti-slop website critique rubric
- Added website revision patterns
- Added taste calibration and web-quality truth validation

## Verification
- List the file existence and PowerShell verification commands actually run

## Outcome
- State exactly what S03 now proves and what it still does not prove
```

Update `.gsd/STATE.md` so the next action points to `M003-2cpdzh/S04` once S03 is actually complete.

**Step 4: Run test to verify it passes**

Run: `test -f .gsd/milestones/M003-2cpdzh/slices/S03/S03-SUMMARY.md`
Expected: PASS.

**Step 5: Commit**

```bash
git add .gsd/milestones/M003-2cpdzh/slices/S03/S03-SUMMARY.md .gsd/STATE.md
git commit -m "docs: record M003 S03 completion"
```
