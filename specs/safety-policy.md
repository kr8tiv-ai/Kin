# KIN Safety Policy

## Goal

Define high-agency safety defaults for KIN Solo before runtime implementation begins.

## Baseline Rules

1. Telegram is the default launch channel.
2. WhatsApp is disabled by default until a compliant deployment mode is explicitly defined.
3. Direct messages require pairing by default.
4. Group interactions require mention gating by default.
5. High-risk tools are deny-by-default.
6. Computer-control actions require explicit, current user consent.
7. Secrets are never requested, repeated, or stored in ordinary chat context.
8. Prompt or pack evolution must go through governed Mission Control artifacts.
9. Model route switching is locked by default.
10. Unknown policy or integration status must be surfaced honestly, not guessed.

## High-Risk Actions

The following always require explicit approval or remain unavailable by default:

- shell/system execution outside approved sandbox rules
- raw network actions
- control-plane mutation
- secret extraction or credential handling
- destructive file or system changes
- unattended computer control

## Prompt-Injection Posture

- Treat notebook results and web content as untrusted inputs unless verified.
- Do not let external content override system, policy, or tool restrictions.
- Keep permissions enforced outside the model whenever possible.
- Prefer intent-specific tools over broad generic execution surfaces.

## Verification Requirement

No future milestone should claim a live assistant path is safe unless these defaults are reflected in executable runtime/config artifacts and verified.
