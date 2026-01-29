# Definition of Done: immediate-leak-fix

**Sprint:** Fix Subarray Retention Memory Leak
**Generated:** 2026-01-25

## Completion Criteria

### P0: Single-Group Path Fix

- [ ] `assembleDrawPathInstancesOp` single-group path copies all compacted buffers
- [ ] No subarray views (`.subarray()` return values) stored in DrawOp instances
- [ ] Pattern matches multi-group path at lines 830-838

**Verification:** Code inspection shows explicit `new Float32Array(...)` / `new Uint8ClampedArray(...)` wrappers

### P1: Contract Documentation

- [ ] JSDoc on `depthSortAndCompact` explicitly states lifetime constraint
- [ ] JSDoc warns that returned views must be copied before storage

**Verification:** Read the JSDoc, it's clear and unambiguous

### P2: Memory Profile Verification

- [ ] Run animation for 60+ seconds
- [ ] Heap size stabilizes (no unbounded growth)
- [ ] No obvious Float32Array retention patterns

**Verification:** Chrome DevTools heap snapshot comparison

## Testing Checklist

- [ ] `npm run build` passes (no type errors)
- [ ] `npm run test` passes (no regressions)
- [ ] Manual test: Load complex patch, run 60s, heap stable

## Definition of NOT Done

The sprint is NOT complete if:
- Subarray views can still escape into frame.ops
- Memory growth is observed over 60 seconds
- Any existing test fails

## Exit Criteria Met When

All checkboxes above are checked and verified.
