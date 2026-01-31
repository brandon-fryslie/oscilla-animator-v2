# Implementation Context: materializer

Generated: 2026-01-31-100000
Source: EVALUATION-20260131-090000.md
Plan: SPRINT-20260131-100000-materializer-PLAN.md

## File: src/runtime/ValueExprMaterializer.ts (NEW)

Create alongside existing `Materializer.ts`.

### Imports
```typescript
import type { ValueExpr, ValueExprKernel, ValueExprIntrinsic } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { InstanceId } from '../compiler/ir/Indices';
import type { PureFn } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { evaluateValueExprSignal } from './ValueExprSignalEvaluator';
import { BufferPool } from './BufferPool';
import { requireManyInstance, payloadStride, constValueAsNumber } from '../core/canonical-types';
// Reuse field kernel functions from Materializer
import { applyFieldKernel, applyFieldKernelZipSig } from './Materializer';
```

### Main function signature (mirrors materialize() in Materializer.ts)

```typescript
export function materializeValueExpr(
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  instanceId: InstanceId,
  count: number,
  state: RuntimeState,
  pool: BufferPool,
): Float32Array {
  // Cache check
  const cached = state.cache.valueExprFieldBuffers[veId as number];
  if (cached && state.cache.valueExprFieldStamps[veId as number] === state.cache.frameId) {
    return cached;
  }

  const expr = valueExprs[veId as number];
  if (!expr) throw new Error(`ValueExpr ${veId} not found`);

  const stride = payloadStride(expr.type.payload);
  const buffer = pool.acquire(count * stride);

  // Dispatch based on kind
  fillBuffer(expr, buffer, veId, valueExprs, instanceId, count, stride, state, pool);

  // Cache result
  state.cache.valueExprFieldBuffers[veId as number] = buffer;
  state.cache.valueExprFieldStamps[veId as number] = state.cache.frameId;

  return buffer;
}
```

### Field-extent dispatch

