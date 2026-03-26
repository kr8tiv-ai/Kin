# Why this exists, what we're building, and how the file-writing problem fits into it

## Why

A lot of AI tooling still has the same basic failure mode: it can generate text fast, but it cannot keep truth straight once the work gets long, concurrent, stateful, or user-shaped.

That becomes obvious the moment you try to build something more serious than a toy assistant.

If the system is supposed to:
- stay local-first when possible,
- admit when it used external help,
- learn from feedback without turning into sludge,
- keep project taste separate from owner taste,
- and survive parallel execution without corrupting its own state,

then "just prompt the model better" is not enough.

You need a runtime truth surface.
You need explicit contracts.
You need a way to say what rule wins, what got learned, what did not get learned, and why.

That is what this repo is for.

It is not a finished product. It is the contract layer and executable logic scaffold for a system that is trying to behave like a real runtime instead of a vibes-only wrapper around an API.

## What we're building

The immediate work in this repo is a small, testable runtime contract for KR8TIV-style systems.

Right now that means four things:

1. **Truth surfaces**
   A structured description of the current active state before a step runs:
   - active spec
   - policy
   - task state
   - project preferences
   - owner preferences
   - explicit feedback
   - behavioral signals
   - disclosure state

2. **Decision helpers**
   Small executable helpers for questions like:
   - does active spec win here?
   - should this feedback stay local or promote?
   - does this route need explicit disclosure?
   - did the user repair the output, quietly accept it, or ignore it?

3. **Behavioral shaping instead of just verbal shaping**
   We are trying to make the system learn not only from what the user says, but from what actually survives contact with reality.

   That means the shaping signals include:
   - explicit corrections
   - repeated acceptance without edits
   - suggestions that were not adopted
   - outputs that had to be repaired
   - patterns that were reverted after the fact

   In other words: the model should be shaped by what sticks, what gets fixed, and what quietly dies.

4. **Auditability**
   If a promotion decision happened, we want to know:
   - what the decision was
   - whether behavioral evidence blocked it
   - whether acceptance supported it
   - whether provenance makes it suspicious

   Not because dashboards are exciting, but because this kind of system becomes impossible to debug if it only emits vibes and outcomes.

## What we're working on right now

The current repo state is centered on a schema-first and Python-first contract surface:

- `schemas/`
  Portable JSON Schemas for the core runtime objects.

- `runtime_types/`
  Python `TypedDict` contracts and thin runtime helpers.

- `tools/`
  A schema validator, a demo script, and a scenario harness.

- `tests/`
  Stdlib tests that exercise precedence, promotion, disclosure, parser boundaries, behavioral shaping, and audit summaries.

The current executable behavior includes:
- precedence resolution
- feedback selection
- promotion evaluation
- behavioral signal summarization
- provenance disclosure formatting
- promotion audit formatting
- composed runtime-step evaluation

That is still deliberately small. No storage backend. No orchestration layer. No dashboard. No persistence service. No giant ontology.

The point is to get the contract and the decision semantics right first.

## The product shape behind the contract

The broader KR8TIV/Cipher direction behind this repo is not a generic assistant.

The target shape is something closer to:
- a continuous companion identity,
- unusually strong creative-web taste,
- local-first runtime behavior,
- governed fallback when local is not enough,
- explicit honesty about route and provenance,
- and learning that stays bounded instead of becoming manipulative or mushy.

You can see the surrounding material in:
- `runtime/`
- `specs/`
- `verification/`

Those files are doing the less glamorous but more important work of pinning down the system's actual behavior instead of leaving it as a blob of product adjectives.

## Credits, lineage, and what is borrowed

This repo is not pretending to have emerged from nowhere.

Important lineage and upstream influence includes:

- **OpenClaw / Mission Control direction**
  Parts of the surrounding KR8TIV architecture clearly inherit from or build on OpenClaw-style control-plane and Mission Control ideas. Where KR8TIV-specific packs or runtime notes fork or adapt those ideas, the repo should say so plainly rather than laundering them into "original framework" mythology.

