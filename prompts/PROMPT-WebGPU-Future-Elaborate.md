# WebGPU Future Elaboration Prompt

You are starting with fresh context in the `oscilla-animator-v2` repository.

Your job is to **elaborate and harden the unattended `WebGPU-Future` implementation loop** so it is safe to run end-to-end without relying on human interpretation of vague checkpoints.

This is not a prompt to redesign the `WebGPU-Future` architecture itself.

The architecture docs, loop docs, and first-pass `FUTURE-*` implementation backlog already exist.

Your job is to identify and close the remaining **workflow design gaps** so another agent can execute the roadmap deterministically.

`// [LAW:one-source-of-truth] The numbered `docs/WebGPU-Future/` stack, the new loop docs, and the `FUTURE-*` implementation tickets are the current authoritative sources. This prompt exists to tighten them, not replace them.`
`// [LAW:verifiable-goals] The missing work is specifically the places where the unattended workflow still lacks exact proof boundaries, exact tracker ownership, or exact execution rules.`

## Existing Context

The repository already has:

- a numbered `docs/WebGPU-Future/` document stack
- a first visible WebGPU triangle rendering in the app
- a dedicated unattended two-agent loop for `WebGPU-Future`
- a `FUTURE-EPIC` plus `FUTURE-01` through `FUTURE-10` implementation backlog in `lit`

The core loop artifacts already created are:

- `docs/WebGPU-Future-Agent-Loop.md`
- `PROMPT-WEBGPU-FUTURE-PROGRESS.md`
- `PROMPT-WEBGPU-FUTURE-EVALUATOR.md`
- `docs/WebGPU-Future/README.md` section `## 9. Unattended Loop`

The current tracker items already created are:

- `FUTURE-EPIC` — `lit-b90e7a20-282316eb`
- `FUTURE-01` — `lit-b90e7a20-25f6b7a5`
- `FUTURE-02` — `lit-b90e7a20-d43bceb0`
- `FUTURE-03` — `lit-b90e7a20-7c71ed73`
- `FUTURE-04` — `lit-b90e7a20-d455b883`
- `FUTURE-05` — `lit-b90e7a20-d5e200c4`
- `FUTURE-06` — `lit-b90e7a20-4f51cb9c`
- `FUTURE-07` — `lit-b90e7a20-98de4f8d`
- `FUTURE-08` — `lit-b90e7a20-bb2b2bcb`
- `FUTURE-09` — `lit-b90e7a20-55facbd8`
- `FUTURE-10` — `lit-b90e7a20-4c09d6e3`

The first ready implementation ticket should be `FUTURE-01`, but the loop is **not fully elaborate yet**.

## What Already Works

The current design is good enough in these ways:

1. There is now a dedicated `FUTURE-*` implementation chain separate from the earlier document-authoring tickets.
2. The implementer/evaluator split exists and follows the same general spec-constrained structure as the `RECOVER-*` loop.
3. The loop has a dedicated note file:
   - `session-docs/WEBGPU-FUTURE-LOOP.md`
4. The loop already names high-level proof ladders for:
   - render boundary / compatibility work
   - patch / authoring model work
   - UI work
   - simulation work
5. The `FUTURE-*` tickets already have much better structure than the original empty design-doc tasks:
   - objective
   - source docs
   - scope notes
   - required implementation details
   - acceptance criteria

## Where The Design Is Still Incomplete

This is the key part of the prompt.

The current loop is **usable but not yet fully unattended-safe**.

These are the known remaining gaps:

### 1. Proof baselines are conceptual, not operational

The loop defines baselines such as:

- render liveness
- canonical scene submission
- legacy compatibility
- canonical authoring MVP

But it does **not** yet define:

- the exact commands to replay each baseline
- the exact demo fixtures to use
- the exact expected artifacts
- the exact evidence that counts as acceptance proof versus supporting signal

This means two agents could both claim they “replayed the baseline” while running different checks.

