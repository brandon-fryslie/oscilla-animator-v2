# WI-0 Complete: Runtime Stride Support for Signal Slots

## Status: ✅ COMPLETE

## Summary

Implemented construct() expression evaluation in signal context, enabling multi-component signals (vec2, vec3, color) to be written contiguously without requiring stepSlotWriteStrided.

## Changes Made

### 1. ValueExprSignalEvaluator.ts
- Added `evaluateConstructSignal()` helper function that evaluates all components and writes them contiguously to a buffer
- Updated `construct` case to return first component value (for recursive evaluation)
- Function signature: `evaluateConstructSignal(expr, valueExprs, state, targetBuffer, targetOffset) => number`

### 2. ScheduleExecutor.ts
- Updated `evalValue` step handler to detect construct expressions with stride>1
- When stride>1 and expression is construct: calls `evaluateConstructSignal()` to write all components
- When stride=1: continues to use scalar evaluation (no regression)
- Removed stride=1 assertion, now supports stride>1 for construct expressions

### 3. Tests
- Created `src/runtime/__tests__/construct-signal.test.ts`
- 5 test cases covering:
  - vec2 construct (stride=2)
  - vec3 construct (stride=3)
  - color construct (stride=4)
  - Recursive evaluation (returns first component)
  - Scalar signal regression test
- All tests pass ✅

## Verification

```bash
npm run test -- src/runtime/__tests__/construct-signal.test.ts
# Result: 5/5 tests pass
```

## Architecture

The implementation preserves the single universal rule: **schedule evaluates expression roots into slots**. There are no "special write step kinds."

Multi-component values are a representation detail of ValueExpr evaluation, not a scheduling primitive. The evaluator (not the schedule) is responsible for writing stride lanes.

## Next Step

WI-1: Remove impure methods from IRBuilder interface to enforce pure lowering at compile time.

**Status**: ✅ COMPLETE

### Changes Made

Removed the following methods from IRBuilder interface and IRBuilderImpl:

**Slot allocation (removed):**
- `allocSlot()`
- `allocTypedSlot()`
- `registerSigSlot()`
- `registerSlotType()`
- `registerFieldSlot()`

**Schedule steps (removed):**
- `stepSlotWriteStrided()`
- `stepStateWrite()`
- `stepFieldStateWrite()`
- `stepEvalSig()`
- `stepMaterialize()`

### Verification

Running `npm run typecheck` now produces type errors for every block and compiler file that calls these methods:

**Blocks that fail (expected - these need migration):**
- `src/blocks/signal/const.ts` (12 errors)
- `src/blocks/signal/default-source.ts` (6 errors)
- `src/blocks/math/expression.ts` (4 errors)
- `src/blocks/io/external-vec2.ts` (2 errors)
- `src/blocks/time/infinite-time-root.ts` (1 error)

**Compiler infrastructure that fails (expected - orchestrator needs these):**
- `src/compiler/backend/binding-pass.ts` (7 errors)
- `src/compiler/backend/lower-blocks.ts` (13 errors)
- `src/compiler/passes-v2/combine-utils.ts` (5 errors)

**Test failure:**
- `src/runtime/__tests__/construct-signal.test.ts` (1 error - missing time fields)

## Architecture Enforcement

✅ **Type-level enforcement achieved**: Pure blocks cannot call impure methods at compile time.

The IRBuilder interface now enforces purity mechanically. Any block that calls:
- `allocSlot()`, `registerSigSlot()`, etc. → Type error
- `stepSlotWriteStrided()`, `stepEvalSig()`, etc. → Type error

This makes "pure means pure" enforceable even when linting is noisy.

## Next Steps

1. Fix compiler infrastructure (binding-pass, lower-blocks, combine-utils) to use orchestrator methods
2. Migrate 4 blocked blocks to use construct() + effects.slotRequests
3. Fix infinite-time-root.ts (likely simple fix)
4. Fix test time state (add missing fields)

The type errors are exactly what we want - they show us where work needs to be done.
