# 3D System: Orientation

You're implementing a 3D rendering system for Oscilla v2. This document tells you what you're building, how the work is structured, and how to track progress.

## What You're Building

A system where:
- The world is always 3D (vec3 positions everywhere)
- The default view is orthographic (screen === world for z=0 patches — exact identity)
- The user can hold Shift to temporarily view through a perspective camera
- Toggling the camera NEVER affects compilation, runtime state, or continuity
- Projection is a single explicit pipeline stage between world-space and the backend

The specs in this directory define the details. Read them in order (0 through 4) for the "why," then use `DOD-3d-system.md` for the "what to prove."

## How the Work Is Structured

The DoD (`DOD-3d-system.md`) is organized as 10 ascending levels. Each level builds on the previous. You can't meaningfully work on Level N until Level N-1's tests pass.

The levels, briefly:

| Level | What | You're done when... |
|-------|------|---------------------|
| 1 | vec3 data shape | Position fields are stride-3 Float32Array, layouts emit z=0 |
| 2 | Ortho kernel | Pure function produces identity mapping for z=0 |
| 3 | Perspective kernel | Pure function produces parallax, differs from ortho |
| 4 | Size projection | World radius → screen radius works for both modes |
| 5 | Pipeline wiring | RenderAssembler calls kernels, produces screen-space RenderPass |
| 6 | Mode toggle | Switching ortho↔perspective doesn't corrupt state |
| 7 | Depth + culling | Instances sorted correctly, invisible filtered out |
| 8 | Backend contract | Backends see only screen-space, no projection imports |
| 9 | Continuity decoupling | Proof that camera can't break continuity |
| 10 | Golden tests | Full-system certification under realistic conditions |

## How to Track Progress

Each level in the DoD has checkboxes. Mark them with a **confidence score (C1–C5)** that has strict, non-negotiable criteria.

### Score Disqualifiers (What Immediately Caps Your Score)

These patterns **automatically cap a score at C2**, regardless of how good the code looks:

1. **Tautological tests**: The test manually constructs the scenario it claims to verify. If the checkbox says "pipeline does X in order Y," and your test manually calls X then Y instead of invoking the real pipeline, the test proves nothing about the pipeline. **Max score: C2.**

2. **Wrong-layer testing**: The test exercises a different system boundary than what the checkbox describes. If the checkbox says "RenderPassIR contains fields," but you test `ProjectionOutput` (which is an internal detail of `projectInstances`), you're testing the wrong layer. **Max score: C2.**

3. **No runtime evidence**: Tests pass but the work-evaluator has not confirmed the system actually works end-to-end. "Tests pass" is necessary but not sufficient. **Max score: C2.**

4. **Simulated integration**: An "integration test" that doesn't integrate anything — it imports individual functions and calls them in sequence rather than going through the real orchestration layer (ScheduleExecutor, compile pipeline, etc.). **Max score: C2.**

5. **Implementation doesn't match hints**: The Implementation Hints in the DoD exist because past decisions that ignore them create walls at later levels. If your implementation contradicts the hints, it's C2 at best — it will break at a higher level.

These are not judgment calls. They are mechanical disqualifiers. If any of these apply, the score cannot exceed C2 until the issue is fixed.

### Confidence Scale

| Score | Marker | Criteria (ALL must be true to claim this score) | What a future worker should do |
|-------|--------|------------------------------------------------|-------------------------------|
| — | `[ ]` | Not started | Implement and test |
| C1 | `[1]` | A stub or placeholder exists. Tests may be written but fail, or pass trivially (e.g., returns empty array). | Treat as not implemented. Start from scratch or near-scratch. |
| C2 | `[2]` | Tests pass for the happy path. Edge cases may be unhandled. Implementation may be naive (e.g., allocates per call, uses objects instead of typed arrays). | Likely needs rewrite for performance or to satisfy later levels. Read the implementation hints. |
| C3 | `[3]` | All tests in this checkbox pass. Implementation is reasonable but hasn't been validated by the next level's tests yet. May have design decisions that turn out wrong. | Probably fine. Review if a higher level is struggling — this might be the weak link. |
| C4 | `[4]` | All tests pass. The NEXT level's tests also pass (proving composition works). Implementation matches the DoD hints. A different worker has reviewed and agreed. | Solid. Only revisit if a regression (`[!]`) appears or a golden test fails. |
| C5 | `[5]` | Textbook implementation. Minimal code, maximal clarity. No extra abstractions, no missing edge cases. Mathematically provable correct for the stated contract. Could be shown as a reference implementation. | Trust fully. Only modify if the spec itself changes. |

