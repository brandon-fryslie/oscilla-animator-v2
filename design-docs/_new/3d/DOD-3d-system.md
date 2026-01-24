# Definition of Done: 3D System

Structured as ascending levels. **All tests in a level must pass before starting the next level.** Each level includes both unit tests and integration tests that prove the pieces work together. No level is passable by hacking — each one locks in invariants that the next level depends on.

## Level Files

Levels are organized by state:

- **`dod/`** — exactly 2 files: the **floor** (previous level, invariant verified) and the **active level** (current work)
- **`dod/_completed/`** — levels whose invariants are verified and are no longer the floor
- **`dod/_upcoming/`** — levels not yet reachable

### Current Layout

| Location | Level | File | Status |
|----------|-------|------|--------|
| `_completed/` | 1 | level-01-vec3.md | C4 — all items verified, L2-L9 pass |
| `_completed/` | 2 | level-02-ortho-kernel.md | C4 — all items verified, L3-L9 pass |
| `_completed/` | 3 | level-03-perspective-kernel.md | C4 — all items verified, L4-L9 pass |
| `_completed/` | 4 | level-04-size-projection.md | C4 — all items verified, L5-L9 pass |
| `_completed/` | 5 | level-05-pipeline-wiring.md | C4 — all items verified, L6-L9 pass |
| `_completed/` | 6 | level-06-mode-toggle.md | C4 — all items verified, L7-L9 pass |
| `_completed/` | 7 | level-07-depth-culling.md | C4 — stable sort, culling, L8-L9 pass |
| `_completed/` | 8 | level-08-backend-contract.md | C4 — both backends screen-space only, L9 pass |
| `dod/` (floor) | 9 | level-09-continuity-decoupling.md | C4 — world-space only, zero projection imports, write-trap pure |
| `dod/` (active) | 10 | level-10-golden-tests.md | Not started |

### Advancement Protocol

When the active level's INVARIANT is verified:
1. Move floor → `_completed/`
2. Active becomes new floor
3. Move next level from `_upcoming/` → `dod/`
4. Update this table

---

## How to Use the Review Logs

Each checkbox has a **review log** indented below it. This is where ALL scores are recorded — implementer and reviewers alike. Scores are never overwritten; each entry is appended.

### Entry Format

```
  > C{score} {worker} {MMDD} {optional note}
```

### Example

```markdown
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 alice 0122 initial impl, uses pre-allocated output buffer
  > C4 bob 0123 confirmed: no allocs, Level 5 tests pass with this
  > C2 carol 0124 found issue: normalizes camUp on every call, unnecessary work
  > C4 alice 0125 fixed: camUp normalized once at call site, not in kernel
  > ! dave 0126 broke after Level 5 refactor, depth output is NaN for z<0
  > C3 dave 0127 fixed: clamped depth computation, all L2+L3 tests pass again
```

### Rules

- **Implementer goes first** with their honest self-assessment
- **Reviewers append** — never edit or remove previous entries
- **`!` entries** mark regressions — include what broke. Everything before `!` is history.
- **Effective confidence** = lowest score after the most recent `!` (or lowest overall if no `!`)
- **Notes are encouraged** — they're the most useful part for future workers. "Why this score?" matters more than the number.
- **Disagreements stay visible** — if alice says C4 and carol says C2, both remain. The item is effectively C2 until resolved.

### Advancing a Level

A level is **ready for advancement** when all items have effective confidence C4+ with 2+ scorers agreeing AND the level's INVARIANT is satisfied. C3 is NOT sufficient for advancement — it means tests pass but the work has not been reviewed or validated by the next level.

### Going Back Is Normal

Levels are not a one-way door. If you're stuck on Level N, the RIGHT move is often to go back and refactor Level N-1 (or N-2). Common patterns:

- **"Level 6 toggle is hard"** → Your Level 5 assembler probably baked in assumptions about projection mode. Go back and restructure the assembler's interface, re-run Level 5 tests, then return.
- **"Level 9 continuity test fails"** → Continuity is probably reading something it shouldn't. Go back to where continuity was first wired in and fix the data flow. Lower-level tests still pass = safe refactor.
- **"Level 7 depth sort is wrong under perspective"** → Your Level 3 kernel might have depth semantics inconsistent with Level 2. Fix the kernel, re-run Level 3 tests, then come back.

The rule is: **all tests at the level you're modifying must still pass after your changes.** If you refactor Level 3's kernel, Level 3 tests must still pass. Then Level 4, 5, 6 tests must still pass too (they depend on it). Run them all before moving forward again.

Feeling stuck is a signal that a lower level's design isn't quite right — not a signal to hack around it at the current level.

---

## Level Invariants (Quick Reference)

Each level has an INVARIANT that gates advancement to the next level. These correspond to actual app functionality per the canonical spec. If all DoD items are C4+ but the invariant is not satisfied, that's a planning gap.

| Level | Invariant Summary | Spec Reference |
|-------|-------------------|----------------|
| 1 | `executeFrame` produces stride-3 `Float32Array` position buffer via Materializer | I8 |
| 2 | Ortho kernel has zero runtime imports; identity property holds on L1 buffers | I16 |
| 3 | Both kernels have identical signatures/shapes; perspective differs from ortho | I16 |
| 4 | Size projection is identity under ortho; same module as position kernels | Topic 16 |
| 5 | `executeFrame` with camera produces populated screen-space fields in RenderPassIR | I15 |
| 6 | Toggle produces different output without recompile; same `CompiledProgramIR` ref | I6, I9 |
| 7 | RenderPassIR contains only visible instances, depth-sorted, compacted | I15 |
| 8 | Both backends produce identical pixels; neither imports projection | Topic 16 |
| 9 | ContinuityState identical regardless of camera; zero projection imports; write-trap passes | I2, I30 |
| 10 | 240-frame toggle+export is bitwise-identical to non-toggle run | I21, I31 |
