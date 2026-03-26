# Neutral Runtime Schema Package Design

> Drafted for post-M003 implementation follow-through

## Goal
Create a small neutral schema package that turns the M003/S05 runtime-truth and feedback-learning contract into real, portable implementation artifacts without prematurely inventing the full runtime architecture.

## Recommended approach
Add a `schemas/` package at repo root. Keep it implementation-agnostic and portable across future TypeScript, Python, or service-layer runtimes.

This package should be the first code-real layer that future runtime components consume.

## Why this approach
- The repo does not currently expose a verified application/source tree.
- The M003 work is already contract-heavy and implementation-light.
- A neutral schema package reduces architectural guesswork while making the rules executable.
- JSON Schema is portable and strict enough for governance-critical structures.

## Alternatives considered

### 1. Full runtime package now
Rejected for now.
Too much architecture invention for the current repo state.

### 2. Types only in a guessed `src/` tree
Rejected for now.
No evidence yet that a `src/` layout is the right long-term location.

### 3. Neutral schema package
Chosen.
Smallest real implementation surface with durable value.

## Package contents

### Core schemas
- `schemas/truth-surface.schema.json`
- `schemas/feedback-ledger-entry.schema.json`
- `schemas/preference-record.schema.json`
- `schemas/routing-provenance-event.schema.json`
- `schemas/promotion-decision-record.schema.json`

### Documentation
- `schemas/README.md`

### Examples
- `schemas/examples/truth-surface.example.json`
- `schemas/examples/feedback-ledger-entry.example.json`
- `schemas/examples/preference-record.example.json`
- `schemas/examples/routing-provenance-event.example.json`
- `schemas/examples/promotion-decision-record.example.json`

## Design rules

### Schema strictness
- Use required fields for all governance-critical properties.
- Use explicit enums wherever the S05 contract defines bounded states.
- Disallow additionalProperties by default unless there is a strong reason not to.
- Include `description` metadata for every field.

### No unsafe fields
The package must not define or encourage fields for:
- secrets
- credentials
- raw transcripts
- cross-tenant data
- vague inferred personality conclusions without provenance

### Portability
The package must stay neutral enough that future code can:
- generate TS types from schema
- validate Python payloads from schema
- validate storage payloads at service boundaries

## Behavioral guarantees encoded by schema
The schema package should make these behaviors structurally visible:
- scoped learning (`turn`, `project`, `owner`)
- provenance (`local-proven`, `hybrid-proven`, `external-only`, `not-yet-proven`)
- route mode (`local`, `hybrid`, `external`)
- fallback honesty (`fallback_used`, `fallback_refused`)
- conflict state (`active`, `superseded`, `contradicted`, `paused`)

## What not to build in this pass
- storage adapters
- routing engine
- promotion engine implementation
- dashboard/UI
- memory backend
- policy executor

## Verification
A first pass is complete when:
- all core schemas exist
- README explains intent and usage
- examples exist for each schema
- schema fields align with `.gsd/milestones/M003-2cpdzh/slices/S05/S05-RESEARCH.md`
- the package can serve as the contract for a future implementation milestone