### How Scores Work

The implementer scores themselves first. Reviewers add their own scores alongside — **nothing is overwritten.** The history of assessments is preserved, so you can see how confidence evolved and whether different workers agree.

#### Scoring Rules

- The **implementer** self-assesses honestly using the criteria table. Any score C1–C5 is valid as a self-assessment.
- Each **reviewer** adds their own independent score. They might agree, or they might score lower (or higher) than the implementer.
- Disagreements are information, not conflicts. If the implementer says C4 and a reviewer says C2, the item is effectively C2 until the gap is resolved.

#### What Reviewers Check (by score they're considering)

- **Confirming C3**: Do all the checkbox's tests actually pass right now? (Run them.)
- **Confirming C4**: Do the next level's tests pass? Does the code match the implementation hints? Would you build on this?
- **Confirming C5**: Is there a simpler way? A case this misses? An allocation it doesn't need? If "no" to all three → C5.

### The Review-and-Advance Rule

**Each worker, each session, does two things:**

1. **Review one item** that another worker scored — add your own score alongside theirs
2. **Implement one item** (bring it from `[ ]` to C2 or C3)

This ensures forward progress is always paired with quality. No one races ahead leaving a trail of low-confidence items that collapse under the next level.

### Syntax in the DoD

Each checkbox in the DoD has a **review log** — an indented `>` block directly below it. This is where scores go. One entry per line, appended in order. Never edit or delete previous entries.

#### Entry Format

```
  > C{score} {worker} {MMDD} {optional note in quotes}
  > ! {worker} {MMDD} {what broke}
```

#### Date Format

Use `MMDD` (zero-padded month + day, no year — these are short-lived working documents). Examples: `0122` = Jan 22, `1103` = Nov 3.

#### Full Lifecycle Example

```markdown
## Not started (empty review log):
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  >

## After alice implements:
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 alice 0122 "initial impl, uses pre-allocated output buffer"

## After bob reviews (agrees, scores higher):
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 alice 0122 "initial impl, uses pre-allocated output buffer"
  > C4 bob 0123 "confirmed: no allocs, Level 5 tests pass with this"

## After carol reviews (disagrees, scores lower):
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 alice 0122 "initial impl, uses pre-allocated output buffer"
  > C4 bob 0123 "confirmed: no allocs, Level 5 tests pass with this"
  > C2 carol 0124 "normalizes camUp on every call, unnecessary work per instance"

## After alice fixes carol's concern:
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 alice 0122 "initial impl, uses pre-allocated output buffer"
  > C4 bob 0123 "confirmed: no allocs, Level 5 tests pass with this"
  > C2 carol 0124 "normalizes camUp on every call, unnecessary work per instance"
  > C4 alice 0125 "fixed: camUp normalized once at call site"

## After a regression is discovered:
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 alice 0122 "initial impl, uses pre-allocated output buffer"
  > C4 bob 0123 "confirmed: no allocs, Level 5 tests pass with this"
  > C2 carol 0124 "normalizes camUp on every call, unnecessary work per instance"
  > C4 alice 0125 "fixed: camUp normalized once at call site"
  > ! dave 0126 "broke after Level 5 refactor, depth output is NaN for z<0"

## After dave fixes the regression:
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 alice 0122 "initial impl, uses pre-allocated output buffer"
  > C4 bob 0123 "confirmed: no allocs, Level 5 tests pass with this"
  > C2 carol 0124 "normalizes camUp on every call, unnecessary work per instance"
  > C4 alice 0125 "fixed: camUp normalized once at call site"
  > ! dave 0126 "broke after Level 5 refactor, depth output is NaN for z<0"
  > C3 dave 0127 "fixed: clamped depth computation, all L2+L3 tests pass again"
```

Note: the `[ ]` checkbox itself doesn't change — the review log IS the status. Don't change `[ ]` to `[x]`.

#### Reading the Score Trail