`// [LAW:verifiable-goals] A baseline is incomplete until it is expressed as exact replayable commands and exact expected evidence.`

### 2. UI verification is still conditional instead of mandatory

The current loop wording still says things like:

- “when local automation exists”
- “when available”

That is not strong enough for unattended `FUTURE-08` and `FUTURE-10`.

The loop still needs:

- exact UI smoke commands
- exact browser automation steps
- exact assertions for success/failure
- exact fallback behavior if UI automation truly cannot run

### 3. Tracker cleanup and tracker authority are incomplete

The `FUTURE-*` chain exists, but the older open design-doc tickets still remain in `lit ready`.

That means the prompts currently rely on **prompt instructions** to ignore stale tracker noise instead of the tracker state itself being clean.

The workflow still needs:

- a decision on whether to close, supersede, or otherwise neutralize the stale design-doc tickets
- clear tracker ownership so `lit ready` matches intended unattended behavior

### 4. Cross-backlog ownership is not explicit enough

The current loop excludes unrelated `RECOVER-*` work, but several `FUTURE-*` tickets overlap code areas that are also touched by runtime/WebGPU recovery tickets.

Right now there is no fully explicit rule for:

- whether `FUTURE-*` is blocked by some `RECOVER-*` work
- whether `FUTURE-*` supersedes any existing runtime tickets
- which dependencies must be expressed directly in the tracker

This creates a real risk of two unattended streams claiming the same boundary.

`// [LAW:one-way-deps] Dependency direction and ownership preemption must be explicit when two backlogs overlap the same runtime seams.`

### 5. Several `FUTURE-*` tickets are still too broad

The ticket chain is much better than before, but several tickets still use language like:

- “Primary file areas likely include”
- “targeted tests pass”
- “relevant runtime/readback checks”

That is still looser than the stronger reference tickets in the repo.

Several tickets, especially later ones, likely still need:

- smaller child tickets
- exact commands
- exact proof fixtures
- clearer non-goals
- clearer ownership boundaries

This is especially true for:

- `FUTURE-04`
- `FUTURE-05`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### 6. There is no seeded evaluator note yet

The loop defines the note format but does not yet create the first canonical note file that locks:

- the first active ticket
- the first expected baselines
- the first exact proof plan

That means the loop can still start from a cold ambiguous state.

The unattended workflow should likely begin with a seeded:

- `session-docs/WEBGPU-FUTURE-LOOP.md`

that explicitly locks `FUTURE-01` and the expected first proof set.

## The Three Biggest Missing Pieces

If you need to prioritize, prioritize these:

1. Define one baseline matrix with exact commands, fixtures, and expected evidence.
2. Tighten the broad `FUTURE-*` tickets into stronger leaf tickets or stronger exact acceptance commands.
3. Clean up tracker ownership so the loop no longer depends on ignoring stale ready work by prompt instruction alone.

## Your Task

You are not here to re-explain the gaps.

You are here to **close them**.

Your goal is to elaborate the `WebGPU-Future` unattended workflow until another agent can start from scratch and execute the roadmap with minimal ambiguity.

## Mandatory Inputs To Read

Read these first:

- `/Users/bmf/code/oscilla-animator-v2/AGENTS.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/Spec-Constrained-Agent-Loop.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Agent-Loop.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future-Agent-Loop.md`
- `/Users/bmf/code/oscilla-animator-v2/PROMPT-WEBGPU-FUTURE-PROGRESS.md`
- `/Users/bmf/code/oscilla-animator-v2/PROMPT-WEBGPU-FUTURE-EVALUATOR.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/README.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/9-CANONICAL-IMPLEMENTATION-ROADMAP.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/1-CANONICAL-RENDER-SINK-DESIGN.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/2-COMPATIBILITY-MIGRATION-PLAN.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/3-CANONICAL-PATCH-STRUCTURE-DESIGN.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/4-CANONICAL-AUTHORING-MODEL-DESIGN.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/5-CANONICAL-AUTHORING-GUARDRAILS.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/6-CANONICAL-AUTHORING-BLOCK-CATALOG.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/7-CANONICAL-AUTHORING-UI-DESIGN.md`
- `/Users/bmf/code/oscilla-animator-v2/docs/WebGPU-Future/8-CANONICAL-PHYSICS-AUTHORING-DESIGN.md`

