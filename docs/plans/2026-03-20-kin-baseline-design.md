# KIN Baseline Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the initial project contract and baseline architecture for a MeetYourKin-style KIN assistant from the canonical pasted synthesis.

**Architecture:** The first milestone is spec-first because the repository is greenfield. We define the governed KIN baseline as a set of GSD artifacts covering project contract, requirements, decisions, milestone context, and roadmap. The next implementation milestone will build runnable runtime/config assets from this baseline.

**Tech Stack:** GSD 2 artifacts, GPT-5.4-first architecture, OpenClaw-compatible runtime concepts, Mission Control-compatible governance, NotebookLM-backed clarification design.

---

## Validated design summary

### Recommended approach
Use the pasted NotebookLM/Claude/ChatGPT synthesis as the initial product brief, but normalize it into GSD artifacts instead of treating it as implementation-ready truth. This gives the repo a stable baseline without locking every research claim in as verified fact.

### Alternative approaches considered
1. Paste the research directly into the repo as a giant source note. Faster, but it would blur verified architecture, speculative claims, and implementation guidance.
2. Wait to write anything until all external claims are independently verified. Safer, but it would stall the project before establishing a usable baseline.
3. **Recommended:** Convert the synthesis into explicit project contract artifacts, keep external-claim uncertainty visible, and defer hard verification to implementation slices.

### Design sections

#### 1. Scope of M001
M001 establishes the KIN baseline only. It does not promise a runnable production assistant, local-model training, NFT gating, or a compliant WhatsApp rollout. Its job is to convert the research brief into a clear architecture and execution contract.

#### 2. Core architectural stance
The baseline assumes GPT-5.4 is the primary runtime model, Telegram is the primary launch surface, Mission Control governs prompts and policy, NotebookLM is the clarification layer, and local creative-coding models remain a later specialized path.

#### 3. Safety and governance stance
High-agency behavior is default-deny. Pairing, mention gating, route locks, explicit consent for computer control, and governed prompt packs are all baseline requirements, not optional hardening.

#### 4. Handoff into implementation
The next milestone should build the first runnable stack from these specs: likely harness configuration, prompt-pack artifacts, notebook-query tool contract, onboarding docs, and validation checks.
