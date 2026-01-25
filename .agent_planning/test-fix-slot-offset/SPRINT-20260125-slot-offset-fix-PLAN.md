# Sprint Plan: Fix Remaining Test Failures

## Status: HIGH CONFIDENCE - Ready for Implementation

## Context

Previous work fixed 30 of 68 failing tests by:
1. Making `DebugService.getEdgeValue()` throw for unmapped edges (was returning undefined)
2. Adding missing stateful primitive blocks (UnitDelay, Lag, Phasor, Hash)
3. Fixing slot vs offset confusion in math-utility-blocks.test.ts and stateful-primitives.test.ts

## Root Cause Analysis

### Primary Issue: Slot vs Offset Mismatch
Tests were using slot IDs directly as array indices into `state.values.f64[]`, but:
- `slotMeta` maps slots to offsets: `{ slot: 3, offset: 6, ... }`
- Slots are logical identifiers, offsets are physical array positions
- Must convert: `state.values.f64[slotMeta.find(m => m.slot === slot).offset]`

### Secondary Issues
1. **DebugService behavior change**: Now throws for unmapped edges (may affect debug-viz tests)
2. **Connection validation**: Test expects no adapter when types match, but implementation returns adapter
3. **Cardinality metadata**: May be different issue - need investigation

## Implementation Plan

### Phase 1: Block Tests (Slot→Offset Pattern)
Apply the established `slotToOffset()` helper pattern to:
1. `event-blocks.test.ts` - 3 failures
2. `expression-blocks.test.ts` - 5 failures
3. `cardinality-metadata.test.ts` - 2 failures (investigate first)

### Phase 2: Compiler Tests
4. `steel-thread.test.ts` - investigate failure mode
5. `steel-thread-rect.test.ts` - investigate failure mode
6. `steel-thread-dual-topology.test.ts` - investigate failure mode

### Phase 3: Runtime Tests
7. `continuity-integration.test.ts` - 2 failures (crossfade policy)
8. `multicomponent-signals.test.ts` - 2 failures (strided writes)

### Phase 4: Projection Tests
9. `level10-golden-tests.test.ts` - 3 failures
10. `level9-continuity-decoupling.test.ts` - 1 failure

### Phase 5: UI Tests
11. Debug-viz tests (8 failures) - likely DebugService throwing
12. Connection validation tests (4 failures) - investigate adapter behavior
13. BlockLibrary.test.tsx - investigate
14. Stroke rendering test - investigate

## Key Files Already Modified (Reference)

- `src/services/DebugService.ts` - getEdgeValue now throws for unmapped edges
- `src/blocks/signal-blocks.ts` - Added UnitDelay, Lag, Phasor, Hash
- `src/blocks/__tests__/math-utility-blocks.test.ts` - Has working `findTestSignalOffsets()` helper
- `src/blocks/__tests__/stateful-primitives.test.ts` - Has working helper
- `src/blocks/__tests__/event-blocks.test.ts` - Partially fixed, has `slotToOffset()` helper

## Risks

- **LOW**: Pattern is well established from previous fixes
- **MEDIUM**: Some failures may have different root causes requiring investigation
- **MEDIUM**: Debug-viz tests may need mock adjustments for DebugService throwing behavior
