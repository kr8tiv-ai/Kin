# Feedback Learning Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define and add the first concrete runtime artifacts for Cipher’s feedback-learning integration model: truth surface schema, feedback ledger schema, preference/promotion rules, provenance events, and review checklists.

**Architecture:** Keep this slice artifact-first and schema-first. Do not invent runtime code yet unless the repo already contains an obvious implementation surface. First create explicit docs/spec files that define the contract future runtime code must obey, then add acceptance and negative-test artifacts that make the contract reviewable.

**Tech Stack:** Markdown artifacts in `.gsd/` and `docs/plans/`; repo-local schema/spec documentation; no assumed application framework.

---

### Task 1: Capture the runtime schema surfaces

**Files:**
- Create: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md`
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md`
- Test: manual review against `docs/plans/2026-03-20-feedback-learning-runtime-design.md`

**Step 1: Write the failing spec checklist**

Add a checklist section to `S05-RESEARCH.md` stating that the slice is incomplete until it contains explicit definitions for:
- truth surface fields
- feedback ledger entries
- preference records
- routing/provenance events
- promotion decision records

**Step 2: Verify the gap exists**

Run review by reading:
- `docs/plans/2026-03-20-feedback-learning-runtime-design.md`
- `.gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md`

Expected: concepts exist, but not yet as a compact schema-oriented research/spec artifact.

**Step 3: Write minimal implementation**

Create `S05-RESEARCH.md` with concrete field tables and field definitions for each runtime object.

**Step 4: Verify it passes**

Read `S05-RESEARCH.md` and confirm every runtime object has explicit minimum fields and exclusions.

**Step 5: Commit**

```bash
git add .gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md .gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md
git commit -m "docs: define feedback-learning runtime schemas"
```

### Task 2: Define promotion and conflict rules as a decision system

**Files:**
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md`
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md`
- Test: manual consistency check against `.gsd/REQUIREMENTS.md` and `.gsd/DECISIONS.md`

**Step 1: Write the failing rule list**

Add placeholders for unresolved questions:
- when feedback promotes from turn → project
- when feedback promotes from project → owner
- when learned rules decay or are demoted
- how conflicts resolve between spec, feedback, project preference, owner preference, and model prior

**Step 2: Verify the rules are incomplete**

Read existing `S05-SUMMARY.md` and confirm these rules exist conceptually but need a tighter decision-table form.

**Step 3: Write minimal implementation**

Add a compact decision table to `S05-RESEARCH.md` with:
- trigger
- condition
- action
- destination scope
- refusal/demotion conditions

**Step 4: Verify it passes**

Read the table and confirm it enforces:
- active spec > explicit current feedback > project preference > owner preference > model default
- no creepy or cross-tenant learning
- no overstating local capability from fallback-only wins

**Step 5: Commit**

```bash
git add .gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md .gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md
git commit -m "docs: define feedback promotion and conflict rules"
```

### Task 3: Define fallback provenance and honesty review rules

**Files:**
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md`
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md`
- Test: manual checklist review

**Step 1: Write the failing honesty checklist**

Add checklist items for missing behavior definitions:
- when fallback must be disclosed
- when fallback must be refused
- how learned rules are tagged by provenance
- how reviewers detect hidden fallback dependence

**Step 2: Verify the gap exists**

Read `S05-SUMMARY.md` and confirm the principles exist, but reviewer-facing rules need tightening.

**Step 3: Write minimal implementation**

Add a short “fallback honesty protocol” section to `S05-RESEARCH.md` with:
- disclosure triggers
- refusal cases
- provenance tag taxonomy (`local-proven`, `hybrid-proven`, `external-only`)
- reviewer signals for local-first drift

**Step 4: Verify it passes**

Read the section and confirm it would expose:
- silent substitution
- fallback-first drift
- impossible local expectations learned from external success

**Step 5: Commit**

```bash
git add .gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md .gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md
git commit -m "docs: define fallback honesty protocol"
```

### Task 4: Add acceptance and negative-test artifacts

**Files:**
- Create: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-UAT.md`
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md`
- Test: manual review of acceptance and red-team scenarios

**Step 1: Write the failing test checklist**

Add headings for:
- acceptance checklist
- negative tests
- reviewer evidence required

**Step 2: Verify the gap exists**

Read `S05-SUMMARY.md` and confirm the existing checklist is useful but not yet formalized as a UAT/reviewer artifact.

**Step 3: Write minimal implementation**

Create `S05-UAT.md` with:
- plain-language acceptance tests
- at least 10 negative tests
- expected reviewer-visible evidence for each

**Step 4: Verify it passes**

Read `S05-UAT.md` and confirm it covers:
- uncontrolled ingestion
- hidden fallback dependence
- broken learning/promotion
- spec-vs-taste conflicts
- creepy personalization
- performative critique loops

**Step 5: Commit**

```bash
git add .gsd/milestones/M003-2cpdzh/slices/S05/S05-UAT.md .gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md
git commit -m "docs: add integrated runtime truth acceptance tests"
```

### Task 5: Close the slice artifacts cleanly

**Files:**
- Modify: `.gsd/PROJECT.md`
- Modify: `.gsd/STATE.md`
- Modify: `.gsd/milestones/M003-2cpdzh/M003-ROADMAP.md`
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-PLAN.md`
- Modify: `.gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md`
- Test: read-back verification of final state

**Step 1: Write the failing completion checklist**

List the final state updates needed:
- mark S05 complete in roadmap
- mark plan tasks complete
- update project current state if materially changed
- update `STATE.md` next action

**Step 2: Verify the gap exists**

Read the current milestone and state artifacts.
Expected: S05 still appears in-progress or planning state.

**Step 3: Write minimal implementation**

Apply the state updates once all prior documentation artifacts exist and are internally consistent.

**Step 4: Verify it passes**

Read back:
- `.gsd/STATE.md`
- `.gsd/milestones/M003-2cpdzh/M003-ROADMAP.md`
- `.gsd/milestones/M003-2cpdzh/slices/S05/S05-PLAN.md`

Expected: the slice reads as complete and points clearly to the next milestone or slice.

**Step 5: Commit**

```bash
git add .gsd/PROJECT.md .gsd/STATE.md .gsd/milestones/M003-2cpdzh/M003-ROADMAP.md .gsd/milestones/M003-2cpdzh/slices/S05/S05-PLAN.md .gsd/milestones/M003-2cpdzh/slices/S05/S05-SUMMARY.md
git commit -m "docs: close M003 S05 runtime truth slice"
```
