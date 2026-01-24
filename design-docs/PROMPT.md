You are implementing the 3D rendering system for Oscilla v2.

## Required Reading (do this FIRST, before any code)

1. `design-docs/_new/3d/ORIENTATION.md` — process rules, confidence scoring, anti-gaming rules
2. `design-docs/_new/3d/CONTEXT.md` — codebase map, existing data shapes, file locations, architectural invariants
3. `design-docs/_new/3d/DOD-3d-system.md` — overview, invariant quick-reference, process docs
4. The **two files in `design-docs/_new/3d/dod/`** — your floor level and your active level

## Process

**AUTONOMOUS EXECUTION — THIS IS NON-NEGOTIABLE:**
- Do NOT stop to ask for permission at any point.
- Do NOT present plans for review — they are auto-approved.
- Do NOT ask "would you like me to proceed?" or "shall I continue?" — the answer is always YES.
- Do NOT summarize what you found and wait — just do the work.
- Do NOT ask the user to confirm level advancement — advance immediately when criteria are met.
- The workflow is: read → plan → implement → score → advance → repeat.
- Keep going autonomously until you run out of work in the current level or hit a genuine blocker (broken prerequisite, ambiguous spec requiring human clarification, architectural conflict with no clear resolution).
- "Genuine blocker" does NOT include: needing to make implementation choices, choosing between valid approaches, or deciding what to work on next. Make those decisions yourself and keep moving.

You MUST use the `/do:plan` and `/do:it` skills for all work. No exceptions.

### Step 1: Find Your Level

The `dod/` directory contains exactly two files: the **floor** (previous level, invariant verified) and the **active level** (your work). Read both.

- If the active level has items at C2 or below: those are your priority.
- If the floor level has a broken test: STOP. Fix the regression first.

### Step 1.5: Verify Prerequisites

Your active level file has a **PREREQUISITES** section listing all invariants from prior levels that must hold. **Verify each one is actually satisfied before proceeding.** If any prerequisite is violated, that is the real work — fix it first, regardless of what checkbox scores say.

### Step 2: Plan

Run `/do:plan 3d-L{N}-{checkbox-description}` for the specific checkbox you're working on.

The plan skill will:
- Evaluate current state
- Surface ambiguities
- Generate sprint plans with acceptance criteria

Plans are auto-approved. Do not wait for user confirmation — proceed directly to Step 3.

**The DoD checkbox IS the acceptance criterion.** The plan's job is to determine HOW to satisfy it in a way that exercises the real system.

**Parallelism hint for planning:** If multiple checkboxes in the same level share no implementation dependency (e.g., independent unit tests that test different functions), you may plan them together in a single `/do:plan` invocation. State this explicitly in the plan: "Items X, Y, Z are independent and can be implemented in parallel."

### Step 3: Implement

Run `/do:it 3d-L{N}-{checkbox-description}` to implement.

The it skill will:
- Spawn iterative-implementer (no shortcuts, no workarounds)
- Run work-evaluator to verify with runtime evidence
- Loop until the acceptance criteria are met with real system behavior
- Surface deferred work

**Parallelism hint for implementation:** If your plan identified independent items, you may run multiple `/do:it` invocations covering those items in a single session. Each must still pass work-evaluator independently. Never parallelize items that write to the same file or share state.

### Step 4: Record Score

After `/do:it` completes successfully (work-evaluator confirms COMPLETE):

1. Append your score to the DoD review log:
   ```
   C{score} {worker-id} {MMDD} "{what you proved and how}"
   ```

2. Update the level status line in the DoD.

3. Commit: `3d L{level}: {short description}`

## What You Must NOT Do

- **Do NOT spawn your own reviewer subagents.** The work-evaluator in `/do:it` handles evaluation.
- **Do NOT run ad-hoc Task agents for implementation.** Use `/do:it` which spawns iterative-implementer.
- **Do NOT score a checkbox without runtime evidence.** "Tests pass" is necessary but not sufficient. The work-evaluator must confirm the system actually works.
- **Do NOT satisfy a checkbox by testing a different layer than what the checkbox describes.** See ORIENTATION.md "Score Disqualifiers."
- **Do NOT manually construct scenarios that the system should produce.** If a checkbox says "pipeline does X," your test must invoke the real pipeline.

## Rubric (for reference only — evaluation is done by work-evaluator)

This rubric describes what each confidence level means. You don't apply it yourself — the work-evaluator applies it through runtime evidence.

| Score | Meaning |
|-------|---------|
| C1 | Stub exists. Tests may fail. |
| C2 | Happy path works. Edges unhandled. May test wrong layer. |
| C3 | All tests pass against real system boundary. Implementation reasonable. |
| C4 | Next level's tests also pass. Reviewed. Implementation matches hints. |
| C5 | Textbook. Minimal code, maximal clarity. Mathematically provable. |

## Advancing a Level

When your active level has all items at C4+ (with 2+ scorers agreeing) AND the INVARIANT is verified, advance:

1. Move the current floor file to `dod/_completed/`
2. The active level becomes the new floor
3. Move the next level from `dod/_upcoming/` into `dod/`
4. Commit: `3d L{N}: level complete, advance to L{N+1}`
5. Continue working on the new active level

**C3 is NOT sufficient for advancement.** C3 means tests pass but the level has not been reviewed or validated by the next level. The level must reach C4+ before the floor moves.

The `dod/` directory must always contain exactly two files: floor + active.

## Constraints

- Do NOT work on more than one level per session.
- Do NOT start a level unless the PREREQUISITES in your level file are all satisfied.
- Do NOT stop to ask the user what to do next. Pick the next unscored checkbox and do it.
- If a lower level's test breaks, STOP. Add `!` regression, fix, then resume.
- Kernels are pure functions. No state, no side effects, no allocations, no runtime imports.
- All position data: `Float32Array`, stride 3. All screen output: `Float32Array`, stride 2.
- Read the Implementation Hints in the DoD. They exist because decisions that ignore them create walls at later levels.

## After Completing a Checkbox

After scoring a checkbox, do NOT stop. Immediately pick the next unscored checkbox in the active level and repeat the plan→implement→score cycle. Only stop when:
- All checkboxes in the active level are at C4+ with 2+ scorers (then advance the level and keep going)
- You hit a genuine blocker requiring human input

When you finally stop (end of session or blocker), report:
- Which checkboxes you completed and their scores
- Current level status: how many items at C4+, how many remain below C4
- Any concerns about architectural decisions that might not hold at higher levels
- All commits should use message format: `3d L{level}: {short checkbox description}`
