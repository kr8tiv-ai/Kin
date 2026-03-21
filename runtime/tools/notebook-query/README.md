# Notebook Query Tool

## Purpose

Provide the runtime-facing contract for Cipher's notebook-backed design, policy, and implementation knowledge.

## Contract File

- `schema.json` defines the `notebook_query` tool signature.

## Expected Behavior

- Use for design references, web libraries, policy questions, hosting explanations, and Cipher-specific context.
- Use it to enrich teaching, not to bluff certainty.
- If results are incomplete or conflicting, ask the user one focused clarification question.

## Integration Note

This directory defines the runtime-facing contract only. The actual NotebookLM transport or MCP implementation is still separate from this milestone artifact.