- **Effective confidence** = the LOWEST score after the most recent `!` (or the lowest overall if no `!`). In the final example, effective confidence is C3 (dave's fix, only self-assessed so far).
- **Consensus** = where multiple reviewers agree. In the middle of the example, alice and bob agree at C4, but carol dissents at C2 → effective is C2 until resolved.
- A `!` (regression) draws a line — all scores before it are historical context. Current truth is only what comes after.
- **Notes are the most valuable part.** "Why this score?" tells the next person what to check.

### Level-Level Status

At the top of each level section in the DoD, add a status line summarizing the level:

```markdown
## Level 3: Perspective Projection Kernel (Pure Math)
**Status: 5/7 items at C3+, 2 items at C2. Lowest: camPos derivation (C2:alice:0122, needs cleanup for Level 5).**
```

A level is considered **complete** (eligible for advancement) when all items have effective confidence C4+ with at least two scorers agreeing. C3 means tests pass but the level has NOT been reviewed or validated by the next level — it is NOT sufficient for advancement.

### When Scores Go Down

Scores naturally decrease when:

- A higher level fails and you trace the root cause back here → reviewer adds a lower score with explanation
- A reviewer finds the implementation doesn't match the hints → reviewer adds C2 with note
- A refactor changes the code → implementer adds new self-assessment (previous scores are now stale context)
- The spec changes → add `!` with note "spec changed" (the contract changed, previous scores are meaningless)
- A `!` (regression) is discovered → add `!` with note explaining what broke

### Advancing to the Next Level

You can advance to Level N+1 when Level N has **all items at C4 or higher** with at least two scorers agreeing, AND the level's INVARIANT is satisfied.

C3 means "tests pass, implementation reasonable" — but it has NOT been validated by the next level's tests or reviewed by another worker. C3 is **NOT sufficient for advancement.** The level must be reviewed and confirmed at C4+ before the floor can move.

## What to Read First

1. **This file** (you're here)
2. **`DOD-3d-system.md`** — overview, process rules, and invariant summary. Each level is in **`dod/level-NN-*.md`**
3. **`0-Making-3d-stick.md`** — the philosophical argument for why the system is designed this way
4. **`2-Ortho+3d-OnDemand.md`** — the canonical spec for the two-mode projection system (most important spec)
5. **`1-3d-sticky-spec.md`** — detailed coordinate spaces, camera model, pipeline placement
6. **`3-ShiftPreviewFollowup.md`** — clarifies where projection lives (RenderAssembler, not patch graph)
7. **`4-CombineMode-Layer-Answer.md`** — CombineMode restrictions for shape2d (small but important invariant)

## Required Workflow

**All work on the 3D system MUST use `/do:plan` and `/do:it`.** No ad-hoc implementation. No spawning your own reviewer subagents. No custom Task agents.

Why: These skills have built-in evaluation (work-evaluator), runtime verification, human-in-the-loop checkpoints, and iterative-implementer (which takes no shortcuts). Ad-hoc workflows bypass all of this and produce checkbox-satisfying code that doesn't actually work.

See `design-docs/PROMPT.md` for the exact process.

## Ground Rules

1. **Tests are law.** If the test says "bitwise identical," it means bitwise identical. Don't weaken tests to match your implementation — fix the implementation.

2. **Tests must exercise the real system.** If a checkbox says "pipeline does X," the test invokes the real pipeline. Not a simulation. Not a manual sequence of function calls. The actual orchestration layer. See "Score Disqualifiers" above.

3. **Going back is normal.** If Level N is hard, the answer is usually "refactor Level N-1," not "hack around it." See the DoD's "Going Back Is Normal" section.

4. **Kernels are pure.** Projection kernels have no state, no side effects, no allocations, no imports from runtime. This is non-negotiable — the entire architecture depends on it.

5. **World and view are separate.** The compiled graph produces world-space. The RenderAssembler produces screen-space. These two systems don't know about each other. If you find yourself passing camera params into the runtime, or screen positions into continuity, stop — the architecture is wrong.

6. **One source of truth for camera defaults.** There is ONE const object for ortho defaults and ONE for perspective defaults. If you find yourself writing camera values in a second place, you're creating a drift bug.

7. **Don't skip levels.** Even if Level 7 (depth sorting) seems easy and you want to "just add it while you're in there" during Level 5 — don't. Each level's tests verify specific invariants in isolation. Mixing levels makes failures harder to diagnose.

8. **Runtime evidence required.** A checkbox is not satisfied until the work-evaluator confirms the system actually works. Tests passing is necessary but not sufficient — the system must demonstrably function.
