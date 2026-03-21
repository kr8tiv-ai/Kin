# M003 S04 Design-Signal Ingestion and Taste Adaptation Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the runtime-facing artifacts that define bounded reference ingestion, signal synthesis, and owner-taste adaptation without drifting into imitation, uncontrolled crawling, or raw personal-memory behavior.

**Architecture:** This slice adds a design-signal layer on top of the routing, fallback, critique, and taste contracts from S01-S03. One artifact defines what may be gathered and why, one defines how references are synthesized into reusable signal cards, and one defines what owner-taste adaptation may accumulate while a paired validation surface guards against overclaiming or creepiness.

**Tech Stack:** Markdown artifacts under `.gsd/`, `runtime/design-signals/`, and `runtime/validation/`; PowerShell-native verification commands with fallback to direct reads if the shell degrades; existing GSD planning conventions.

---

### Task 1: Create the bounded reference-ingestion contract

**Files:**
- Create: `runtime/design-signals/reference-ingestion-contract.md`
- Modify: `runtime/local-intelligence/hybrid-escalation-contract.md`
- Test: PowerShell verification against `runtime/design-signals/reference-ingestion-contract.md`

**Step 1: Write the failing test**

```bash
test -f runtime/design-signals/reference-ingestion-contract.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/design-signals/reference-ingestion-contract.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/design-signals/reference-ingestion-contract.md` with these sections:

```md
# Reference Ingestion Contract

## Purpose
Explain that this artifact defines what design/reference material may be gathered and why.

## Source Classes
List source classes such as design articles, site references, component examples, visual trends, and owner-provided references.

## Allowed Ingestion Intents
Define intents such as critique support, taste calibration, structure study, and reference translation.

## Filtering Rules
Explain what must be filtered out, reduced, or translated before it becomes a reusable signal.

## Stop Conditions
Describe when ingestion should stop because the signal is noisy, repetitive, privacy-sensitive, or outside scope.

## Non-Goals
State explicitly that this document does not authorize uncontrolled crawling or treat every reference as truth.
```

Update `runtime/local-intelligence/hybrid-escalation-contract.md` if needed so it references bounded ingestion as part of governed fallback context.

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/design-signals/reference-ingestion-contract.md') -and ((Get-Content 'runtime/design-signals/reference-ingestion-contract.md' | Select-String '^## ').Count -ge 5)) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/design-signals/reference-ingestion-contract.md runtime/local-intelligence/hybrid-escalation-contract.md
git commit -m "docs: define bounded reference ingestion contract"
```

### Task 2: Create design-signal synthesis outputs

**Files:**
- Create: `runtime/design-signals/design-signal-synthesis.md`
- Modify: `runtime/design-signals/reference-ingestion-contract.md`
- Test: PowerShell verification against `runtime/design-signals/design-signal-synthesis.md`

**Step 1: Write the failing test**

```bash
test -f runtime/design-signals/design-signal-synthesis.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f runtime/design-signals/design-signal-synthesis.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/design-signals/design-signal-synthesis.md` with these sections:

```md
# Design Signal Synthesis

## Purpose
Explain that this artifact defines how gathered references become reusable signal outputs.

## Signal Card Shape
Describe a "signal card" with fields for source class, observed pattern, design implication, anti-pattern risk, and reuse note.

## Translation Rules
Explain how references are translated into structural, narrative, pacing, or contrast guidance instead of copied aesthetics.

## Synthesis Quality Rules
Define what makes a synthesized signal useful rather than vague mood-board language.

## Non-Goals
State that synthesis is not imitation, scraping for duplication, or blind trend-following.
```

Update the ingestion contract if needed so it points at the synthesis output surface.

**Step 4: Run test to verify it passes**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/design-signals/design-signal-synthesis.md') -and (Select-String -Path 'runtime/design-signals/design-signal-synthesis.md' -Pattern 'signal card')) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/design-signals/design-signal-synthesis.md runtime/design-signals/reference-ingestion-contract.md
git commit -m "docs: define design signal synthesis outputs"
```

### Task 3: Create owner-taste adaptation and design-signal truth validation

**Files:**
- Create: `runtime/design-signals/owner-taste-adaptation.md`
- Create: `runtime/validation/validate-design-signal-truth.md`
- Modify: `runtime/design-signals/design-signal-synthesis.md`
- Test: PowerShell verification against the new files

