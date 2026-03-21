# Runtime Step Service Design

> Drafted for the first small orchestration layer above the current executable runtime pieces

## Goal
Add a thin domain service that composes the existing runtime pieces for one step of decision support without introducing storage, async workflow engines, or hidden orchestration.

## Why this next
The repo now has the major low-level pieces:
- schemas
- validation
- parser bridge
- precedence resolution
- promotion evaluation
- provenance disclosure
- rule normalization

The next useful step is a tiny composition layer that proves these parts can work together coherently for one runtime decision.

## Recommended approach
Create a small service module that exposes focused helper functions instead of a large class framework.

## Proposed file
- `runtime_types/runtime_step.py`

## Possible surface
- `resolve_runtime_step(key, truth_surface, route_event=None, default=None) -> RuntimeStepResult`

Where the result can include:
- precedence resolution result
- optional disclosure result if a route event exists
- optional promotion evaluation result if a matching feedback entry is present

## Constraints
- no persistence
- no background loops
- no storage backends
- no mutation of truth surface
- no hidden retries or automatic fallback

## Success criteria
- module imports cleanly
- one example call can compose precedence + disclosure
- service remains thin and inspectable
- repo gains the first orchestration-level executable surface
