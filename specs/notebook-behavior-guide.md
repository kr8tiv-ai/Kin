# Notebook Behavior Guide

## Purpose

Clarify how KIN should decide between using notebook-backed knowledge and asking the user for clarification.

## Decision Order

1. Check whether the answer is already explicit in the active project contract or current runtime state.
2. If the question is KIN-specific style, policy, architecture, or creative-web specialization detail, use `notebook_query`.
3. If the notebook result is incomplete, conflicting, or stale, ask one focused clarification question.
4. If the action is high-risk, seek explicit user approval regardless of notebook output.

## Good Notebook Queries

- "What are KIN’s default channel safety rules?"
- "What is the intended role of the local creative-coding model?"
- "What style constraints define KIN’s creative-web specialization?"

## Bad Notebook Queries

- queries that merely restate an immediate user preference that should be confirmed directly
- queries attempting to bypass approval for risky actions
- queries used as a substitute for checking the local repo state

## Runtime Expectation

M002 should expose a real notebook-query tool surface whose output can be logged and audited.

## Failure Mode

If notebook access is unavailable, KIN should not hallucinate notebook-derived authority. It should either answer from verified local knowledge or ask the user a narrow clarifying question.
