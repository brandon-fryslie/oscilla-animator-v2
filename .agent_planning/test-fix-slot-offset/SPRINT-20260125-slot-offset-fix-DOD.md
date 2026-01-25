# Definition of Done: Fix Remaining Test Failures

## Sprint Goal
Fix all 38 remaining failing tests, primarily caused by slot vs offset confusion in test assertions.

## Status: READY FOR IMPLEMENTATION

## Acceptance Criteria

### 1. Event Blocks Tests (3 tests)
- [ ] `src/blocks/__tests__/event-blocks.test.ts` - All 3 tests pass
- [ ] Tests use `slotToOffset()` helper to convert slots to offsets before array access
- [ ] No direct `state.values.f64[slot]` access without offset conversion

### 2. Expression Blocks Tests (5 tests)
- [ ] `src/blocks/__tests__/expression-blocks.test.ts` - All 5 tests pass
- [ ] Same slot vs offset fix pattern applied

### 3. Cardinality Metadata Tests (2 tests)
- [ ] `src/blocks/__tests__/cardinality-metadata.test.ts` - All 2 tests pass
- [ ] Id01 and OffsetPosition blocks tested correctly

### 4. Steel Thread Tests (3 tests)
- [ ] `src/compiler/__tests__/steel-thread.test.ts` - passes
- [ ] `src/compiler/__tests__/steel-thread-rect.test.ts` - passes
- [ ] `src/compiler/__tests__/steel-thread-dual-topology.test.ts` - passes

### 5. Debug-Viz UI Tests (8 tests)
- [ ] All `src/ui/debug-viz/` tests pass
- [ ] May need to handle DebugService throwing for unmapped edges (changed behavior)

### 6. Projection Golden Tests (3 tests)
- [ ] `src/projection/__tests__/level10-golden-tests.test.ts` - All 3 tests pass

### 7. Continuity Integration Tests (2 tests)
- [ ] `src/runtime/__tests__/continuity-integration.test.ts` - crossfade tests pass

### 8. Multi-Component Signal Tests (2 tests)
- [ ] `src/runtime/__tests__/multicomponent-signals.test.ts` - strided write tests pass

### 9. Connection Validation Tests (4 tests)
- [ ] `src/ui/reactFlowEditor/__tests__/connection-validation.test.ts` - All tests pass
- [ ] Investigate: test expects `res.adapter` to be undefined when types match, but implementation returns an adapter

### 10. Stroke Rendering Test (1 test)
- [ ] `src/render/__tests__/stroke-rendering.test.ts` - passes

### 11. Block Library Test (appears in failures)
- [ ] `src/ui/components/__tests__/BlockLibrary.test.tsx` - passes

### 12. Level 9 Continuity Test (1 test)
- [ ] `src/projection/__tests__/level9-continuity-decoupling.test.ts` - passes

## Final Verification
- [ ] `npm run test` passes with 0 failures
- [ ] `npm run typecheck` passes

## Pattern for Slot→Offset Fix

```typescript
// Helper to add in each test file
function slotToOffset(program: CompiledProgramIR, slot: number): number {
  const meta = program.slotMeta.find(m => m.slot === slot);
  if (!meta) throw new Error(`Slot ${slot} not found in slotMeta`);
  return meta.offset;
}

// Replace:
state.values.f64[someSlot]
// With:
state.values.f64[slotToOffset(program, someSlot)]
```

## Exit Criteria
All tests pass (0 failures in test output).
