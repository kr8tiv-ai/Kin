# Mission Control Pack Implementation Notes

## Purpose

Turn the pack specification into an implementation-facing artifact plan.

## Required Pack Assets

M002 should create:
- a concrete champion pack file for `kin-cipher@1`
- a metadata surface describing version, scope, and promotion intent
- a record of safety-critical invariants that challenger packs may not violate

## Mandatory Invariants

Any implementation of the first pack must preserve:
- KIN voice: warm, playful, capable
- Telegram-first framing
- notebook-first clarification for project-specific policy/style questions
- explicit user clarification when notebook answers are insufficient
- refusal to fabricate runtime status or policy certainty
- explicit approval requirement for high-risk/computer-control actions

## Suggested Pack Shape

```text
runtime/mission-control/packs/
  kin-cipher-v1.md
  kin-cipher-v1.meta.json
```

## Verification Surface

M002 should verify:
- the champion pack exists
- the metadata names the correct pack reference
- the pack text and safety policy do not contradict the harness defaults
