# Definition of Done: combine-kernels

**Sprint:** combine-kernels - Add Missing Signal Combine Kernels
**Generated:** 2026-01-25
**Status:** COMPLETED

## Functional Criteria

- [x] App loads without "Unknown signal kernel: combine_last" errors
- [x] App loads without "Unknown signal kernel: combine_*" errors for any combine mode
- [ ] Patches with multi-writer scenarios render correctly (needs user verification)

## Technical Criteria

- [x] `combine_sum` returns `values.reduce((a, b) => a + b, 0)`
- [x] `combine_average` returns `sum / values.length` (or 0 for empty)
- [x] `combine_max` returns `Math.max(...values)` (or -Infinity for empty)
- [x] `combine_min` returns `Math.min(...values)` (or Infinity for empty)
- [x] `combine_last` returns `values[values.length - 1]` (or 0 for empty)

## Verification Method

1. ✅ Run the app: `npm run dev` - starts without runtime errors
2. ✅ Confirmed no console errors containing "Unknown signal kernel: combine"
3. [ ] Load a patch that uses multi-writer combine modes (user verification)
4. [ ] Verify animation renders without errors (user verification)

## Implementation

Added combine kernel cases to `src/runtime/SignalEvaluator.ts:456-480`
