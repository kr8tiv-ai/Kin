# Anti-Slop Website Critique Rubric

## Purpose
This artifact defines how Cipher identifies generic AI-web failure patterns when critiquing website work. It exists to make the critique bar explicit, implementation-facing, and reusable across website review prompts without pretending that taste can be reduced to a live automated scoring system.

Use it alongside `runtime/web-quality/revision-patterns.md`. This rubric names the failure; the revision patterns artifact defines the concrete upgrade move that should follow.

## Critique Categories
Use the following categories when reviewing website output for generic AI-web failure modes.

- **Generic structure:** interchangeable page architecture that could belong to almost any startup or agency site.
- **Vague positioning:** unclear product framing, weak audience targeting, or broad claims that never land on a specific promise.
- **Limp hierarchy:** weak prioritization of headlines, sections, calls to action, or proof, causing the page to read flat.
- **Cliché copy:** overused phrases, startup filler, motivational mush, and polished-sounding lines that say little.
- **Flat visual rhythm:** layouts with no meaningful contrast, pacing, emphasis, or compositional tension.
- **Safe-but-forgettable layouts:** technically acceptable structure that avoids mistakes by becoming bland and replaceable.
- **Reference misuse:** named references, styles, or precedents that are copied shallowly or cited without translation into concrete decisions.

## Failure Signatures
Each category should be tied to visible output patterns rather than abstract taste claims.

- **Generic structure** appears as default hero / features / testimonials / CTA sequencing with no clear product-specific reason for that order.
- **Vague positioning** appears as broad value statements, fuzzy audience language, or copy that could sell many unrelated products.
- **Limp hierarchy** appears as headings with similar emphasis, no decisive lead idea, buried proof, or calls to action with no narrative build.
- **Cliché copy** appears as lines such as "reimagine your workflow," "built for the future," or other premium-sounding filler that avoids specifics.
- **Flat visual rhythm** appears as uniform section treatment, repetitive card grids, even pacing everywhere, and no deliberate shifts in density or emphasis.
- **Safe-but-forgettable layouts** appear as clean but generic templates that avoid strong framing, memorable composition, or opinionated sequencing.
- **Reference misuse** appears as superficial mimicry, name-dropping, or style borrowing that does not explain what should change in structure, copy, or visual direction.

## Severity Language
Use plain severity language so critique can drive action.

- **Nudge:** a noticeable weakness that should be tightened, but the direction is still broadly viable.
- **Revise:** a meaningful quality problem that requires reworking the section, framing, or structure before it should be treated as good.
- **Reject:** the output is fundamentally too generic, too weak, or too misaligned to serve Cipher's premium website bar.

Severity should reflect whether the issue is local and repairable or whether the direction itself has collapsed into slop.

## Critique Response Rules
Critique should lead to action rather than aesthetic hand-waving.

- Name the failing category directly instead of implying it.
- Describe the visible failure signature, not just a vague feeling.
- Explain why the issue weakens the site for this product, audience, or positioning.
- Map the critique to the matching revision pattern in `runtime/web-quality/revision-patterns.md` whenever the next step is revision work.
- Prefer concrete revisions over taste performance: what should be removed, sharpened, reordered, or replaced.
- Avoid empty praise sandwiches that blur the judgment.
- Keep uncertainty honest; if the problem is preference-sensitive, say that without softening a clear failure.
- Do not claim objective scoring, model-backed certainty, or automated design judgment that does not exist.

## Non-Goals
This artifact does not claim live scoring, automated design judgment, or a complete theory of web taste. It does not prove that every critique can be mechanized, and it should not be used to overstate implementation maturity or pretend that Cipher already has a production-grade evaluation engine behind these categories.
