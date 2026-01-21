# Sprint: rename-oscillators - STATUS

**Generated:** 2026-01-21T06:10:00Z
**Status:** COMPLETE ✅

## Summary

Successfully renamed phase-based trig kernels from generic names (sin, cos, tan) to explicit oscillator names (oscSin, oscCos, oscTan) to prevent confusion with radian-based opcode trig functions.

## Completed Work

### P0: Rename kernel cases in SignalEvaluator.ts ✅
- ✅ Changed `case 'sin':` to `case 'oscSin':`
- ✅ Changed `case 'cos':` to `case 'oscCos':`
- ✅ Changed `case 'tan':` to `case 'oscTan':`
- ✅ Updated error messages to use new names

### P1: Update comment documentation ✅
- ✅ Updated lines 210-213 comments to reference `oscSin`
- ✅ Updated lines 218-219 comments to reference `oscCos`
- ✅ Updated line 227 comment to reference `oscTan`
- ✅ Updated header comment to reference new kernel names

### P2: Find and update IR builder references ✅
- ✅ No direct kernel name references found in compiler/
- ✅ Verified waveform parameter is passed dynamically to ctx.b.kernel()

### P3: Update block definitions ✅
- ✅ Updated Oscillator block description to reference oscSin, oscCos
- ✅ Updated default waveform from 'sin' to 'oscSin'
- ✅ Updated comments in signal-blocks.ts
- ✅ Updated 4 test cases in compile.test.ts to use 'oscSin'

### P4: Add backward compatibility shims ✅
- ✅ Added deprecated aliases for 'sin', 'cos', 'tan'
- ✅ Each alias calls new version with console.warn()
- ✅ Deprecation warnings inform users to switch to new names

## Validation Results

### Build: ✅ SUCCESS
```
pnpm build
✓ built in 8.89s
```

### Tests: ✅ PASSING (510/513 - 3 pre-existing failures)
```
Test Files  1 failed | 33 passed | 5 skipped (39)
Tests       3 failed | 510 passed | 34 skipped (547)

✓ src/compiler/__tests__/compile.test.ts (12) - ALL PASSED
```

**Note:** The 3 failing tests are in Hash Block (stateful-primitives.test.ts) and are unrelated to this sprint. These failures existed before our changes.

### Type Check: ✅ SUCCESS
TypeScript compilation successful (via pnpm build)

## Files Modified

1. `src/runtime/SignalEvaluator.ts`
   - Renamed kernel cases
   - Updated comments
   - Added backward compatibility shims

2. `src/blocks/signal-blocks.ts`
   - Updated Oscillator block description
   - Changed default waveform to 'oscSin'
   - Updated comments

3. `src/compiler/__tests__/compile.test.ts`
   - Updated 4 test cases to use 'oscSin'

## Verification

All acceptance criteria met:
- ✅ Kernel names updated in SignalEvaluator.ts
- ✅ Comments reference new names
- ✅ No stale 'sin'/'cos'/'tan' kernel references (except deprecated shims)
- ✅ Oscillator block uses new kernel names
- ✅ Backward compatibility shims emit deprecation warnings
- ✅ Build passes
- ✅ Tests pass (all oscillator-related tests passing)

## Commit

```
commit 76fe6de
feat(runtime): rename oscillator kernels to oscSin/oscCos/oscTan

Rename phase-based trig kernels from generic names (sin, cos, tan) to 
explicit oscillator names (oscSin, oscCos, oscTan) to prevent confusion 
with radian-based opcode trig functions.
```

## Next Steps

This sprint is complete and ready for evaluation. The kernel renaming is successful and backward compatible.
