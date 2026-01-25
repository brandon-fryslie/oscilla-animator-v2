# Definition of Done: time-slot-fix

**Generated**: 2026-01-25T10:00:00
**Status**: READY FOR IMPLEMENTATION
**Plan**: SPRINT-20260125-time-slot-fix-PLAN.md

## Acceptance Criteria

### Remove isTimeSignal Exclusion

- [ ] `pass6-block-lowering.ts` no longer checks for time signals when registering slots
- [ ] Time signals (tMs, dt, phaseA, phaseB, palette, energy) are registered via `registerSigSlot()`
- [ ] pass7-schedule generates evalSig steps for time signals

### Debug Probe Functionality

- [ ] Hovering an edge from `InfiniteTimeRoot.phaseA` shows value without error
- [ ] Hovering an edge from `InfiniteTimeRoot.tMs` shows value without error
- [ ] Hovering an edge from `InfiniteTimeRoot.dt` shows value without error
- [ ] No "Slot X has no value" errors in console

### Test Suite

- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] No regressions in existing debug probe tests

### Runtime Verification

- [ ] App loads without console errors
- [ ] Animation renders correctly
- [ ] Debug probe shows time values updating each frame
