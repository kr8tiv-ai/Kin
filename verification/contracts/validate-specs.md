# Contract Validation for Cipher Runtime Baseline

## Goal

Provide explicit checks for the first real product-facing Cipher runtime assembly.

## Required Files

- `runtime/tenant/harness.yaml`
- `runtime/tenant/openclaw.json`
- `runtime/mission-control/packs/cipher-code-kraken-v1.md`
- `runtime/mission-control/packs/cipher-code-kraken-v1.meta.json`
- `runtime/tools/notebook-query/schema.json`
- `runtime/tools/notebook-query/README.md`
- `runtime/docs/onboarding.md`
- `runtime/docs/operations.md`
- `runtime/control/trust-ladder.md`
- `runtime/control/action-catalog.md`
- `runtime/control/tailscale-access.md`
- `runtime/website/quality-rubric.md`
- `runtime/website/workflow.md`
- `runtime/website/hosting-and-deployment.md`
- `runtime/website/library-guidance.md`
- `runtime/memory/personal-memory-boundary.md`
- `runtime/memory/transferable-state.md`
- `runtime/memory/secret-handling.md`
- `runtime/references/adaptive-reference-model.md`
- `runtime/references/trend-ingestion.md`
- `runtime/nft/continuity-model.md`

## Consistency Checks

1. `runtime/tenant/harness.yaml` and `runtime/tenant/openclaw.json` both keep Telegram enabled and WhatsApp disabled.
2. `runtime/tenant/harness.yaml` and `runtime/tenant/openclaw.json` both describe a local-first runtime with governed fallback support.
3. Harness, pack metadata, and pack file all agree on Cipher / Code Kraken identity and the `cipher-code-kraken@1` pack reference.
4. Runtime docs preserve Cipher's character-product coherence rather than describing a generic assistant.
5. Runtime control files encode a collaborative trust ladder rather than ambient machine control.
6. Runtime website files encode an explicit anti-slop quality posture, teaching loop, and deployment guidance.
7. Runtime memory/reference/NFT files keep personal memory, transferable state, and secrets separate.
8. Runtime docs do not claim NotebookLM transport or WhatsApp support are already live.

## Current Verification Result

- Required runtime files: present
- Telegram default-safe stance: present
- WhatsApp disabled-by-default stance: present
- Local-first runtime with fallback support: present
- Pack reference consistency: present
- Character coherence surfaces: present
- Collaborative control surfaces: present
- Anti-slop website loop surfaces: present
- Memory/reference/NFT boundary surfaces: present
- External transport wiring: not yet implemented

## Interpretation

The repo now contains a coherent first product-facing Cipher runtime surface with explicit control, website-quality, and ownership/memory boundaries, but not a fully live integrated service.
