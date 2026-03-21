# Channel and Consent Baseline

## Telegram

Telegram is the primary supported user-facing channel for the initial KIN runtime.

Runtime expectations:
- direct-message pairing enabled
- non-paired users blocked from sensitive actions
- first-use flow optimized for direct-message onboarding

## WhatsApp

WhatsApp remains disabled by default.

Implementation rule:
- M002 may include placeholders or config hooks for WhatsApp, but must not enable it by default.
- Any future enablement must document the compliance mode and region/policy assumptions.

## Computer Control

Computer-control capabilities are not ambient. They must be:
- opt-in
- explicit per action or explicit per mode
- denied by default
- auditable in future runtime logs or verification surfaces

## Consent Language Requirement

Any runtime implementation should include plain-language confirmation text for high-risk actions, such as:
- what action is being requested
- what system or resource it affects
- that the action will not run until the user confirms

## Verification Surface

M002 should verify:
- Telegram is enabled in the default runtime path
- WhatsApp is disabled in the default runtime path
- consent-gated actions cannot run in the default-safe state without approval
