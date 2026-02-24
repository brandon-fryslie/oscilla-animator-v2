---
name: architecture-migration-loop
description: Run a planner+executor migration workflow that removes legacy seams in production code. Use when you need just-in-time planning, incentive updates, seam removal, and tight feedback without artifact bloat.
---

# Architecture Migration Loop

## Intent
Use two interlocking feedback loops:
- `Ap` planner agent: choose seam batch, plan changes, audit results.
- `Ae` executor agent: implement incentive changes first, then remove seam code.

Target outcome is completed migration work in production code, not process output.

## Overall Cadence
`Ap0 (seam inventory) -> Ap1 -> Ae1 -> Ap2 -> Ae2 -> ...`

Planner and executor run small batches and correct course every cycle.

## Stage 0 (One-Time): Build Seam Inventory
Before any execution cycles, planner builds one shared seam inventory.

Required output (single concise document):
- `.migration/seams.md`

Seam classes:
- `class 1`: mechanical/obvious change with known replacement pattern.
- `class 2`: requires separate architectural investigation before execution pattern is known.

For each seam, document exactly:
- `Class` (`1` or `2`)
- `Code location`
- `Why it was identified as a seam`
- `Proposed change`

Use this shape in `.migration/seams.md`:

```md
# Seam Inventory

## Class 1
- [S1] Code location: <path[:line]>
  Why seam: <brief reason>
  Proposed change: <brief replacement/removal action>

## Class 2
- [S2] Code location: <path[:line]>
  Why seam: <brief reason>
  Proposed change: <investigation target, not implementation guess>
```

Do not add extra tracking fields in Stage 0. Keep it concise and complete.

Rules:
- Discover seams from production code and existing migration goals.
- Keep it minimal: one file only, no extra migration docs.
- Freeze initial seam list, then update by delta during cycles.
- Class 2 seams are not sent to executor until investigation produces a known replacement pattern.
- After class-2 investigation:
  - if it was a one-off, resolve it and remove it from seam inventory
  - otherwise, propagate the known pattern and reclassify matching seams as class 1

// [LAW:one-source-of-truth] Seam inventory is a single shared source for both Ap and Ae.
// [LAW:verifiable-goals] Each seam entry must be concrete enough to drive deterministic change planning.

## Stage Order (Per Seam Batch, After Stage 0)
1. Identify what to remove.
2. Prepare incentives so seam removal is the easiest path.
3. Remove seam in production code.
4. Verify and feed back into next plan.

// [LAW:verifiable-goals] Each cycle must show seam shrink in code.
// [LAW:single-enforcer] Each cycle should reduce duplicate enforcement/pathing.

## Ap Loop (Planner)
1. Choose seam subset from `.migration/seams.md`.
   - Executor batches must contain class-1 seams only.
   - Class-2 seams trigger investigation work first.
2. Plan required code changes (functional seam removal).
3. Plan incentive changes:
   - remove/replace tests locking old structure
   - add/update checks that block seam reintroduction
   - move helpers/defaults/callers toward canonical path
4. Emit execution brief to `Ae` with:
   - seam definition
   - exact change sites/files
   - incentive changes first, code changes second
   - done criteria and checks
5. Audit `Ae` result:
   - seam shrank or not
   - missed sites
   - blocker type (scope too big, incentive misaligned, unknown dependency)
6. Re-plan next cycle immediately.

Planner uses the handoff scripts as opaque boundaries between turns.

## Ae Loop (Executor)
1. Review `Ap` brief and sanity-check seam grouping.
2. Implement incentive changes first.
3. Implement seam-removal code changes.
4. Run checks for touched modules/scopes.
5. Return result to planner:
   - files changed
   - seam delta
   - check results
   - missed sites / blockers

Caller-facing handoff is opaque: call one script per stage and wait for it to return.
Each script signals the next-agent turn, blocks until completion, and writes response output.

Handoff scripts:
- `scripts/handoff_stage1_prepare_incentives.sh <cycle-id> <brief-path>`
- `scripts/handoff_stage2_remove_seam.sh <cycle-id> <brief-path>`
- `scripts/handoff_stage3_verify_report.sh <cycle-id> <brief-path>`
Run them in order for each cycle; each call blocks until the other-agent turn is complete.

// [LAW:behavior-not-structure] Update or remove tests that enforce old structure.
// [LAW:dataflow-not-control-flow] Remove old/new branching; keep one canonical path.

## Hard Rules
- No artifact-only cycles.
- No migration docs unless user explicitly asks.
- Only allowed migration artifacts by default:
  - `.migration/seams.md`
  - executor handoff brief for current cycle
- No compatibility shims in core migration paths unless explicitly approved.
- If seam does not shrink, reduce batch size and rerun.

## Completion Condition
Migration is complete when target seams are absent from production code and touched-scope checks pass.

## Reporting (Per Cycle)
Return only:
- `Seam batch:`
- `Incentives changed:`
- `Code changed:`
- `Checks:`
- `Next correction:`
