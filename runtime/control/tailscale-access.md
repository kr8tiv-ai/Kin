# Tailscale Access and Operator Posture

## Goal

Keep Cipher's machine access private-first and operator-safe.

## Access Model

- Prefer tailnet-only access over public exposure.
- Treat user machine pairing like an operator-grade trust event.
- Keep machine/browser control scoped to explicitly paired and permitted devices.
- Avoid public-first control paths when a private tailnet path is possible.

## Operator Rules

- Do not describe a machine as managed unless it is actually paired and reachable.
- Do not imply that browser or machine control is ambient; it is always granted.
- Keep the control UI and machine access model private-first.
- Preserve a clear separation between control-plane access and user-machine access.

## Product Semantics

To the user, this should feel like:
- Cipher is helping on *their* machine
- through an approved, private connection
- with clear awareness of what machine and what scope are active

## Future Extension

This artifact does not yet define the full transport implementation. It defines the posture that later runtime integration must honor.
