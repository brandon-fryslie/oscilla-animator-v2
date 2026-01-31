# Implementation Context: event-eval

Generated: 2026-01-31-100000
Source: EVALUATION-20260131-090000.md
Plan: SPRINT-20260131-100000-event-eval-PLAN.md

## File: src/runtime/ValueExprEventEvaluator.ts (NEW)

Create alongside existing `EventEvaluator.ts`. Follow the same compact structure (legacy is only 67 lines).

### Imports
```typescript
import type { ValueExpr, ValueExprEvent } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { RuntimeState } from './RuntimeState';
import { evaluateValueExprSignal } from './ValueExprSignalEvaluator';
```

### Main function (mirrors EventEvaluator.ts:25-67)
```typescript
export function evaluateValueExprEvent(
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState,
): boolean {
  const expr = valueExprs[veId as number];
  if (!expr) {
    throw new Error(`ValueExpr ${veId} not found`);
    // NOTE: legacy returns false silently (EventEvaluator.ts:32-33)
    // We throw instead -- no silent fallbacks per CLAUDE.md
  }

  if (expr.kind !== 'event') {
    throw new Error(`Expected event-extent ValueExpr, got kind '${expr.kind}'`);
  }

  return evaluateEventKind(expr, veId, valueExprs, state);
}
```

### Event kind dispatch
```typescript
function evaluateEventKind(
  expr: ValueExprEvent,
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState,
): boolean {
  switch (expr.eventKind) {
    case 'const':
      return expr.fired;

    case 'never':
      return false;

    case 'pulse':
      // Fires every tick (same as legacy EventEvaluator.ts:43-45)
      return true;

    case 'combine': {
      if (expr.mode === 'any') {
        return expr.inputs.some(id => evaluateValueExprEvent(id, valueExprs, state));
      } else {
        return expr.inputs.every(id => evaluateValueExprEvent(id, valueExprs, state));
      }
    }

    case 'wrap': {
      // Edge detection: rising edge of (signalValue >= 0.5)
      // Same logic as EventEvaluator.ts:57-64
      const signalValue = evaluateValueExprSignal(expr.input, valueExprs, state);
      const predicate = (Number.isFinite(signalValue) && signalValue >= 0.5) ? 1 : 0;
      const prevPredicate = state.valueExprPrevPredicate[veId as number] ?? 0;
      state.valueExprPrevPredicate[veId as number] = predicate;
      return predicate === 1 && prevPredicate === 0;
    }
  }
}
```

### Key difference from legacy
- Legacy `evaluateEvent` receives `signals: readonly SigExpr[]` for wrap evaluation
- ValueExpr version calls `evaluateValueExprSignal` which operates on the unified `valueExprs` table
- No cross-table reference needed -- everything is in one table

## File: src/runtime/RuntimeState.ts

### Edge detection state addition

Find where `eventPrevPredicate` is defined. Add parallel array:
```typescript
valueExprPrevPredicate: number[];
```

In `createRuntimeState()`, allocate:
```typescript
valueExprPrevPredicate: new Array(valueExprCount).fill(0),
```

## File: src/runtime/ScheduleExecutor.ts

### Shadow mode for StepEvalEvent

Locate the `evalEvent` case in step dispatch. Current code (approximate):
```typescript
case 'evalEvent': {
  const fired = evaluateEvent(step.expr, program.eventExprs.nodes, state, program.signalExprs.nodes);
  state.eventScalars[step.target as number] = fired ? 1 : 0;
  break;
}
```

Add shadow evaluation:
```typescript
case 'evalEvent': {
  const legacyFired = evaluateEvent(step.expr, program.eventExprs.nodes, state, program.signalExprs.nodes);

  if (SHADOW_EVAL && program.valueExprs) {
    const veId = program.valueExprs.eventToValue[step.expr as number];
    if (veId !== undefined) {
      const veFired = evaluateValueExprEvent(veId, program.valueExprs.nodes, state);
      if (legacyFired !== veFired) {
        console.warn(`Event mismatch at EventExprId=${step.expr} VeId=${veId}: legacy=${legacyFired} ve=${veFired}`);
      }
    }
  }

  state.eventScalars[step.target as number] = legacyFired ? 1 : 0;
  break;
}
```

## Legacy EventEvaluator reference (src/runtime/EventEvaluator.ts)

Full file is 67 lines. Key structure:
- Line 31-33: Missing expr returns false (SILENT FALLBACK -- we throw instead)
- Line 37: `expr.fired` for const
- Line 40: false for never
- Line 43-45: true for pulse
- Line 47-53: mode-based combine with `some`/`every`
- Line 56-64: Wrap edge detection with `eventPrevPredicate`

The wrap edge detection pattern is critical:
1. Evaluate signal
2. Compute predicate: `(finite && >= 0.5) ? 1 : 0`
3. Compare with previous predicate
4. Store current predicate
5. Fire on rising edge only (`predicate === 1 && prevPredicate === 0`)

## Test file: src/runtime/__tests__/ValueExprEventEvaluator.test.ts (NEW)

Tests needed:
1. `const { fired: true }` -> returns true
2. `const { fired: false }` -> returns false
3. `never` -> returns false
4. `pulse` -> returns true
5. `combine { mode: 'any' }` with [true, false] -> returns true
6. `combine { mode: 'all' }` with [true, false] -> returns false
7. `combine { mode: 'any' }` with [false, false] -> returns false
8. `combine { mode: 'all' }` with [true, true] -> returns true
9. `wrap` rising edge: signal goes from 0.0 to 1.0 -> fires once
10. `wrap` steady high: signal stays at 1.0 -> does not re-fire
11. `wrap` NaN signal -> does not fire (NaN treated as false)
12. Nested combine: combine(combine(pulse, never), const(true)) -> correct evaluation

Follow test pattern from existing `src/runtime/__tests__/` files.