Then inspect the current tracker state for:

- `lit-b90e7a20-a01d1662`
- `lit-b90e7a20-282316eb`
- `lit-b90e7a20-25f6b7a5`
- `lit-b90e7a20-d43bceb0`
- `lit-b90e7a20-7c71ed73`
- `lit-b90e7a20-d455b883`
- `lit-b90e7a20-d5e200c4`
- `lit-b90e7a20-4f51cb9c`
- `lit-b90e7a20-98de4f8d`
- `lit-b90e7a20-bb2b2bcb`
- `lit-b90e7a20-55facbd8`
- `lit-b90e7a20-4c09d6e3`

When relevant, also inspect existing proof-related surfaces such as:

- `/Users/bmf/code/oscilla-animator-v2/src/demo/__tests__/gpu-bootstrap-demo.test.ts`
- `/Users/bmf/code/oscilla-animator-v2/src/services/__tests__/GpuPatchCompatibility.test.ts`
- `/Users/bmf/code/oscilla-animator-v2/scripts/get-screenshot-of-demo-patch.sh`
- `/Users/bmf/code/oscilla-animator-v2/scripts/webgpu-readiness-check.mjs`
- `/Users/bmf/code/oscilla-animator-v2/scripts/run-native-webgpu-gates.sh`

## What To Produce

You should produce whatever combination is needed to remove the ambiguity, including some or all of:

1. A baseline proof matrix document with:
   - baseline name
   - exact command(s)
   - exact fixture(s)
   - exact expected artifact(s)
   - classification of evidence
   - which `FUTURE-*` tickets must replay it

2. Stronger prompt docs, if the current prompts still leave unsafe ambiguity.

3. A seeded `session-docs/WEBGPU-FUTURE-LOOP.md` if that is the correct next step.

4. Tracker cleanup:
   - close/supersede stale design-doc tickets if appropriate
   - add explicit dependencies where cross-backlog overlap exists

5. Stronger `FUTURE-*` ticket bodies:
   - exact commands
   - exact proof fixtures
   - smaller child tickets where needed
   - tighter non-goals

## What To Avoid

Do not do any of the following:

1. Do not redesign the underlying `WebGPU-Future` architecture.
2. Do not widen `FUTURE-*` scope into generic WebGPU cleanup.
3. Do not leave proof definitions at the “run relevant checks” level.
4. Do not treat tracker ambiguity as acceptable just because the prompts can work around it.
5. Do not create a second loop memory source besides the ticket state, git state, and evaluator note.
6. Do not create parallel ticket chains for the same roadmap phase unless you can justify the split mechanically.

## Working Method

1. Start from the current loop artifacts and ticket chain.
2. Identify every place where a fresh agent would still need to guess.
3. Replace guesswork with:
   - exact commands
   - exact artifacts
   - exact tracker relationships
   - exact ownership rules
4. Prefer tightening existing artifacts over creating redundant new ones.
5. If you split tickets, split by proof boundary or ownership boundary, not by arbitrary file count.

## Done Bar

You are done only when:

- the baseline proofs are operationalized, not merely described
- UI verification is explicit enough for unattended use
- tracker ownership and stale-ticket handling are explicit
- cross-backlog overlap is resolved clearly enough to prevent ownership drift
- the broadest `FUTURE-*` tickets are tightened to the level of the stronger reference tickets in the repo
- a fresh agent could start from scratch and know exactly what to run, what to verify, and what ticket owns the work
