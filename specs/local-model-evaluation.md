# Local Model Evaluation and Separation Rules

## Purpose

Preserve a clean separation between the primary KIN runtime model and the later specialized local creative-coding model.

## Separation Rules

1. GPT-5.4 remains the primary KIN assistant path until an explicit future policy changes that.
2. The local model is a specialized capability, not an implicit drop-in replacement.
3. Any future local-model integration must make the active model path visible to operators.
4. Evaluation of the local model should focus on niche creative-web tasks rather than general assistant behavior.

## Evaluation Dimensions

When the local model milestone arrives, compare it against the primary path on:
- adherence to the target web stack
- consistency of output structure
- motion/creative direction quality
- correctness of Three.js/GLSL reasoning
- performance-minded code habits

## Non-Goals

- Proving the local model beats frontier models at general reasoning
- Replacing all governed prompt/safety behavior with fine-tuning alone
- Hiding model routing decisions from operators

## M002 Relevance

M002 does not implement this path, but should keep runtime structure compatible with a future specialized-model integration.
