# M002 — First Runnable KIN Stack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first runnable KIN stack from the M001 baseline specs.

**Architecture:** Promote the baseline specification artifacts into runtime-facing files under a clear `runtime/` layout, then add minimal validation surfaces so the Telegram-first, Mission Control-governed, notebook-aware path is structurally real and locally verifiable.

**Tech Stack:** YAML/JSON/Markdown runtime artifacts, GSD planning artifacts, GPT-5.4-first model policy, Mission Control pack files, Notebook query tool contract, verification checklists.

---

### Task 1: Create runtime artifact skeleton

**Files:**
- Create: `runtime/tenant/harness.yaml`
- Create: `runtime/tenant/openclaw.json`
- Create: `runtime/mission-control/packs/kin-cipher-v1.md`
- Create: `runtime/mission-control/packs/kin-cipher-v1.meta.json`
- Create: `runtime/tools/notebook-query/schema.json`
- Create: `runtime/tools/notebook-query/README.md`

**Step 1: Write the minimal runtime artifacts from the baseline specs**
Promote the stable information from `specs/` into runtime-facing files without changing policy intent.

**Step 2: Verify file existence and internal consistency**
Check that pack reference, notebook tool name, and channel defaults agree.

**Step 3: Commit**
Commit the runtime skeleton once the baseline surfaces exist coherently.

### Task 2: Add onboarding and operations docs

**Files:**
- Create: `runtime/docs/onboarding.md`
- Create: `runtime/docs/operations.md`
- Modify: `verification/checklists/kin-baseline.md`

**Step 1: Promote onboarding guidance into runtime docs**
Create a runtime-facing onboarding doc based on the baseline concierge script.

**Step 2: Add operator guidance**
Document safe defaults, approval expectations, and known non-goals.

**Step 3: Verify docs reference the actual runtime files**
Ensure the docs point to the created runtime surfaces.

### Task 3: Add local verification surfaces

**Files:**
- Create: `verification/contracts/validate-specs.md`
- Optionally create minimal script(s) if the repo gains a runtime language/tooling choice

**Step 1: Define the contract checks**
List the exact runtime files and cross-file consistency checks that prove the baseline path is assembled.

**Step 2: Run the checks manually and record results**
Use explicit verification output or artifact inspection.

### Task 4: Close M002 baseline assembly

**Files:**
- Modify: `.gsd/REQUIREMENTS.md`
- Modify: `.gsd/STATE.md`
- Create: milestone/slice summaries as work completes

**Step 1: Reassess requirement status**
Update any requirements that became validated through real runtime/config assembly.

**Step 2: Summarize and verify**
Record what is actually proven and what remains deferred.
