# Harness Implementation Notes

## Purpose

Translate `specs/kin-solo-harness.yaml` into concrete expectations for the first runnable KIN baseline.

## Required Runtime Fields

M002 should produce a runtime harness artifact with at least:
- tenant identifier
- display name and role
- soul truths, voice, and boundaries
- channel flags with Telegram enabled and WhatsApp disabled by default
- DM pairing and mention gating enabled
- explicit tool allow/deny policy
- model route policy with GPT-5.4 primary and route locks enabled
- control-plane URL, token path, and pack reference

## Non-Negotiable Defaults

- `persona.mode` must remain `individual`
- `persona.orchestratorEnabled` must remain `false`
- `allowRuntimeOverride` must remain `false` unless explicitly revisited
- `whatsapp` must remain `false` in the default runtime artifact
- `notebook.query` must be treated as allowed only if backed by a real tool implementation

## Open Questions for M002

- What exact OpenClaw-compatible schema version will the runtime harness target?
- Which fields must be renamed or transformed by the harness compiler layer?
- Where should secret-bearing runtime values be injected at deploy time versus compiled statically?

## Verification Surface

M002 should verify:
- the runtime harness file is structurally valid
- the default-safe fields are present and correctly set
- the pack reference resolves to a concrete Mission Control pack artifact
