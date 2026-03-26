# Provenance Disclosure Formatter Design

> Drafted for the next executable honesty behavior after precedence and promotion

## Goal
Add a small formatter that converts routing/provenance facts into consistent user-facing disclosure text.

## Why this next
The contract already emphasizes fallback honesty. The repo now has precedence and promotion behavior, but it still lacks an executable way to express provenance clearly to a user or review artifact.

## Recommended approach
Add a narrow formatter module that consumes a `RoutingProvenanceEvent` and returns a short disclosure string plus metadata.

## Proposed file
- `runtime_types/disclosure.py`

## Behavior
Given a provenance event, the formatter should produce a structured result such as:
- disclosure level (`none`, `brief`, `explicit`)
- user-facing text
- whether external help must be mentioned

## First-pass rules
- local mode with no fallback: brief or no disclosure
- hybrid mode: explicit disclosure
- external mode: explicit disclosure
- fallback refused: mention refusal if relevant to the result
- route reason should be summarized plainly, not dumped verbatim if it is messy

## Constraints
- no UI logic
- no rendering framework assumptions
- no mutation of events
- no policy engine

## Success criteria
- module imports cleanly
- formatter returns stable output for local, hybrid, external, and fallback-refused cases
- repo gains a first executable honesty/presentation behavior
