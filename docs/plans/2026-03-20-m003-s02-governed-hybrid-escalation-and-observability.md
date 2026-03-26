# M003 S02 Governed Hybrid Escalation and Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the runtime-facing artifacts that define governed frontier fallback and inspectable escalation semantics without allowing the local-first posture to dissolve into vague hybrid branding.

**Architecture:** This slice extends S01’s routing and quality contracts with a second-layer governance surface: one contract for when fallback is allowed, one schema for what an escalation decision must expose, and one validation artifact that keeps observability claims honest. The implementation remains document-and-contract driven and must preserve the distinction between contract truth and live runtime truth.

**Tech Stack:** Markdown artifacts under `.gsd/` and `runtime/`; PowerShell-native verification commands; existing GSD planning conventions.

---

### Task 1: Create the governed hybrid escalation contract

**Files:**
- Create: `runtime/local-intelligence/hybrid-escalation-contract.md`
- Modify: `runtime/local-intelligence/local-routing-contract.md`
- Test: PowerShell verification against `runtime/local-intelligence/hybrid-escalation-contract.md`

**Step 1: Write the failing test**

```bash
test -f runtime/local-intelligence/hybrid-escalation-contract.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/local-intelligence/hybrid-escalation-contract.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/local-intelligence/hybrid-escalation-contract.md` with these sections:

```md
# Hybrid Escalation Contract

## Purpose
Explain that this artifact defines how frontier support can assist without replacing the local-first posture.

## Fallback Posture
Define that local-first remains primary and frontier support is secondary, conditional, and governed.

## Allowed Escalation States
List concrete states such as local_only, local_retry, local_with_frontier_support, frontier_required, and escalation_blocked.

## Escalation Guardrails
Explain when escalation is prohibited, when explicit user awareness is required, and what must remain visible in narration.

## Review Boundaries
Define what later slices must not break when adding critique, ingestion, or richer orchestration.

## Non-Goals
State explicitly that the document does not claim live runtime routing or telemetry.
```

Update `runtime/local-intelligence/local-routing-contract.md` if needed so it cross-links to this fallback contract.

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/local-intelligence/hybrid-escalation-contract.md') -and ((Get-Content 'runtime/local-intelligence/hybrid-escalation-contract.md' | Select-String '^## ').Count -ge 5)) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/local-intelligence/hybrid-escalation-contract.md runtime/local-intelligence/local-routing-contract.md
git commit -m "docs: define hybrid escalation contract"
```

### Task 2: Create the escalation observability schema

**Files:**
- Create: `runtime/local-intelligence/escalation-observability-schema.md`
- Modify: `runtime/local-intelligence/hybrid-escalation-contract.md`
- Test: PowerShell verification against `runtime/local-intelligence/escalation-observability-schema.md`

**Step 1: Write the failing test**

```bash
test -f runtime/local-intelligence/escalation-observability-schema.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/local-intelligence/escalation-observability-schema.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/local-intelligence/escalation-observability-schema.md` with these sections:

```md
# Escalation Observability Schema

## Purpose
Explain that this artifact defines what a future implementation must expose when an escalation decision happens.

## Decision Record Fields
Include fields such as escalation_reason, source_task_class, local_quality_posture, risk_posture, privacy_posture, narration_summary, fallback_state, and truthfulness_caveat.

## State Transitions
Describe how decisions move between local_only, local_retry, local_with_frontier_support, frontier_required, and escalation_blocked.

## Redaction and Storage Constraints
State what must not be logged or persisted casually.

## Inspection Expectations
Explain what a future agent should be able to inspect when debugging a routing decision.
```

Update the hybrid escalation contract if needed so the two docs point at each other consistently.

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/local-intelligence/escalation-observability-schema.md') -and (Select-String -Path 'runtime/local-intelligence/escalation-observability-schema.md' -Pattern 'escalation_reason')) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/local-intelligence/escalation-observability-schema.md runtime/local-intelligence/hybrid-escalation-contract.md
git commit -m "docs: define escalation observability schema"
```

### Task 3: Add hybrid-routing truth validation

**Files:**
- Create: `runtime/validation/validate-hybrid-routing-truth.md`
- Modify: `runtime/local-intelligence/hybrid-escalation-contract.md`
- Modify: `runtime/local-intelligence/escalation-observability-schema.md`
- Test: PowerShell verification against `runtime/validation/validate-hybrid-routing-truth.md`

**Step 1: Write the failing test**

```bash
test -f runtime/validation/validate-hybrid-routing-truth.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/validation/validate-hybrid-routing-truth.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/validation/validate-hybrid-routing-truth.md` with these sections:

```md
# Validate Hybrid Routing Truth

## Local-First Priority Checks
Verify the docs still treat local-first as primary rather than decorative.

## Observability Truth Checks
Verify the docs define inspection fields without implying implemented telemetry.

## Consistency Checks
Verify escalation states, decision fields, and narration expectations agree with S01 routing and quality contracts.

## Review Questions for S03 and S04
List what later slices must preserve when adding critique/revision and ingestion/adaptation behavior.
```

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/validation/validate-hybrid-routing-truth.md') -and (Select-String -Path 'runtime/validation/validate-hybrid-routing-truth.md' -Pattern 'local-first')) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/validation/validate-hybrid-routing-truth.md runtime/local-intelligence/hybrid-escalation-contract.md runtime/local-intelligence/escalation-observability-schema.md
git commit -m "docs: add hybrid routing truth validation"
```

### Task 4: Record the slice summary and handoff

**Files:**
- Create: `.gsd/milestones/M003-2cpdzh/slices/S02/S02-SUMMARY.md`
- Modify: `.gsd/STATE.md`
- Test: shell verification against `.gsd/milestones/M003-2cpdzh/slices/S02/S02-SUMMARY.md`

**Step 1: Write the failing test**

```bash
test -f .gsd/milestones/M003-2cpdzh/slices/S02/S02-SUMMARY.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f .gsd/milestones/M003-2cpdzh/slices/S02/S02-SUMMARY.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `.gsd/milestones/M003-2cpdzh/slices/S02/S02-SUMMARY.md` with YAML frontmatter and concise sections for:

```md
---
title: S02 Summary
slice: S02
milestone: M003-2cpdzh
status: complete
---

## What changed
- Added governed hybrid escalation contract
- Added escalation observability schema
- Added hybrid-routing truth validation surface

## Verification
- List the file existence and PowerShell verification commands actually run

## Outcome
- State exactly what S02 now proves and what it still does not prove
```

Update `.gsd/STATE.md` so the next action points to `M003-2cpdzh/S03` once S02 is actually complete.

**Step 4: Run test to verify it passes**

Run: `test -f .gsd/milestones/M003-2cpdzh/slices/S02/S02-SUMMARY.md`
Expected: PASS.

**Step 5: Commit**

```bash
git add .gsd/milestones/M003-2cpdzh/slices/S02/S02-SUMMARY.md .gsd/STATE.md
git commit -m "docs: record M003 S02 completion"
```
