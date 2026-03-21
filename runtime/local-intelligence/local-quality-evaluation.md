# Local Quality Evaluation

## Purpose
Define how local output quality is judged before Cipher stays local or escalates.

This contract exists to make local quality evaluation implementation-facing and paired with the routing contract, not to present a benchmark suite or pretend that evaluation proof is stronger than it is. It keeps privacy/locality framing visible while protecting Cipher's premium website-builder identity.

Use this artifact alongside `runtime/local-intelligence/local-routing-contract.md`, `runtime/web-quality/anti-slop-critique-rubric.md`, and `runtime/validation/validate-local-intelligence-truth.md`. The routing contract decides the default route by task class; this document decides whether the local output quality is good enough to stay local; the anti-slop critique rubric defines concrete website-specific failure patterns; the validation artifact checks that routing, thresholds, and escalation claims stay aligned without overstating implementation proof.

## Evaluation Dimensions
Local output should be judged across the following dimensions.

- **Instruction following:** does the response keep the user's stated goal, constraints, format, references, and corrections in view without drifting?
- **Coherence:** does the response remain internally consistent, structurally legible, and clearly connected to the actual request?
- **Privacy suitability:** is the response safe and appropriate for local-first handling, especially when locality is part of the user promise?
- **Design specificity:** for website work, does the output provide concrete critique, structure, or direction rather than generic advice?
- **Taste alignment:** does the response reflect Cipher's anti-slop, premium website-builder posture instead of bland template-speak?
- **Action safety:** if the answer could influence user actions, are limits, uncertainty, and risk handled carefully rather than overconfidently?

No single dimension is enough by itself. A fluent answer can still fail if it drops constraints, turns generic, or becomes unsafe.

## Threshold Model
Use plain-language thresholds rather than fake numeric precision.

### Pass
The answer should be treated as a **pass** when it stays on task, preserves key constraints, remains coherent, and is strong enough for the task class defined in the routing contract.

For website work, pass requires specificity that could plausibly help produce or improve a premium site. For sensitive/private drafting, pass also requires that locality remains appropriate and no escalation need is visible from quality alone.

### Borderline
The answer should be treated as **borderline** when it is mostly usable but shows visible weakness that may still be recoverable locally.

Examples:
- the structure is sound but references are used thinly
- the website critique is directionally right but too generic or polite to be sharp
- the model follows most constraints but misses one important qualifier
- the answer is safe enough to continue but lacks confidence-worthy specificity

Borderline output should not be treated as a clean success. It is a signal to retry locally with a narrower frame or to ask a smaller clarifying question.

### Fail
The answer should be treated as a **fail** when the output is not trustworthy enough to stay local for this request.

Examples:
- it contradicts the user or forgets central constraints
- it becomes generic, clichéd, or empty on a website critique/ideation task
- it sounds certain without support on risky or factual matters
- it weakens the privacy/locality promise by pushing beyond what local handling can justify
- it creates action risk through brittle or overconfident guidance

Fail means the local path did not meet the contract for this request, even if the prose sounds smooth.

## Retry vs Escalate Rules
The next step depends on why the output is weak.

### Retry locally
Retry locally when the failure looks recoverable through tighter scope rather than stronger external capability.

Typical retry cases:
- instruction retention slipped but the task is still bounded
- the answer is borderline rather than failed
- the user is doing sensitive/private drafting where locality matters
- the task is website critique or ideation and the weakness looks like framing loss, not total taste failure

A local retry should narrow the ask, restate hard constraints, or focus the critique target instead of repeating the same broad prompt.

### Ask the user a narrower question
Ask a narrower user question when the local path is being asked to judge too many things at once or when taste quality depends on a missing preference, reference, or priority.

Typical ask cases:
- multiple website directions are plausible and the model lacks the user's preference signal
- the user wants critique, strategy, and implementation guidance all at once
- the prompt contains conflicting goals that need ranking

The question should reduce ambiguity, not offload the work.

### Escalate
Escalate when the local answer is failing in a way that a tighter prompt is unlikely to fix, or when the task itself exceeds what local quality can honestly support.

Typical escalation cases:
- repeated local output remains generic, incoherent, or constraint-dropping
- website guidance lacks the specificity or critique sharpness needed for Cipher's premium positioning
- the task needs broader research synthesis, richer reference comparison, or stronger reasoning depth
- the answer would influence risky browser/computer actions and local confidence is not sufficient

Escalation should follow the narration rules in the routing contract and should not be framed as proof that a live seamless stack already exists.

## Website-Specific Considerations
Website work needs a sharper bar than generic assistant quality.

- **Anti-slop web guidance:** advice should resist vague growth-language, startup clichés, and interchangeable landing-page formulas.
- **Reference usage:** when references, examples, or precedents are given, the output should translate them into concrete structural or aesthetic guidance rather than name-dropping them.
- **Critique sharpness:** critique should identify what is weak, why it is weak, and what better direction would look like. It should not hide behind soft generic approval.
- **Generic-template avoidance:** the answer should avoid canned hero/features/testimonials/checklist output unless that structure is specifically justified by the product and positioning.

For website critique and ideation, local output that is merely competent is often still below bar. The contract should protect premium taste, not just baseline usefulness.

## Failure Examples
These patterns should trigger escalation or, at minimum, prevent the answer from being treated as a pass.

- Repeating generic landing-page advice without engaging the actual product, audience, or references.
- Producing a polished-sounding critique that never makes a concrete judgment.
- Forgetting explicit constraints such as privacy, tone, section limits, or required source material.
- Giving risky action guidance with unjustified certainty.
- Turning a design or website request into broad motivational copy with no structural value.
- Name-dropping references or styles without translating them into usable decisions.
- Repeating borderline local retries that do not materially improve specificity, coherence, or safety.
