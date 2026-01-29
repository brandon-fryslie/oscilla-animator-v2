# Sprint: fix-camera-integration - Fix Camera Block Type System Integration

Generated: 2026-01-24T16:00:00Z
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Fix the 21 test failures introduced by the camera type system integration changes on the `ralphie` branch.

## Scope

**Deliverables:**
- Fix `pass2-types.ts` null safety bug (block.params can be undefined)
- Fix missing type imports in `level10-golden-tests.test.ts`
- All 86 test files pass, typecheck clean

## Work Items

### P0: Fix pass2-types.ts null pointer on block.params

**Acceptance Criteria:**
- [ ] `getPortType()` handles blocks where `block.params` is undefined
- [ ] Unit validation tests pass (3 tests)
- [ ] Steel-thread tests pass (3 tests)
- [ ] All downstream compilation tests pass

**Technical Notes:**
- Line 282: `block.params.payloadType` crashes when `block.params` is undefined
- Fix: Guard with `block.params?.payloadType` or early return if no params
- Root cause: Not all blocks have a `params` object (non-generic blocks may have none)

### P1: Fix level10-golden-tests.test.ts type imports

**Acceptance Criteria:**
- [ ] Missing imports added: `CompiledProgramIR`, `RuntimeState`, `ValueSlot`
- [ ] All 6 level10 golden tests pass
- [ ] TypeScript compiles without errors

**Technical Notes:**
- `CompiledProgramIR` from `../../compiler/ir/program`
- `RuntimeState` from `../../runtime/RuntimeState`
- `ValueSlot` from `../../compiler/ir/program` (or wherever it's defined)

### P2: Verify complete test suite green

**Acceptance Criteria:**
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run test -- --run` shows 0 failures
- [ ] No regressions from the camera integration changes

## Dependencies

- None (all code already exists, just needs fixing)

## Risks

- The level5/level7 failures may have additional root causes beyond the pass2 crash (unlikely but check)
