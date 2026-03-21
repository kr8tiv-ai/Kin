# Runtime Demo Script Design

> Drafted for the next restore point after the composed runtime-step service

## Goal
Add a small demo script that loads example payloads from `schemas/examples/` and runs them through the current runtime layer.

## Why this next
The repo now has enough pieces that a simple end-to-end demonstration is more valuable than another isolated helper. It provides a concrete restore point and makes the current layer easier to verify quickly.

## Recommended approach
Create a standalone Python script under `tools/` that:
- loads example JSON
- uses the parser bridge
- runs the composed runtime-step service
- prints a compact summary

## Proposed file
- `tools/demo_runtime_step.py`

## Expected output
At minimum, print:
- parsed truth surface loaded
- precedence winner
- disclosure level/text for a sample route event
- promotion decision

## Constraints
- no persistence
- no networking
- no UI
- no new dependencies

## Success criteria
- script runs from the repo root
- script demonstrates current runtime stack coherently
- output is readable enough for a future agent to use as a sanity check
