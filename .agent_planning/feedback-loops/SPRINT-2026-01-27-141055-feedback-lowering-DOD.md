# Definition of Done: feedback-lowering

Generated: 2026-01-27-141055
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-27-141055-feedback-lowering-PLAN.md

## Acceptance Criteria

### Block Registry Extension

- [ ] `BlockDefinition` type includes optional `lowerOutputsOnly` function
- [ ] Type signature: `lowerOutputsOnly?: (args: { ctx: LowerCtx; config: Record<string, unknown> }) => { outputsById: Record<string, ValueRefPacked>; stateSlot?: StateSlotId }`
- [ ] `LowerResult` includes optional `existingOutputs` for second pass
- [ ] Helper function `hasLowerOutputsOnly(blockDef)` exists and returns boolean
- [ ] TypeScript compiles with no errors in `src/blocks/registry.ts`

### UnitDelay Phased Lowering

- [ ] UnitDelay has `lowerOutputsOnly` function defined
- [ ] `lowerOutputsOnly` allocates state slot and returns output ValueRef
- [ ] `lowerOutputsOnly` does NOT require input to be resolved
- [ ] `lower` function generates state write step using input
- [ ] State slot ID is identical between phases (verified by test)
- [ ] Existing test: `stateful-primitives.test.ts` UnitDelay tests pass
- [ ] New test: UnitDelay in feedback loop (A -> UnitDelay -> A) compiles

### Lag Phased Lowering (if applicable)

- [ ] Analysis documented: Does Lag output depend on input within frame?
- [ ] If yes: Document why `lowerOutputsOnly` not needed
- [ ] If no: Implement `lowerOutputsOnly`
- [ ] Existing Lag tests continue to pass

### Two-Pass SCC Lowering

- [ ] `pass6BlockLowering` detects non-trivial SCCs (size > 1 or has self-loop)
- [ ] Non-trivial SCCs use two-pass lowering
- [ ] Trivial SCCs use single-pass lowering (unchanged behavior)
- [ ] Pass 1: Calls `lowerOutputsOnly` for stateful blocks, stores in `blockOutputs`
- [ ] Pass 2: Calls `lower` for all blocks with inputs now available
- [ ] All existing compiler tests pass
- [ ] New test: Feedback loop `Const -> Add -> UnitDelay -> Add (feedback)` compiles

### Integration Tests

- [ ] Test: Simple feedback loop with UnitDelay compiles and produces valid IR
- [ ] Test: Feedback loop with 3+ blocks, one UnitDelay, compiles
- [ ] Test: Cycle without stateful block still fails (pass5-scc rejects)
- [ ] Test: Non-cycle graph (trivial SCCs) unchanged behavior

### Runtime Verification (Manual)

- [ ] Demo: Phase accumulator feedback loop runs in browser
- [ ] Demo: UnitDelay feedback produces expected 1-frame delay behavior
- [ ] No console errors during compilation or runtime

## Exit Criteria

All checkboxes above must be checked. The following must also be true:

1. `npm run typecheck` passes
2. `npm run test` passes
3. `npm run build` succeeds
4. No regression in existing functionality