```typescript
function fillBuffer(
  expr: ValueExpr,
  buffer: Float32Array,
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  instanceId: InstanceId,
  count: number,
  stride: number,
  state: RuntimeState,
  pool: BufferPool,
): void {
  switch (expr.kind) {
    case 'const': {
      // Fill all lanes with constant value
      const val = constValueAsNumber(expr.value);
      for (let i = 0; i < count * stride; i++) {
        buffer[i] = val; // For vec types, need component extraction
      }
      break;
    }

    case 'intrinsic':
      fillIntrinsic(expr, buffer, instanceId, count, stride, state);
      break;

    case 'kernel':
      fillKernel(expr, buffer, veId, valueExprs, instanceId, count, stride, state, pool);
      break;

    case 'state': {
      // Read per-lane state
      const stateStart = expr.stateSlot as number;
      for (let i = 0; i < count * stride; i++) {
        buffer[i] = state.fieldState[stateStart + i] ?? 0;
      }
      break;
    }

    // Signal-extent kinds should not appear in field materialization
    case 'slotRead':
    case 'time':
    case 'external':
    case 'shapeRef':
    case 'eventRead':
    case 'event':
      throw new Error(`Cannot materialize ${expr.kind} as field-extent`);

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown kind: ${(_exhaustive as any).kind}`);
    }
  }
}
```

### Kernel sub-dispatch for field-extent

```typescript
function fillKernel(
  expr: ValueExprKernel,
  buffer: Float32Array,
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  instanceId: InstanceId,
  count: number,
  stride: number,
  state: RuntimeState,
  pool: BufferPool,
): void {
  switch (expr.kernelKind) {
    case 'broadcast': {
      // Evaluate signal, fill all lanes
      const sigValue = evaluateValueExprSignal(expr.signal, valueExprs, state);
      for (let i = 0; i < count; i++) {
        buffer[i * stride] = sigValue;
        // For multi-component, need to handle stride > 1
      }
      break;
    }

    case 'map': {
      // Materialize input, apply fn per-lane
      const input = materializeValueExpr(expr.input, valueExprs, instanceId, count, state, pool);
      applyFieldKernel(expr.fn, input, buffer, count, stride);
      break;
    }

    case 'zip': {
      // Materialize all inputs, apply fn per-lane
      const inputs = expr.inputs.map(id =>
        materializeValueExpr(id, valueExprs, instanceId, count, state, pool)
      );
      // Per-lane: buffer[i] = fn(inputs[0][i], inputs[1][i], ...)
      applyFieldKernelZip(expr.fn, inputs, buffer, count, stride);
      break;
    }

    case 'zipSig': {
      // Materialize field, evaluate signals, apply fn per-lane
      const field = materializeValueExpr(expr.field, valueExprs, instanceId, count, state, pool);
      const signals = expr.signals.map(id => evaluateValueExprSignal(id, valueExprs, state));
      applyFieldKernelZipSig(expr.fn, field, signals, buffer, count, stride);
      break;
    }

    case 'reduce': {
      // Materialize field, reduce to scalar
      // Result is stored in signal cache, not in buffer
      const field = materializeValueExpr(expr.field, valueExprs, instanceId, count, state, pool);
      // Reduction result goes to signal layer -- this is a cross-evaluator concern
      // The reduce result should be cached in valueExprValues for signal reads
      break;
    }

    case 'pathDerivative': {
      // Materialize input, compute derivative
      const input = materializeValueExpr(expr.field, valueExprs, instanceId, count, state, pool);
      // Apply path derivative computation (tangent/arcLength)
      // NOTE: operation type is not yet on the kernel variant -- gap from Sprint 1
      break;
    }
  }
}
```

## File: src/runtime/RuntimeState.ts

### Cache additions for field buffers

```typescript
valueExprFieldBuffers: (Float32Array | null)[];
valueExprFieldStamps: number[];
```

Allocate in `createRuntimeState()`:
```typescript
valueExprFieldBuffers: new Array(valueExprCount).fill(null),
valueExprFieldStamps: new Array(valueExprCount).fill(-1),
```

Also add field state array if not already present:
```typescript
fieldState: Float32Array;  // Per-lane state storage (indexed by StateSlotId)
```

## File: src/runtime/Materializer.ts (existing)

### Functions to extract/reuse

The following functions should be extracted to shared modules or exported for reuse:

1. **`applyFieldKernel`** -- applies PureFn to a field buffer per-lane
2. **`applyFieldKernelZipSig`** -- applies PureFn with field + signal inputs per-lane
3. **Intrinsic production** -- produces index/normalizedIndex/randomId buffers
4. **Placement production** -- produces uv/rank/seed buffers

If these are currently private, they need to be exported or extracted to a shared module like `src/runtime/FieldKernelOps.ts`.

Search for these function definitions in Materializer.ts:
- `applyFieldKernel` or equivalent
- `fillIntrinsic` or equivalent
- The switch on `expr.kind === 'intrinsic'`

## File: src/runtime/ScheduleExecutor.ts

### Shadow mode for StepMaterialize

Locate the `materialize` case. Add shadow evaluation:

```typescript
case 'materialize': {
  const legacyBuffer = materialize(step.field, program.fieldExprs.nodes, ...);

  if (SHADOW_EVAL && program.valueExprs) {
    const veId = program.valueExprs.fieldToValue[step.field as number];
    if (veId !== undefined) {
      const veBuffer = materializeValueExpr(veId, program.valueExprs.nodes, ...);
      compareBuffers(legacyBuffer, veBuffer, step.field, veId, count, stride);
    }
  }

  // Use legacy buffer
  writeToSlot(state, step.target, legacyBuffer);
  break;
}
```

### Buffer comparison helper
```typescript
function compareBuffers(
  legacy: Float32Array,
  ve: Float32Array,
  fieldId: number,
  veId: number,
  count: number,
  stride: number,
): void {
  const EPSILON = 1e-6; // Float32 precision
  for (let i = 0; i < count * stride; i++) {
    if (Math.abs(legacy[i] - ve[i]) > EPSILON) {
      const lane = Math.floor(i / stride);
      const component = i % stride;
      console.warn(
        `Field mismatch at FieldExprId=${fieldId} VeId=${veId} lane=${lane} comp=${component}: ` +
        `legacy=${legacy[i]} ve=${ve[i]}`
      );
    }
  }
}
```

## Key patterns from existing Materializer.ts to follow

1. **Buffer caching**: Keyed by expression ID, stamped with frame ID
2. **BufferPool**: Pre-allocated buffer reuse to avoid GC pressure
3. **Stride handling**: `payloadStride(type.payload)` determines components per lane
4. **Instance resolution**: `requireManyInstance(expr.type)` extracts InstanceId from CanonicalType
5. **Cross-evaluator signal**: `evaluateSignal()` called for broadcast signal values

## Test file: src/runtime/__tests__/ValueExprMaterializer.test.ts (NEW)

Tests needed:
1. Field const -> all lanes filled with constant
2. Intrinsic index -> lanes 0..N-1
3. Intrinsic normalizedIndex -> lanes 0/(N-1)..1.0
4. Broadcast -> all lanes have signal value
5. Field map -> fn applied per-lane
6. Field zip -> fn applied to corresponding lanes
7. Field zipSig -> fn applied with field lanes and signal scalars
8. Field stateRead -> values from per-lane state
9. Buffer caching -> second call returns cached buffer
10. Cross-evaluator: broadcast reads signal correctly

Follow test pattern from existing Materializer tests in `src/runtime/__tests__/`.
