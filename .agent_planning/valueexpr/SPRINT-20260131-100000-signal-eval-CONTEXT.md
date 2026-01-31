# Implementation Context: signal-eval

Generated: 2026-01-31-100000
Source: EVALUATION-20260131-090000.md
Plan: SPRINT-20260131-100000-signal-eval-PLAN.md

## File: src/runtime/ValueExprSignalEvaluator.ts (NEW)

Create alongside existing `SignalEvaluator.ts`. Follow the same structure.

### Imports
```typescript
import type { ValueExpr } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { PureFn } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { applyOpcode } from './OpcodeInterpreter';
import { recordNaN, recordInfinity } from './HealthMonitor';
import { constValueAsNumber } from '../core/canonical-types';
```

### Main function signature (mirrors evaluateSignal in SignalEvaluator.ts:79-115)
```typescript
export function evaluateValueExprSignal(
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState
): number {
  // Cache check (same pattern as SignalEvaluator.ts:85-89)
  const cached = state.cache.valueExprValues[veId as number];
  const cachedStamp = state.cache.valueExprStamps[veId as number];
  if (cachedStamp === state.cache.frameId) {
    return cached;
  }

  const expr = valueExprs[veId as number];
  if (!expr) {
    throw new Error(`ValueExpr ${veId} not found`);
  }

  const value = evaluateSignalExtent(expr, valueExprs, state);

  // NaN/Inf detection (same as SignalEvaluator.ts:103-108)
  if (Number.isNaN(value)) {
    recordNaN(state, null);
  } else if (!Number.isFinite(value)) {
    recordInfinity(state, null);
  }

  // Cache
  state.cache.valueExprValues[veId as number] = value;
  state.cache.valueExprStamps[veId as number] = state.cache.frameId;

  return value;
}
```

### Dispatch function (mirrors evaluateSigExpr in SignalEvaluator.ts:125-218)

```typescript
function evaluateSignalExtent(
  expr: ValueExpr,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState
): number {
  switch (expr.kind) {
    case 'const':
      return constValueAsNumber(expr.value);

    case 'slotRead':
      return state.values.f64[expr.slot as number];

    case 'time':
      return evaluateTime(expr.which, state);

    case 'external':
      return state.externalChannels.snapshot.getFloat(expr.channel);

    case 'kernel':
      return evaluateKernelSignal(expr, valueExprs, state);

    case 'state':
      return state.state[expr.stateSlot as number];

    case 'shapeRef':
      return 0; // Shape handled at step level

    case 'eventRead':
      return state.eventScalars[expr.eventSlot as number] ?? 0;

    case 'intrinsic':
      throw new Error('Intrinsic expressions are field-extent, not signal-extent');

    case 'event':
      throw new Error('Event expressions must be evaluated by EventEvaluator');

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown ValueExpr kind: ${(_exhaustive as ValueExpr).kind}`);
    }
  }
}
```

### Kernel sub-dispatch (for signal-extent kernels only)

```typescript
function evaluateKernelSignal(
  expr: ValueExprKernel,  // import the type
  valueExprs: readonly ValueExpr[],
  state: RuntimeState
): number {
  switch (expr.kernelKind) {
    case 'map': {
      const input = evaluateValueExprSignal(expr.input, valueExprs, state);
      return applyPureFn(expr.fn, [input]);
    }
    case 'zip': {
      const inputs = expr.inputs.map(id => evaluateValueExprSignal(id, valueExprs, state));
      return applyPureFn(expr.fn, inputs);
    }
    case 'reduce':
      return 0; // Handled at step level (same as legacy SigExprReduceField)
    case 'broadcast':
      throw new Error('Broadcast is field-extent, not signal-extent');
    case 'zipSig':
      throw new Error('ZipSig is field-extent, not signal-extent');
    case 'pathDerivative':
      throw new Error('PathDerivative is field-extent, not signal-extent');
    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown kernel kind: ${(_exhaustive as any).kernelKind}`);
    }
  }
}
```

### applyPureFn (copy from SignalEvaluator.ts:224-252)

Reuse by extracting to a shared module, or copy. The function is identical.
Consider: extract `applyPureFn` and `applySignalKernel` to a shared `src/runtime/PureFnEval.ts`.

### evaluateTime (mirrors SignalEvaluator.ts:150-173)
```typescript
function evaluateTime(
  which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy',
  state: RuntimeState
): number {
  // Same switch as SignalEvaluator.ts:152-172
}
```

## File: src/runtime/RuntimeState.ts

### Cache additions (find the cache interface, add fields)

Locate the cache type (search for `sigValues` or `sigStamps`). Add:
```typescript
valueExprValues: number[];
valueExprStamps: number[];
```

### createRuntimeState() update

Locate where `sigValues` and `sigStamps` are allocated. Add parallel allocation:
```typescript
valueExprValues: new Array(valueExprCount).fill(0),
valueExprStamps: new Array(valueExprCount).fill(-1),
```

Where `valueExprCount = program.valueExprs?.nodes.length ?? 0` (optional chaining for backward compat during migration).

## File: src/runtime/ScheduleExecutor.ts

### Shadow mode (in executeFrame or step dispatch)

Locate the `StepEvalSig` case in the step dispatch switch. Add shadow evaluation:

```typescript
case 'evalSig': {
  const legacyResult = evaluateSignal(step.expr, program.signalExprs.nodes, state);

  // Shadow mode: validate ValueExpr equivalence
  if (SHADOW_MODE_ENABLED && program.valueExprs) {
    const veId = program.valueExprs.sigToValue[step.expr as number];
    if (veId !== undefined) {
      const veResult = evaluateValueExprSignal(veId, program.valueExprs.nodes, state);
      assertEquivalent(legacyResult, veResult, step.expr, veId);
    }
  }

  // Use legacy result (proven correct)
  state.values.f64[slotLookup.offset] = legacyResult;
  break;
}
```

### Shadow mode flag

```typescript
const SHADOW_MODE_ENABLED = import.meta.env.DEV && import.meta.env.VITE_SHADOW_EVAL === 'true';
```

Or simpler: a module-level constant that can be toggled:
```typescript
/** Enable shadow evaluation for ValueExpr migration validation. Dev-only. */
export const SHADOW_EVAL = false; // Toggle to true during testing
```

## Test file: src/runtime/__tests__/ValueExprSignalEvaluator.test.ts (NEW)

Follow pattern from existing signal evaluator tests. Test each ValueExpr kind:
1. const -> returns numeric value
2. slotRead -> reads from state.values.f64
3. time (all 7 cases) -> returns correct time values
4. external -> reads from external channels
5. kernel.map -> applies fn to input
6. kernel.zip -> applies fn to inputs
7. state -> reads from state.state
8. shapeRef -> returns 0
9. kernel.reduce -> returns 0
10. eventRead -> reads from eventScalars

Test caching: evaluate same ID twice, verify cache hit (stamp check).
Test NaN detection: create const with NaN value, verify recordNaN called.

## Existing patterns to follow

- **Caching pattern**: `SignalEvaluator.ts:85-89` (frame-stamp based)
- **Exhaustive switch**: `SignalEvaluator.ts:214-217` (never pattern)
- **NaN/Inf detection**: `SignalEvaluator.ts:103-108`
- **PureFn dispatch**: `SignalEvaluator.ts:224-252`
- **Test structure**: `src/runtime/__tests__/` directory (existing test files)
