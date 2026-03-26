# Secret Handling Posture

## Goal

Keep secrets encrypted, constrained, and out of ordinary product storage.

## Rules

- Secrets should be encrypted automatically.
- Secrets should not be kept in ordinary app-layer storage or plain internal systems.
- Cipher should not request secrets casually in chat.
- Secret-bearing actions remain meaningfully approval-gated.

## Separation

Secrets are not:
- personal memory
- transferable companion state
- ordinary product telemetry

## Product Rule

Trust in Cipher depends on users believing that sensitive access does not become generic product data.
