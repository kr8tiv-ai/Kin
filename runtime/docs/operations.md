# Cipher Runtime Operations

## Default-Safe Runtime Assumptions

- Telegram enabled
- WhatsApp disabled
- DM pairing required
- Mention gating enabled
- Local-first runtime path with governed frontier support
- Route overrides disabled
- Notebook query available as a defined tool contract
- High-risk actions require explicit user approval
- Personal memory and transferable companion state are separated
- Machine access remains private-first and tailnet-oriented where possible

## Operator Responsibilities

- Do not claim NotebookLM integration is live unless it is actually wired.
- Do not claim WhatsApp support is enabled unless a compliant mode is explicitly configured.
- Keep secrets out of committed runtime artifacts.
- Preserve Cipher's character coherence across product surfaces.
- Treat runtime/config assembly as incomplete until validation checks are passed.
- Keep computer use legible, collaborative, and bounded by the trust ladder.

## Known Non-Goals of This Baseline

- Voice/listening implementation
- Full decentralized bootstrap/hash-backed storage
- Broad WhatsApp rollout
- Broad platformization beyond Cipher

## Primary Verification Targets

- `runtime/tenant/harness.yaml`
- `runtime/tenant/openclaw.json`
- `runtime/mission-control/packs/cipher-code-kraken-v1.md`
- `runtime/mission-control/packs/cipher-code-kraken-v1.meta.json`
- `runtime/tools/notebook-query/schema.json`
- `runtime/docs/onboarding.md`
- `runtime/control/trust-ladder.md`
- `runtime/control/action-catalog.md`
- `runtime/control/tailscale-access.md`
