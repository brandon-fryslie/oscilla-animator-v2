# AGENTS.md — WebGPU-Complete Migration Execution Rules

This file is mandatory preflight context for any WebGPU migration implementation under `docs/WebGPU-Complete`.

## Mission

Deliver the WebGPU migration with strict phase discipline, zero partial roll-forward between specs, and no deferred cleanup debt.

// [LAW:verifiable-goals] Completion is accepted only with deterministic evidence (tests/checks), not subjective judgment.
// [LAW:one-source-of-truth] The spec sequence below is the canonical migration order.

## Required Read Order

Before changing code or tickets for WebGPU work:

1. Read this file.
2. Read the exact spec document(s) being implemented in this directory.
3. Confirm the target ticket is ready via `bd ready`.

## Non-Negotiable Rules

1. All cleanup steps are blocking.
2. No spec may start until the previous spec is fully complete.
3. No partial completion credit. A spec is either complete or incomplete.
4. No compatibility detours to "go faster." Fix forward on the canonical architecture.
5. No scope skipping. If a spec includes refactor, cleanup, tests, docs, and gates, all are required.

// [LAW:single-enforcer] Completion gates are enforced once per spec by the checklist below; do not invent alternate pass criteria.
// [LAW:no-mode-explosion] Do not introduce temporary execution modes/flags to bypass unresolved migration work.

## Canonical Spec Order (Hard Gate Sequence)

Complete in this exact order:

1. `P0-0__Overview_-_GPU-Native_Visual_Instrument_Architecture.md`
2. `P0-1__SoA_Mandate__Memory_Layout_Refactor.md`
3. `P0-2__Phase-Locking_for_Infinite_Runtime.md`
4. `P0-3__Refactoring_to_Handle-Based_Architecture.md`
5. `P1-1__Unified_GPU_Buffer_Strategy_Explained.md`
6. `P1-2__Unified_GPU_Shape_Bank_Strategy.md`
7. `P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`
8. `P2-1_Async_Compiler_Service_Architecture.md`
9. `P2-2__Naga_Compiler_Lowering_Pipeline_Explained.md`
10. `P2-3__Naga_WASM_Compiler_Validation_Layer.md`
11. `P3-1_CPU_to_GPU_Input_Marshalling.md`
12. `P3-2_GPU_Compute_Dispatch_Explained.md`
13. `P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
14. `P3-4__WebGPU_Render_Pass_Deep_Dive.md`
15. `P3-5__Runtime_Loop__The_Swap_Explained.md`
16. `P4-1_GPU_Observability__Async_Readback_System.md`
17. `P5-1__WASM_Boot__Developer_Experience_&_Migration.md`
18. `P5-2_Error_Propagation__Developer_Experience.md`
19. `P5-3__Phased_Rollout__Engine_Migration_Strategy.md`
20. `P6-1__GPU_Physics_Engine_with_Compute_Shaders.md`

## Definition of "Spec Complete" (All Required)

A spec is complete only if every item below is true:

1. All implementation requirements in that spec are delivered.
2. All cleanup tasks in that spec are completed.
3. All acceptance commands/tests in that spec pass.
4. No unresolved TODO/FIXME/placeholders remain in scope for that spec.
5. Any guardrail tests required by that spec are added/updated and passing.
6. Documentation impacted by that spec is updated to match actual behavior.
7. A completion note exists with concrete evidence (commands, outputs, changed files).

If any one of the above fails, the spec is not complete.

## Execution Protocol Per Spec

1. Implement primary requirements.
2. Execute required cleanup before considering completion.
3. Run the full acceptance suite for that spec.
4. Add/strengthen regression guards.
5. Record completion evidence.
6. Only then proceed to the next spec.

## Implementation-Only Discipline

1. One spec per PR. Do not mix changes from multiple spec documents in one PR.
2. No speculative refactors. Do not edit code outside current spec scope unless required to satisfy that spec.
3. Code is the source of truth. Completion claims must be backed by passing repository tests/commands listed in the spec, or direct code inspection when no command exists.
4. Missing tests means incomplete. If a spec requirement has no effective test coverage, add tests before declaring the spec complete.
5. Cleanup deletions are mandatory. Leaving dead code/seams behind means the spec is incomplete.
6. No meta-process artifacts. Do not add trackers, ledgers, checklists, or process documents unless a spec explicitly requires them.
7. Descriptions must be correct and reproducible (ticket + PR):
   - Include ticket ID, scope, changed files, and validation results.
   - Use literal markdown for identifiers/commands (wrap with backticks).
   - Never paste accidental shell-expanded output into PR body.
8. When creating/editing PR descriptions from CLI, use `--body-file` (or an equivalent quoted heredoc source), not inline shell strings with backticks.

// [LAW:behavior-not-structure] Progress is measured by implemented behavior and enforced tests, not process artifacts.
// [LAW:verifiable-goals] Spec completion requires deterministic, repository-verifiable proof.
// [LAW:single-enforcer] Description formatting/safety is enforced once here for all WebGPU spec PRs.

## Branch/Workspace Preflight & Delivery Protocol

1. Before starting any work, ensure the working directory is clean and the branch is fully up to date with `master`.
2. If there are outstanding local changes, review them for correctness, best practices, architectural law compliance, and merge readiness.
3. Any untracked file counts as outstanding work. Review it immediately, determine whether it is intentional, and either:
   - complete and commit it if it belongs with the active scope, or
   - explain why it should not be kept and stop for user direction before removing it.
4. Do not treat untracked work as a passive stop condition. Review happens first; if the work is valid, get it committed immediately.
5. If outstanding work needs more changes, complete the work to make it merge-ready before starting new scope.
6. If outstanding work should be reverted, explain why and stop. Do not remove or revert it yourself unless explicitly instructed by the user.
7. If outstanding work is merge-ready, commit the final state, push, and open PR(s) before starting new work.
8. Start each new unit of work on a fresh branch named for the scope, using the `codex/` prefix, from up-to-date `master`.
9. When a unit of work is complete, make a commit and ensure that commit is up to date with `master`.
10. If work is complete and review-ready, open a PR.
11. If work is not complete but an adjacent, directly related chunk can be safely completed with the current unmerged scope, include and complete that chunk before stopping.
12. You must only stop when one of these is true:
    - The user explicitly tells you to stop.
    - Ambiguity or high-risk uncertainty prevents safe completion.
    - A full batch is complete and a PR is open, ready for review and merge.
    - There is a known, concrete teammate-conflict risk on the same files (for example, dependency-coupled tickets).
    - No other reason is valid for stopping.

// [LAW:one-source-of-truth] `master` is the canonical integration baseline for all new branches and completion sync.
// [LAW:single-enforcer] Start-work and stop-work process checks are enforced once in this section.
// [LAW:verifiable-goals] Clean tree, sync state, and merge readiness are validated with deterministic git/test evidence.
// [LAW:no-silent-fallbacks] Untracked work must be explicitly reviewed and either committed or escalated; it cannot be silently ignored.

## Mechanical Gating Rule

For WebGPU migration tasks, the ticket is executable only if it appears in `bd ready` for the active scope.

Recommended checks:

```bash
bd dep cycles --json
bd ready --json --parent <epic-id>
```

For commit-time enforcement, set `BEAD_ID=<issue-id>` and run:

```bash
scripts/enforce-webgpu-bead-readiness.sh
```

This script fails if the ticket has open `blocks` dependencies or is not in `bd ready`.

## Blocker Handling

If blocked:

1. Stop progression to subsequent specs.
2. Resolve blocker in current spec scope.
3. Re-run full acceptance for current spec.
4. Resume sequence only after current spec is fully complete.

// [LAW:dataflow-not-control-flow] Keep execution order fixed by spec sequence; variability belongs in implementation details, not phase ordering.

## Invariant

Do not optimize for speed by skipping ordering. Correct dependency sequencing is part of correctness.

## Quality Bar

This migration is high-risk and high-coupling. Incomplete cleanup or out-of-order progression causes compounding complexity and potential migration failure. Maintain strict sequential closure.

Short form policy:

- Cleanup is blocking.
- Sequence is strict.
- Completion is all-or-nothing.