**Step 1: Write the failing tests**

```bash
test -f runtime/design-signals/owner-taste-adaptation.md
test -f runtime/validation/validate-design-signal-truth.md
```

Expected now: FAIL because the files do not exist yet.

**Step 2: Run tests to verify they fail**

Run: `test -f runtime/design-signals/owner-taste-adaptation.md; test -f runtime/validation/validate-design-signal-truth.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `runtime/design-signals/owner-taste-adaptation.md` with these sections:

```md
# Owner Taste Adaptation

## Purpose
Explain that this artifact defines how Cipher adapts to owner taste without storing raw personal memory.

## What May Accumulate
Describe acceptable adaptation units such as recurring contrast preferences, pacing preferences, proof density preferences, and critique tolerance.

## Preference Drift
Explain how the system should detect when old taste assumptions no longer fit.

## Hard Boundaries
State what adaptation must never do, including personal-memory leakage, blind mimicry, or turning references into copied identity.

## Review Notes
Explain how later slices should inspect whether adaptation stays bounded and useful.
```

Create `runtime/validation/validate-design-signal-truth.md` with these sections:

```md
# Validate Design Signal Truth

## Bounded Ingestion Checks
Verify the docs still describe bounded ingestion rather than uncontrolled crawling.

## Synthesis Truth Checks
Verify reference translation stays implementation-facing and does not become imitation.

## Adaptation Truth Checks
Verify owner-taste adaptation remains distinct from raw memory or creepy personalization.

## Review Questions for S05
List what final integration must preserve when assembling routing, fallback, critique, and adaptation surfaces.
```

Update `runtime/design-signals/design-signal-synthesis.md` if needed so it points at adaptation boundaries.

**Step 4: Run tests to verify they pass**

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/design-signals/owner-taste-adaptation.md') -and (Select-String -Path 'runtime/design-signals/owner-taste-adaptation.md' -Pattern 'preference drift')) { exit 0 } else { exit 1 }"`
Expected: PASS.

Run: `powershell -NoProfile -Command "if ((Test-Path 'runtime/validation/validate-design-signal-truth.md') -and (Select-String -Path 'runtime/validation/validate-design-signal-truth.md' -Pattern 'bounded ingestion')) { exit 0 } else { exit 1 }"`
Expected: PASS.

**Step 5: Commit**

```bash
git add runtime/design-signals/owner-taste-adaptation.md runtime/validation/validate-design-signal-truth.md runtime/design-signals/design-signal-synthesis.md
git commit -m "docs: define design signal truth surfaces"
```

### Task 4: Record the slice summary and handoff

**Files:**
- Create: `.gsd/milestones/M003-2cpdzh/slices/S04/S04-SUMMARY.md`
- Modify: `.gsd/STATE.md`
- Test: shell verification against `.gsd/milestones/M003-2cpdzh/slices/S04/S04-SUMMARY.md`

**Step 1: Write the failing test**

```bash
test -f .gsd/milestones/M003-2cpdzh/slices/S04/S04-SUMMARY.md
```

Expected now: FAIL because the file does not exist yet.

**Step 2: Run test to verify it fails**

Run: `test -f .gsd/milestones/M003-2cpdzh/slices/S04/S04-SUMMARY.md`
Expected: non-zero exit status.

**Step 3: Write minimal implementation**

Create `.gsd/milestones/M003-2cpdzh/slices/S04/S04-SUMMARY.md` with YAML frontmatter and concise sections for:

```md
---
title: S04 Summary
slice: S04
milestone: M003-2cpdzh
status: complete
---

## What changed
- Added bounded reference-ingestion contract
- Added design-signal synthesis outputs
- Added owner-taste adaptation and design-signal truth validation

## Verification
- List the file existence and PowerShell verification commands actually run

## Outcome
- State exactly what S04 now proves and what it still does not prove
```

Update `.gsd/STATE.md` so the next action points to `M003-2cpdzh/S05` once S04 is actually complete.

**Step 4: Run test to verify it passes**

Run: `test -f .gsd/milestones/M003-2cpdzh/slices/S04/S04-SUMMARY.md`
Expected: PASS.

**Step 5: Commit**

```bash
git add .gsd/milestones/M003-2cpdzh/slices/S04/S04-SUMMARY.md .gsd/STATE.md
git commit -m "docs: record M003 S04 completion"
```
