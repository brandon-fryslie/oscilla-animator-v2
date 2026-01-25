# Sprint: time-slot-fix - Fix Time Signal Scheduling Bug

**Generated**: 2026-01-25T10:00:00
**Confidence**: HIGH: 1, MEDIUM: 0, LOW: 0
**Status**: READY FOR IMPLEMENTATION
**Source**: EVALUATION-20260125-100000.md

## Sprint Goal

Fix the scheduling bug where time signal slots are never written, causing debug probe errors when querying time edges.

## Scope

**Deliverables:**
- Remove special-case exclusion of time signals from evalSig generation
- Ensure time edges work correctly with debug probe

## Work Items

### P0 - Remove isTimeSignal Exclusion

**Dependencies**: None
**Spec Reference**: N/A (bug fix)
**Status Reference**: EVALUATION-20260125-100000.md

#### Description

Remove the special case that excludes time signals from slot registration. This will cause evalSig steps to be generated for time signals, which will write their values to slots, enabling debug probe functionality.

#### Acceptance Criteria

- [ ] Time signals are registered via `registerSigSlot()` like other signals
- [ ] evalSig steps are generated for time signals in pass7-schedule
- [ ] Debug probe can query edges from time outputs without errors
- [ ] Existing tests pass
- [ ] No console errors when running app

#### Technical Notes

In `pass6-block-lowering.ts:424-430`, the current code:

```typescript
if (ref.k === 'sig') {
  const sigExpr = builder.getSigExpr(ref.id);
  const isTimeSignal = sigExpr?.kind === 'time';
  if (!isTimeSignal) {
    builder.registerSigSlot(ref.id, ref.slot);
  }
}
```

Should become:

```typescript
if (ref.k === 'sig') {
  builder.registerSigSlot(ref.id, ref.slot);
}
```

The SignalEvaluator already handles `'time'` kind expressions correctly (lines 149-172), so evalSig will work.

## Dependencies

None - this is a self-contained bug fix.

## Risks

- **Risk**: Slight runtime overhead from evaluating 7 time signals per frame
- **Mitigation**: evalSig is fast, time signals just read from state.time.*, overhead is negligible
- **Risk**: Unexpected test failures
- **Mitigation**: Run full test suite before committing
