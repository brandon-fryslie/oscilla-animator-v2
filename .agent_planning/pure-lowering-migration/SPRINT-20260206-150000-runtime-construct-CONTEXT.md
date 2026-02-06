# Implementation Context: runtime-construct
Generated: 2026-02-06 15:00:00
Source: EVALUATION-20260206-143000.md
Confidence: HIGH

## WI-1: Extend ValueExprSignalEvaluator to handle construct()

### File: /Users/bmf/code/oscilla-animator-v2/src/runtime/ValueExprSignalEvaluator.ts

**Lines to modify**: 191-199 (construct and hslToRgb cases)

**Current code (line 191-199)**:
```typescript
case 'construct': {
  // Construct is field-extent only in practice (signal vec3 uses slotWriteStrided).
  throw new Error('construct expressions are field-extent, not signal-extent');
}

case 'hslToRgb': {
  // HSL→RGB is field-extent only (signal color uses slotWriteStrided).
  throw new Error('hslToRgb expressions are field-extent, not signal-extent');
}
```

**New function to add** (export from this file, after `evaluateValueExprSignal`):

```typescript
/**
 * Evaluate a multi-component (strided) ValueExpr signal, writing components
 * directly to state f64 storage.
 *
 * Used for construct() and hslToRgb() expressions where stride > 1.
 * Unlike evaluateValueExprSignal() which returns a single number,
 * this writes `stride` values starting at `targetOffset` in state.values.f64.
 */
export function evaluateValueExprSignalStrided(
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState,
  targetOffset: number,
  stride: number,
): void
```

**Implementation pattern** (mirror materializer construct case at ValueExprMaterializer.ts:96-108):
- For `construct`: iterate `expr.components`, call `evaluateValueExprSignal()` for each, write to `state.values.f64[targetOffset + i]`
- For `hslToRgb`: evaluate input (which should be a construct of 4 HSL components), apply HSL-to-RGB conversion (reuse math from ValueExprMaterializer.ts:607-628), write 4 RGBA values

**Also update the existing `construct` and `hslToRgb` cases** in `evaluateSignalExtent()` to return the first component value (for backward compatibility with any code that calls the scalar evaluator on a construct root):
```typescript
case 'construct': {
  // Evaluate first component as representative scalar value
  return evaluateValueExprSignal(expr.components[0], valueExprs, state);
}
```

**Existing pattern to follow** (from ValueExprMaterializer.ts:96-108):
```typescript
case 'construct': {
  const componentBufs = expr.components.map(compId =>
    materializeValueExpr(compId, table, instanceId, count, state, program, pool)
  );
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < componentBufs.length; c++) {
      buf[i * stride + c] = componentBufs[c][i];
    }
  }
  break;
}
```

**HSL-to-RGB math** (from ValueExprMaterializer.ts:607-628):
```typescript
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  // ... sector dispatch
}
```

**Import to add**: None new required (ValueExpr types already imported).

---

## WI-2: Remove stride=1 restriction in ScheduleExecutor

### File: /Users/bmf/code/oscilla-animator-v2/src/runtime/ScheduleExecutor.ts

**Lines to modify**: 248-263 (f64 storage branch of evalValue handler)

**Current code (line 248-263)**:
```typescript
} else if (storage === 'f64') {
  if (stride !== 1) {
    throw new Error(`evalValue: expected stride=1 for scalar signal slot ${slot}, got stride=${stride}`);
  }
  const value = evaluateValueExprSignal(step.expr as any, program.valueExprs.nodes, state);
  writeF64Scalar(state, lookup, value);
  state.tap?.recordSlotValue?.(slot, value);
  state.cache.values[step.expr as number] = value;
  state.cache.stamps[step.expr as number] = state.cache.frameId;
}
```

**Replace with**: Branch on stride:
```typescript
} else if (storage === 'f64') {
  if (stride === 1) {
    // Fast scalar path (unchanged)
    const value = evaluateValueExprSignal(step.expr as any, program.valueExprs.nodes, state);
    writeF64Scalar(state, lookup, value);
    state.tap?.recordSlotValue?.(slot, value);
    state.cache.values[step.expr as number] = value;
    state.cache.stamps[step.expr as number] = state.cache.frameId;
  } else {
    // Multi-component path (construct/hslToRgb)
    evaluateValueExprSignalStrided(
      step.expr as any, program.valueExprs.nodes, state, offset, stride
    );
    // Debug tap for each component
    for (let i = 0; i < stride; i++) {
      state.tap?.recordSlotValue?.((slot + i) as ValueSlot, state.values.f64[offset + i]);
    }
  }
}
```

**Import to add** (line ~27):
```typescript
import { evaluateValueExprSignal, evaluateValueExprSignalStrided } from './ValueExprSignalEvaluator';
```
(Change existing import to include new function)

---

## WI-3: Tests for multi-component signal construction

### File: /Users/bmf/code/oscilla-animator-v2/src/runtime/__tests__/ValueExprSignalEvaluator.test.ts

**Existing test patterns** (line 27-35):
```typescript
function createTestState(slotValues: Record<number, number>, valueExprCount: number) {
  const maxSlot = Math.max(...Object.keys(slotValues).map(Number), 0) + 1;
  const state = createRuntimeState(maxSlot, 0, 0, 0, valueExprCount);
  state.time = DUMMY_TIME;
  for (const [slot, value] of Object.entries(slotValues)) {
    state.values.f64[Number(slot)] = value;
  }
  return state;
}
```

**New test section to add** (after existing describe blocks):
```typescript
describe('construct (multi-component signal)', () => {
  it('evaluates construct([const(1.0), const(2.0)]) and writes to strided slots', () => {
    // ValueExpr table:
    // [0] = const(1.0, float)
    // [1] = const(2.0, float)
    // [2] = construct([0, 1], vec2)
    // ...
  });
});
```

**Types to use**:
- `ValueExpr` from `../../compiler/ir/value-expr`
- `valueExprId`, `valueSlot` from `../../compiler/ir/Indices`
- `canonicalType`, `FLOAT`, `VEC2`, `VEC3`, `COLOR` from `../../core/canonical-types`

**ValueExpr construction for tests**:
```typescript
const exprs: ValueExpr[] = [
  { kind: 'const', type: canonicalType(FLOAT), value: { kind: 'float', value: 1.0 } },
  { kind: 'const', type: canonicalType(FLOAT), value: { kind: 'float', value: 2.0 } },
  { kind: 'construct', type: canonicalType(VEC2), components: [valueExprId(0), valueExprId(1)] },
];
```
