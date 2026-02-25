# AGENTS.md — WebGPU-Complete Migration Execution Rules

This file defines mandatory execution policy for all work under `docs/WebGPU-Complete`.

## Mission
Deliver the WebGPU migration with strict phase discipline, zero partial roll-forward between specs, and no deferred cleanup debt.

// [LAW:verifiable-goals] Completion is accepted only with deterministic evidence (tests/checks), not subjective judgment.
// [LAW:one-source-of-truth] The spec sequence below is the canonical migration order.

## Non-Negotiable Rules

1. **All cleanup steps are blocking.**
2. **No spec may start until the previous spec is fully complete.**
3. **No partial completion credit.** A spec is either complete or incomplete.
4. **No compatibility detours to “go faster.”** Fix forward on the canonical architecture.
5. **No scope skipping.** If a spec includes refactor, cleanup, tests, docs, and gates, all are required.

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

## Definition of “Spec Complete” (All Required)

A spec is complete only if every item below is true:

1. All implementation requirements in that spec are delivered.
2. All cleanup tasks in that spec are completed.
3. All acceptance commands/tests in that spec pass.
4. No unresolved TODO/FIXME/placeholders remain in scope for that spec.
5. Any guardrail tests required by that spec are added/updated and passing.
6. Documentation impacted by that spec is updated to match actual behavior.
7. A completion note exists with concrete evidence (commands, outputs, changed files).

If any one of the above fails, the spec is **not complete**.

## Execution Protocol Per Spec

1. Implement primary requirements.
2. Execute required cleanup before considering completion.
3. Run the full acceptance suite for that spec.
4. Add/strengthen regression guards.
5. Record completion evidence.
6. Only then proceed to the next spec.

## Implementation-Only Discipline

1. **One spec per PR.** Do not mix changes from multiple spec documents in one PR.
2. **No speculative refactors.** Do not edit code outside current spec scope unless required to satisfy that spec.
3. **Code is the source of truth.** Completion claims must be backed by passing repository tests/commands listed in the spec, or direct code inspection when no command exists.
4. **Missing tests means incomplete.** If a spec requirement has no effective test coverage, add tests before declaring the spec complete.
5. **Cleanup deletions are mandatory.** Leaving dead code/seams behind means the spec is incomplete.
6. **No meta-process artifacts.** Do not add trackers, ledgers, checklists, or process documents unless a spec explicitly requires them.

// [LAW:behavior-not-structure] Progress is measured by implemented behavior and enforced tests, not process artifacts.
// [LAW:verifiable-goals] Spec completion requires deterministic, repository-verifiable proof.

## Blocker Handling

If blocked:

1. Stop progression to subsequent specs.
2. Resolve blocker in current spec scope.
3. Re-run full acceptance for current spec.
4. Resume sequence only after current spec is fully complete.

// [LAW:dataflow-not-control-flow] Keep execution order fixed by spec sequence; variability belongs in implementation details, not phase ordering.

## Quality Bar

This migration is high-risk and high-coupling. Incomplete cleanup or out-of-order progression causes compounding complexity and potential migration failure. Maintain strict sequential closure.

**Short form policy:**

- Cleanup is blocking.
- Sequence is strict.
- Completion is all-or-nothing.
