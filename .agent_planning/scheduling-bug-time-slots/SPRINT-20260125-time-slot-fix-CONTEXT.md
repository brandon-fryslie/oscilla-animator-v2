# Implementation Context: time-slot-fix

**Generated**: 2026-01-25T10:00:00
**Plan**: SPRINT-20260125-time-slot-fix-PLAN.md

## Files to Modify

### src/compiler/passes-v2/pass6-block-lowering.ts

**Lines 424-430** - Remove isTimeSignal exclusion

Current code:
```typescript
// Register slot for signal/field outputs
// NOTE: Skip registration for time signals - they are written directly by the runtime,
// not through evalSig steps. This avoids generating evalSig for palette/tMs/etc.
if (ref.k === 'sig') {
  const sigExpr = builder.getSigExpr(ref.id);
  const isTimeSignal = sigExpr?.kind === 'time';
  if (!isTimeSignal) {
    builder.registerSigSlot(ref.id, ref.slot);
  }
}
```

Change to:
```typescript
// Register slot for signal/field outputs
if (ref.k === 'sig') {
  builder.registerSigSlot(ref.id, ref.slot);
}
```

## Adjacent Code Patterns

### SignalEvaluator (already handles time correctly)

`src/runtime/SignalEvaluator.ts:149-172`:
```typescript
case 'time': {
  const timeExpr = expr as { which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy' };
  switch (timeExpr.which) {
    case 'tMs':
      return state.time.tMs;
    case 'dt':
      return state.time.dt;
    case 'phaseA':
      return state.time.phaseA;
    // ... etc
  }
}
```

### ScheduleExecutor evalSig step (will work for time)

`src/runtime/ScheduleExecutor.ts:183-216`:
```typescript
case 'evalSig': {
  const lookup = resolveSlotOffset(step.target);
  const { storage, offset, slot, stride } = lookup;
  // ...
  const value = evaluateSignal(step.expr, signals, state);
  writeF64Scalar(state, lookup, value);
  state.tap?.recordSlotValue?.(slot, value);  // Debug tap will work!
}
```

## Expected Behavior After Fix

1. pass6-block-lowering registers ALL signal slots including time
2. pass7-schedule generates evalSig for time signals
3. ScheduleExecutor evaluates time signals like any other
4. Debug tap records time values to slots
5. DebugService finds values when querying time edges

## Tests to Run

```bash
npm run typecheck
npm run test
```

## Manual Verification

1. Start dev server: `npm run dev`
2. Open browser console
3. Hover over an edge from InfiniteTimeRoot (phaseA, tMs, etc.)
4. Verify no "Slot X has no value" error
5. Verify debug value shows and updates
