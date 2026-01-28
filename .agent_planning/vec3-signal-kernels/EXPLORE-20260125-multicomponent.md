# Exploration: Full Multi-Component Signal Support
Timestamp: 2026-01-25-160000
Git Commit: 436f5a8

## Exploration Summary

This exploration expands the previous vec3-signal-kernels analysis to cover FULL multi-component signal support: vec2 (stride 2), vec3 (stride 3), vec4 (stride 4), and color (rgba, stride 4).

## Files Examined

### Core Type System
- `/Users/bmf/code/oscilla-animator-v2/src/core/canonical-types.ts` - PayloadType definitions, PAYLOAD_STRIDE table

### Runtime Evaluation
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/SignalEvaluator.ts` - Signal-level kernel evaluation (SCALAR-ONLY)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/FieldKernels.ts` - Field-level kernel implementations (SUPPORTS MULTI-COMPONENT)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/Materializer.ts` - Field materialization orchestration
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/OpcodeInterpreter.ts` - Scalar opcode evaluation
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/ScheduleExecutor.ts` - Frame execution with slot writes
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/RuntimeState.ts` - Value storage architecture

### Block Files
- `/Users/bmf/code/oscilla-animator-v2/src/blocks/signal-blocks.ts` - Const block with payload polymorphism
- `/Users/bmf/code/oscilla-animator-v2/src/blocks/geometry-blocks.ts` - PolarToCartesian, OffsetVec (use missing vec3 signal kernels)
- `/Users/bmf/code/oscilla-animator-v2/src/blocks/color-blocks.ts` - Color manipulation blocks
- `/Users/bmf/code/oscilla-animator-v2/src/blocks/field-operations-blocks.ts` - SetZ and other operations

### IR Types
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts` - SigExpr and FieldExpr definitions

## Key Findings

### 1. Canonical Stride Table (canonical-types.ts)

```typescript
export const PAYLOAD_STRIDE: Record<ConcretePayloadType, number> = {
  float: 1,
  int: 1,
  bool: 1,
  vec2: 2,
  vec3: 3,
  color: 4,
  shape: 8,
  cameraProjection: 1,
};
```

This establishes the expected strides for all payload types.

### 2. SignalEvaluator Architecture (SignalEvaluator.ts)

The SignalEvaluator is explicitly designed for **scalar-only** operations (lines 13-26):
```
WHAT BELONGS HERE:
- Oscillators (phase [0,1) → value [-1,1])
- Easing functions (t [0,1] → u [0,1])
- Shaping functions (smoothstep, step)
- Noise (deterministic, seeded)

WHAT DOES NOT BELONG HERE:
- Vec2/geometry operations → use Materializer field kernels
- Field-level operations → use Materializer
```

Current `evaluateSignal()` returns a single `number`, not a multi-component array.

### 3. Field Kernels Support Multi-Component (FieldKernels.ts)

Field kernels already handle multi-component types:
- `makeVec2(x, y)` → stride 2
- `makeVec3(x, y)` → stride 3 (z=0)
- `fieldJitterVec(pos, rand, amtX, amtY, amtZ)` → stride 3
- `fieldPolarToCartesian(cx, cy, r, angle)` → stride 3
- `fieldSetZ(pos, z)` → stride 3
- `hsvToRgb(h, s, v)` → stride 4 (rgba)
- `perElementOpacity(color, opacity)` → stride 4
- `applyOpacity(color, opacity)` → stride 4

### 4. RuntimeState Value Storage (RuntimeState.ts)

```typescript
export interface ValueStore {
  /** Numeric values (most signals) */
  f64: Float64Array;

  /** Object values (colors, complex types) */
  objects: Map<ValueSlot, unknown>;

  /** Packed shape2d values */
  shape2d: Uint32Array;
}
```

Vec2/vec3/color signals could use either:
- Multiple consecutive f64 slots (stride-based)
- Object storage in the Map

### 5. ScheduleExecutor Slot Writing (ScheduleExecutor.ts)

Current helpers:
- `writeF64Scalar(state, lookup, value)` - requires stride=1
- `writeF64Strided(state, lookup, src, stride)` - allows any stride

The strided write exists but the signal evaluator doesn't produce arrays.

### 6. Const Block Polymorphism (signal-blocks.ts)

The Const block demonstrates payload polymorphism:
```typescript
case 'vec2': {
  const xSig = ctx.b.sigConst(val.x, canonicalType('float'));
  const ySig = ctx.b.sigConst(val.y, canonicalType('float'));
  const packFn = ctx.b.kernel('packVec2');
  sigId = ctx.b.sigZip([xSig, ySig], packFn, canonicalType('vec2'));
  break;
}
case 'color': {
  const packFn = ctx.b.kernel('packColor');
  sigId = ctx.b.sigZip([rSig, gSig, bSig, aSig], packFn, canonicalType('color'));
  break;
}
```

The kernels `packVec2` and `packColor` are referenced but **do not exist** in SignalEvaluator.

### 7. Missing Signal Kernels (Complete List)

Referenced but not implemented:
| Kernel | Referenced In | Purpose |
|--------|---------------|---------|
| `packVec2` | signal-blocks.ts:119 | Pack 2 floats → vec2 |
| `packColor` | signal-blocks.ts:136 | Pack 4 floats → color |
| `vec3FromComponents` | geometry-blocks.ts:78 | Pack 3 floats → vec3 |
| `jitterVecSig` | geometry-blocks.ts:199 | Jitter vec3 signal |
| `setZSig` | field-operations-blocks.ts:1030 | Set Z component |

### 8. Cardinality-Polymorphic Block Pattern

Blocks like PolarToCartesian have three paths:
1. **Signal path** (both inputs are signals) - uses missing signal kernels
2. **Field path** (both inputs are fields) - uses field kernels (works)
3. **Mixed path** (one signal, one field) - broadcasts signals to fields (works)

Only the pure-signal path is broken.

### 9. Test Coverage

- `signal-kernel-contracts.test.ts` - Tests scalar kernels only (oscSin, easing, etc.)
- `field-kernel-contracts.test.ts` - Tests multi-component field kernels (makeVec2, hsvToRgb, etc.)
- No tests for signal-level multi-component operations

### 10. IR Type System

SigExpr types include a `type: CanonicalType` field which can have any PayloadType including vec2/vec3/color. The IR allows multi-component signal types, but the runtime evaluator doesn't implement them.

## Summary

The architecture currently separates:
- **Signals**: Scalar-only, single f64 values
- **Fields**: Multi-component, typed arrays with stride

Multi-component signal support would require:
1. Signal kernels that pack multiple scalars into arrays
2. Signal evaluation that returns arrays instead of single numbers
3. Slot writes that handle stride > 1 for signal results
4. Cache structure that can store arrays

Alternatively, the pure-signal path for multi-component blocks could be removed, forcing use of field path with single-element instances.