- **KR8TIV org runtime work**
  Existing public repos in the `kr8tiv-ai` org already cover adjacent surfaces such as Mission Control and operator/team infrastructure. This repo is narrower: it is the runtime truth contract layer.

- **Node.js ecosystem lessons**
  The file-writing guidance below is informed by the long tail of pain around Node filesystem concurrency on Windows, and by the ecosystem work that emerged to survive it. In particular, the practical recommendation to prefer `atomically` over older patterns comes from that broader community experience rather than from anything invented here.

- **Model/provider reality**
  The surrounding KR8TIV stack explicitly contemplates a local-first route with governed fallback to frontier providers when needed. If external model providers are used, the system should disclose that cleanly rather than pretending all useful work came from one magical local box.

This is a contract repo, not a mythology engine.

## Why the Node atomic-write problem matters here

This repo is mostly schema/spec/Python right now, but the filesystem problem is still directly relevant.

The short version is:

- POSIX systems usually make write-and-rename workflows fairly clean.
- Windows does not.
- On Windows, transient locks from antivirus scanners, indexers, and normal file-handle behavior can make a perfectly reasonable atomic write fail with:
  - `EPERM`
  - `EACCES`
  - `EBUSY`

If you are building a concurrent Node.js system that writes shared runtime state, this is not a weird edge case. It is normal operating weather.

That matters because a future implementation of this runtime truth surface in Node will almost certainly need to persist things like:
- truth surfaces
- promotion ledgers
- provenance events
- agent-local state
- queue or coordination metadata

If those writes are naive, the runtime will eventually lie to itself, corrupt its own state, or crash under parallel load.

### The practical guidance

For a future Node implementation, the clean rule is:

- do **not** rely on bare `fs` writes for shared mutable state
- do **not** assume rename is enough on Windows
- do **not** treat transient lock failures as exceptional
- do use:
  - atomic replace semantics
  - retries/backoff for transient lock failures
  - per-path serialization or queueing for competing writes

Based on the current ecosystem, the most sensible default recommendation is:

- use **`atomically`** for Node-side atomic file writes

Why that recommendation is attractive:
- purpose-built for atomic writes
- handles transient Windows lock conditions better than older naive approaches
- supports retry behavior instead of immediate failure
- avoids relying on global monkey-patching as the main strategy
- fits the actual problem: many concurrent writes to a small set of important files

This does **not** mean every file operation in the wider system needs a heavy abstraction. It means the files that define truth, learning, and coordination should be treated as critical state, not as casual temp output.

## The style of engineering we're aiming for

The tone here is probably a little unusual on purpose.

This is not trying to sound like a startup landing page, and it is also not trying to disappear into academic neutrality.

The actual stance is closer to this:

- we want the system to feel alive and useful
- but we do not trust "alive and useful" unless the contracts are explicit
- we want local-first behavior
- but we do not want fake local-first claims
- we want adaptation
- but we do not want unbounded learned sludge
- we want concurrency
- but we do not want state corruption disguised as speed

So the repo is trying to hold both halves at once:
- the vibe-coded reason for building it
- the painfully specific systems work required to make that vibe survive real execution

## Where this should go next

The current repo is in a good prototype-contract state, but the next useful layers are pretty obvious:

1. **Node-side persistence adapter**
   A minimal implementation for atomic truth-surface and ledger writes using a library like `atomically`.

2. **Richer persistence contracts**
   Structured records for:
   - promotion decisions
   - route/provenance history
   - learning vetoes
   - repair/non-adoption accumulation over time

3. **Cross-language parity**
   The Python helper surface is enough to prove semantics, but eventually the Node side should be able to enforce the same contract without drift.

4. **Better reporting surfaces**
   The runtime already emits compact audit summaries. The next step is turning those into reliable, boring observability instead of debugging folklore.

## Bottom line

We are building the part that most AI products try to skip:

the part where the system has to keep its own truth straight.

That includes:
- explicit rule precedence
- bounded learning
- behavioral shaping
- route honesty
- and state mutation that can survive real concurrent execution on real operating systems

It is less glamorous than a demo reel.
It is also the part that makes the rest of the stack real.
