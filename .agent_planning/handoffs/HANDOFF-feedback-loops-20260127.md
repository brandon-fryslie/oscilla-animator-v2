# Handoff: Feedback Loops Implementation

**Date**: 2026-01-27
**Topic**: feedback-loops
**Status**: COMPLETE - Core functionality working

## Summary

Implemented two-pass SCC lowering to enable feedback loops with stateful blocks (UnitDelay). Feedback loops now compile and run correctly.

## What Was Done

### 1. Block Registry Extension
- Added `lowerOutputsOnly` optional function to `BlockDef` interface
- Added `existingOutputs` parameter to `LowerArgs` for phase 2 lowering
- Added `stateSlot` field to `LowerResult` for state slot coordination
- Added `hasLowerOutputsOnly()` helper function

**Files**: `src/blocks/registry.ts`

### 2. UnitDelay Phased Lowering
- Implemented `lowerOutputsOnly` that generates output without needing input resolved
- Phase 1: Allocates state slot, reads previous frame's value
- Phase 2: Writes current input to state for next frame
- Falls back to single-pass for non-cycle usage

**Files**: `src/blocks/signal-blocks.ts`

### 3. Two-Pass SCC Lowering in pass6
- Added `isNonTrivialSCC()` to detect cycles (multi-block or self-loop)
- Implemented `lowerSCCTwoPass()`:
  - **Phase 1**: Call `lowerOutputsOnly` for stateful blocks, register outputs
  - **Phase 2**: Topologically sort non-stateful blocks within SCC, then lower stateful blocks
- Trivial SCCs (no cycles) use unchanged single-pass lowering

**Files**: `src/compiler/passes-v2/pass6-block-lowering.ts`

### 4. Runtime Fix
- Added `fieldMultiply` kernel (was missing, needed for field×field multiplication)

**Files**: `src/runtime/FieldKernels.ts`

### 5. Tests & Demo
- Added feedback loop integration tests (3 tests, all passing)
- Created "Feedback Simple" demo showing variable-speed rotation vs constant-speed

**Files**:
- `src/compiler/__tests__/feedback-loops.test.ts`
- `src/demo/feedback-simple.ts`
- `src/demo/index.ts`

## Architecture Notes

The solution matches the runtime's two-phase execution model:
- **Phase 1 (lowerOutputsOnly)**: Reads from previous frame's state (NO input dependency)
- **Phase 2 (lower)**: Writes to state using current frame's input

For cycles with multiple non-stateful blocks (e.g., Add → Multiply → UnitDelay → Add):
1. Phase 1: UnitDelay output becomes available
2. Phase 2: Topologically sort Add, Multiply based on their internal dependencies
3. Phase 2: Finally lower UnitDelay (now has input from Multiply)

## Known Issues

### "Feedback Rotation" Demo Bug (Pre-existing)
The `feedback-rotation.ts` demo has a bug unrelated to our changes:
- Line 111: Wires a signal (from Add block) to HsvToRgb's `hue` input
- HsvToRgb expects `hue` to be a field, not a signal
- Needs a Broadcast block to convert signal → field

**Fix**: Add broadcast before HsvToRgb.hue input, similar to how the inner ring uses HueFromPhase.

## Test Commands

```bash
# Run feedback loop tests
npx vitest run src/compiler/__tests__/feedback-loops.test.ts

# Run all tests
npm run test

# Typecheck
npm run typecheck
```

## Commits Made

1. `feat(blocks): Add lowerOutputsOnly support to BlockDefinition`
2. `feat(blocks): Implement UnitDelay phased lowering for feedback loops`
3. `feat(compiler): Implement two-pass SCC lowering for feedback loops`
4. `fix(blocks,compiler): Fix type errors in phased lowering`
5. `fix(compiler): Complete two-pass SCC lowering with topological ordering`
6. `feat(demo): Add simple feedback loop demo for testing`
7. `fix(runtime): Add fieldMultiply kernel for field-field multiplication`
8. `feat(demo): Enhance feedback demo with variable speed and comparison ring`

## Next Steps (If Continuing)

1. **Fix Feedback Rotation demo**: Add Broadcast before HsvToRgb.hue
2. **Add Lag phased lowering**: Analyze if Lag needs `lowerOutputsOnly` (probably not - output depends on input within frame)
3. **Add Phasor phased lowering**: Similar analysis needed
4. **Test more complex feedback patterns**: Nested cycles, multiple stateful blocks

## Key Files to Understand

- `src/compiler/passes-v2/pass6-block-lowering.ts` - Main two-pass logic
- `src/blocks/signal-blocks.ts` - UnitDelay implementation
- `src/blocks/registry.ts` - BlockDef interface with lowerOutputsOnly
- `.agent_planning/feedback-loops/EVALUATION-*.md` - Root cause analysis
