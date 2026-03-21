# Reference Ingestion Contract

## Purpose
This artifact defines what design and reference material may be gathered, why it may be gathered, and how it must be handled before it becomes reusable input. The goal is to keep reference ingestion bounded, implementation-facing, privacy-aware, and honest about proof level.

This contract supports later critique, revision, and taste-calibration work without implying that broad scraping, passive surveillance, or unbounded crawling is acceptable.

## Source Classes
Allowed source classes include the following bounded categories:

- design articles that explain layout, hierarchy, interaction, or presentation choices
- site references used to study structure, tone, composition, or UX patterns
- component examples that show specific interface treatments or implementation-facing patterns
- visual trends gathered to understand current conventions without treating trends as requirements
- owner-provided references supplied directly as examples, inspiration, or constraints

These source classes are inputs for interpretation, not direct templates to be copied wholesale.

## Allowed Ingestion Intents
Reference material may be gathered only for clear, bounded intents such as the following:

- critique support, where references help explain why a direction feels weak, strong, inconsistent, or misaligned
- taste calibration, where references help align output with a stated quality bar, style preference, or brand posture
- structure study, where references help identify reusable information architecture, layout logic, or interaction framing
- reference translation, where outside material is converted into implementation-facing guidance that fits the current product and task

If the intent is vague, novelty-seeking for its own sake, or detached from the active work, ingestion should not proceed.

## Filtering Rules
Before a gathered reference becomes a reusable signal, it must be filtered, reduced, or translated.

- remove private, personal, or account-specific details
- strip tracking context, incidental metadata, and any irrelevant page noise
- reduce expressive surface detail into the smallest useful signal, such as a pattern, contrast, hierarchy cue, or interaction lesson
- translate references into implementation-facing guidance instead of preserving them as authority objects
- separate observed style, inferred rationale, and actual proof so later work does not overclaim certainty
- avoid direct copying of distinctive protected expression when the actual need is pattern understanding or critique support

The output of ingestion should be a bounded signal that can be explained plainly, not a pile of raw reference material.

The primary output surface for that translation is `runtime/design-signals/design-signal-synthesis.md`, where filtered references are expressed as reusable signal cards and synthesis rules instead of raw inspiration dumps.

## Stop Conditions
Ingestion should stop when the signal becomes noisy, repetitive, privacy-sensitive, or outside scope.

Stop when:

- additional references are repeating the same point without changing the decision surface
- the material introduces privacy, consent, or surveillance concerns
- the gathered examples drift away from the active product, task, or owner-stated taste target
- the reference quality is too inconsistent to support honest interpretation
- the process starts to reward accumulation over understanding
- the material would pressure later stages to mimic instead of reason

When a stop condition is hit, the correct action is to summarize the bounded signal already gathered or decline further ingestion.

## Non-Goals
This document does not authorize uncontrolled crawling.

This document does not treat every reference as truth.

This document does not claim that external references are proof of user need, correctness, or quality.

This document does not permit hidden collection practices, creepy monitoring, or vague "inspiration" gathering without a task-bound reason.
