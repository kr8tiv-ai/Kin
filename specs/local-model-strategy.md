# Local Model Strategy

## Role in the Product

The local model is not the primary baseline runtime for KIN. It is a specialized fallback or companion capability focused on agency-style creative web development under constrained hardware conditions.

## Current Position

- Primary model path: GPT-5.4
- Local path: later milestone
- Hardware target: 6 GB VRAM class laptop GPU
- Likely specialization: vanilla JS, Three.js/WebGL, GSAP/ScrollTrigger, Lenis, Tailwind, related motion patterns

## Why Defer It

The project’s immediate value depends more on getting the governed assistant architecture right than on training the specialist model first. A poorly governed local model path would not solve the core product problem.

## Future Milestone Expectations

A later milestone should define:
- base-model choice
- dataset specification
- training workflow
- quantization/export path
- evaluation against the target creative-web niche
- how the specialized model is exposed to KIN without confusing it with the primary assistant runtime

## Guardrail

The local model should never silently replace the primary model path without explicit policy and verification.
