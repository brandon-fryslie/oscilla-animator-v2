# Implementation Context: Per-Instance Transforms & Performance
Generated: 2026-01-22
Plan: SPRINT-20260122-transforms-perf-PLAN.md
DOD: SPRINT-20260122-transforms-perf-DOD.md

## Overview

This sprint wires per-instance size/rotation/scale2 through the IR and assembler, adds topology group caching, and establishes benchmark infrastructure. The renderer already supports all per-instance transforms — this work connects the pipeline.

## Current Architecture (What Exists)

### StepRender IR (src/compiler/ir/types.ts:440-455)

```typescript
export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: string;
  readonly positionSlot: ValueSlot;
  readonly colorSlot: ValueSlot;
  readonly scale?: { readonly k: 'sig'; readonly id: SigExprId };  // Uniform only
  readonly shape?: /* sig or slot */;
  readonly controlPoints?: { readonly k: 'slot'; readonly slot: ValueSlot };
}
```

**Gap**: No `sizeSlot`, `rotationSlot`, `scale2Slot` fields.

### RenderAssembler (src/runtime/RenderAssembler.ts)

**resolveScale** (approx line 620): Evaluates the `scale` signal to get a uniform number.

**buildInstanceTransforms** (line 581-595):
```typescript
function buildInstanceTransforms(
  count: number,
  position: Float32Array,
  size: number,           // ← Always uniform number
  rotation?: Float32Array,
  scale2?: Float32Array
): InstanceTransforms { ... }
```

Already ACCEPTS Float32Array for rotation/scale2, but `size` is always `number`.

**assemblePerInstanceShapes** (line 438-528):
```typescript
const instanceTransforms: InstanceTransforms = {
  count: group.instanceIndices.length,
  position,
  size: scale, // Uniform scale  ← HARDCODED
  // rotation: undefined,  // Not yet wired through IR
  // scale2: undefined,    // Not yet wired through IR
};
```

**sliceInstanceBuffers** (line 394-421): Only slices position and color.

### Canvas2DRenderer (src/render/Canvas2DRenderer.ts:405-423)

Already fully supports per-instance transforms:
```typescript
ctx.translate(x, y);           // world → viewport
ctx.rotate(rotation);          // per-instance rotation (Float32Array)
ctx.scale(scale2.x, scale2.y); // per-instance anisotropic scale (Float32Array)
ctx.scale(sizePx, sizePx);     // isotropic size (number or Float32Array)
```

**No renderer changes needed.**

### InstanceTransforms Type (src/render/future-types.ts:117-132)

```typescript
export interface InstanceTransforms {
  readonly count: number;
  readonly position: Float32Array;
  readonly size: number | Float32Array;  // ← Already supports both
  readonly rotation?: Float32Array;
  readonly scale2?: Float32Array;
}
```

**No type changes needed.**

## Implementation Steps

### Step 1: Extend StepRender

In `src/compiler/ir/types.ts`, add to `StepRender`:

```typescript
export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: string;
  readonly positionSlot: ValueSlot;
  readonly colorSlot: ValueSlot;

  /** Uniform scale signal (legacy, overridden by sizeSlot) */
  readonly scale?: { readonly k: 'sig'; readonly id: SigExprId };

  /** Per-instance size buffer (Float32Array, 1 float per instance) */
  readonly sizeSlot?: ValueSlot;

  /** Per-instance rotation buffer (Float32Array, radians, 1 float per instance) */
  readonly rotationSlot?: ValueSlot;

  /** Per-instance anisotropic scale buffer (Float32Array, x,y interleaved, 2 per instance) */
  readonly scale2Slot?: ValueSlot;

  readonly shape?: /* unchanged */;
  readonly controlPoints?: /* unchanged */;
}
```

### Step 2: Add Transform Resolution Functions

In `RenderAssembler.ts`, add:

```typescript
/**
 * Resolve size: per-instance slot > uniform signal > default 1.0
 */
function resolveSize(
  step: StepRender,
  signals: readonly SigExpr[],
  state: RuntimeState,
  count: number
): number | Float32Array {
  if (step.sizeSlot !== undefined) {
    const buf = state.values.objects.get(step.sizeSlot);
    if (!buf || !(buf instanceof Float32Array)) {
      throw new Error(
        `RenderAssembler: Size buffer in slot ${step.sizeSlot} must be Float32Array`
      );
    }
    if (buf.length < count) {
      throw new Error(
        `RenderAssembler: Size buffer length ${buf.length} < instance count ${count}`
      );
    }
    return buf;
  }
  if (step.scale) {
    return evaluateSignal(step.scale.id, signals, state);
  }
  return 1.0;
}

/**
 * Resolve optional per-instance rotation from slot
 */
function resolveRotation(
  step: StepRender,
  state: RuntimeState,
  count: number
): Float32Array | undefined {
  if (step.rotationSlot === undefined) return undefined;
  const buf = state.values.objects.get(step.rotationSlot);
  if (!buf || !(buf instanceof Float32Array)) {
    throw new Error(
      `RenderAssembler: Rotation buffer in slot ${step.rotationSlot} must be Float32Array`
    );
  }
  if (buf.length < count) {
    throw new Error(
      `RenderAssembler: Rotation buffer length ${buf.length} < instance count ${count}`
    );
  }
  return buf;
}

/**
 * Resolve optional per-instance scale2 from slot
 */
function resolveScale2(
  step: StepRender,
  state: RuntimeState,
  count: number
): Float32Array | undefined {
  if (step.scale2Slot === undefined) return undefined;
  const buf = state.values.objects.get(step.scale2Slot);
  if (!buf || !(buf instanceof Float32Array)) {
    throw new Error(
      `RenderAssembler: Scale2 buffer in slot ${step.scale2Slot} must be Float32Array`
    );
  }
  if (buf.length < count * 2) {
    throw new Error(
      `RenderAssembler: Scale2 buffer length ${buf.length} < required ${count * 2} (x,y interleaved)`
    );
  }
  return buf;
}
```

### Step 3: Update assembleDrawPathInstancesOp

Replace the single `resolveScale` call with the new resolution functions, and pass results through to both the uniform and per-instance paths:

```typescript
// In assembleDrawPathInstancesOp():
const size = resolveSize(step, signals, state, count);
const rotation = resolveRotation(step, state, count);
const scale2 = resolveScale2(step, state, count);

// Uniform path:
const instanceTransforms = buildInstanceTransforms(count, positionBuffer, size, rotation, scale2);

// Per-instance shapes path:
// Pass size/rotation/scale2 to assemblePerInstanceShapes()
```

### Step 4: Update buildInstanceTransforms Signature

```typescript
function buildInstanceTransforms(
  count: number,
  position: Float32Array,
  size: number | Float32Array,  // ← Changed from just number
  rotation?: Float32Array,
  scale2?: Float32Array
): InstanceTransforms { ... }
```

### Step 5: Extend sliceInstanceBuffers

```typescript
interface SlicedBuffers {
  position: Float32Array;
  color: Uint8ClampedArray;
  size?: Float32Array;
  rotation?: Float32Array;
  scale2?: Float32Array;
}

function sliceInstanceBuffers(
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  instanceIndices: number[],
  fullSize?: Float32Array,
  fullRotation?: Float32Array,
  fullScale2?: Float32Array
): SlicedBuffers {
  const N = instanceIndices.length;
  const result: SlicedBuffers = {
    position: new Float32Array(N * 2),
    color: new Uint8ClampedArray(N * 4),
  };

  for (let i = 0; i < N; i++) {
    const srcIdx = instanceIndices[i];
    result.position[i*2]   = fullPosition[srcIdx*2];
    result.position[i*2+1] = fullPosition[srcIdx*2+1];
    result.color[i*4]   = fullColor[srcIdx*4];
    result.color[i*4+1] = fullColor[srcIdx*4+1];
    result.color[i*4+2] = fullColor[srcIdx*4+2];
    result.color[i*4+3] = fullColor[srcIdx*4+3];
  }

  if (fullSize) {
    result.size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      result.size[i] = fullSize[instanceIndices[i]];
    }
  }

  if (fullRotation) {
    result.rotation = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      result.rotation[i] = fullRotation[instanceIndices[i]];
    }
  }

  if (fullScale2) {
    result.scale2 = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const srcIdx = instanceIndices[i];
      result.scale2[i*2]   = fullScale2[srcIdx*2];
      result.scale2[i*2+1] = fullScale2[srcIdx*2+1];
    }
  }

  return result;
}
```

### Step 6: Update assemblePerInstanceShapes

Pass resolved transforms through, and use sliced results:

```typescript
function assemblePerInstanceShapes(
  step: StepRender,
  shapeBuffer: Uint32Array,
  fullPosition: Float32Array,
  fullColor: Uint8ClampedArray,
  size: number | Float32Array,      // ← Changed
  rotation: Float32Array | undefined, // ← New
  scale2: Float32Array | undefined,   // ← New
  count: number,
  state: RuntimeState
): DrawPathInstancesOp[] {
  const groups = groupInstancesByTopology(shapeBuffer, count);
  const ops: DrawPathInstancesOp[] = [];

  // Extract per-instance buffers (only if Float32Array)
  const fullSize = size instanceof Float32Array ? size : undefined;
  const uniformSize = typeof size === 'number' ? size : undefined;

  for (const [key, group] of groups) {
    if (group.instanceIndices.length === 0) continue;

    // ... topology validation (unchanged) ...

    const sliced = sliceInstanceBuffers(
      fullPosition, fullColor, group.instanceIndices,
      fullSize, rotation, scale2
    );

    const instanceTransforms: InstanceTransforms = {
      count: group.instanceIndices.length,
      position: sliced.position,
      size: sliced.size ?? uniformSize ?? 1.0,
      rotation: sliced.rotation,
      scale2: sliced.scale2,
    };

    // ... geometry, style, push op (unchanged) ...
  }

  return ops;
}
```

### Step 7: Topology Group Caching

Add WeakMap cache:

```typescript
// Module-level cache
const topologyGroupCache = new WeakMap<
  Uint32Array,
  { count: number; groups: Map<string, TopologyGroup> }
>();

function groupInstancesByTopology(
  shapeBuffer: Uint32Array,
  instanceCount: number
): Map<string, TopologyGroup> {
  // Check cache
  const cached = topologyGroupCache.get(shapeBuffer);
  if (cached && cached.count === instanceCount) {
    return cached.groups;
  }

  // Compute (existing algorithm)
  const groups = computeTopologyGroups(shapeBuffer, instanceCount);

  // Store in cache
  topologyGroupCache.set(shapeBuffer, { count: instanceCount, groups });

  return groups;
}

// Rename existing implementation
function computeTopologyGroups(
  shapeBuffer: Uint32Array,
  instanceCount: number
): Map<string, TopologyGroup> {
  // ... existing grouping logic (unchanged) ...
}
```

### Step 8: Benchmark Suite

Create `src/runtime/__benchmarks__/RenderAssembler.bench.ts`:

```typescript
import { bench, describe } from 'vitest';
import { groupInstancesByTopology, sliceInstanceBuffers } from '../RenderAssembler';
// ... imports, test helpers ...

function createShapeBuffer(instanceCount: number, topologyCount: number): Uint32Array {
  const buf = new Uint32Array(instanceCount * SHAPE2D_WORDS);
  for (let i = 0; i < instanceCount; i++) {
    const offset = i * SHAPE2D_WORDS;
    buf[offset] = i % topologyCount; // topologyId cycles through topologies
    buf[offset + 1] = i % topologyCount; // pointsFieldSlot
    buf[offset + 2] = 5; // pointsCount
  }
  return buf;
}

describe('groupInstancesByTopology', () => {
  const buf100_5 = createShapeBuffer(100, 5);
  const buf500_10 = createShapeBuffer(500, 10);
  const buf1000_50 = createShapeBuffer(1000, 50);

  bench('100 instances, 5 topologies', () => {
    groupInstancesByTopology(buf100_5, 100);
  });

  bench('500 instances, 10 topologies', () => {
    groupInstancesByTopology(buf500_10, 500);
  });

  bench('1000 instances, 50 topologies', () => {
    groupInstancesByTopology(buf1000_50, 1000);
  });
});

describe('sliceInstanceBuffers', () => {
  const pos = new Float32Array(200); // 100 instances
  const color = new Uint8ClampedArray(400);
  const indices20 = Array.from({ length: 20 }, (_, i) => i * 5);
  const indices50 = Array.from({ length: 50 }, (_, i) => i * 2);

  bench('slice 20 from 100', () => {
    sliceInstanceBuffers(pos, color, indices20);
  });

  bench('slice 50 from 100', () => {
    sliceInstanceBuffers(pos, color, indices50);
  });
});

describe('topology group cache', () => {
  const buf = createShapeBuffer(100, 5);

  bench('cache miss (first call)', () => {
    const fresh = createShapeBuffer(100, 5); // New reference each time
    groupInstancesByTopology(fresh, 100);
  });

  bench('cache hit (same reference)', () => {
    groupInstancesByTopology(buf, 100); // Same reference
  });
});
```

## Key Files

| File | Change Type | Lines Affected |
|------|-------------|----------------|
| `src/compiler/ir/types.ts` | ADD fields | ~5 lines in StepRender |
| `src/runtime/RenderAssembler.ts` | MODIFY | ~80 lines (resolution, slicing, caching) |
| `src/runtime/__tests__/RenderAssembler.test.ts` | ADD tests | ~120 lines |
| `src/runtime/__benchmarks__/RenderAssembler.bench.ts` | NEW file | ~80 lines |
| `vitest.config.ts` | ADD bench config | ~3 lines |
| `package.json` | ADD script | 1 line |

## Testing Strategy

### Unit Tests (in RenderAssembler.test.ts)

1. **resolveSize**: slot present → reads Float32Array; slot absent → falls back to signal; neither → 1.0
2. **resolveRotation**: slot present → reads Float32Array; slot absent → undefined
3. **resolveScale2**: slot present → reads Float32Array; slot absent → undefined; length validation
4. **sliceInstanceBuffers (extended)**: size/rotation/scale2 slicing at various indices
5. **topology group cache**: hit/miss/invalidation scenarios
6. **assembleDrawPathInstancesOp**: end-to-end with per-instance transforms

### Integration (no changes needed)

Canvas2DRenderer already handles all per-instance transform types. The only new integration is assembler → renderer, which is tested by the existing frame assembly tests (just need to pass through the new fields).

## Verification Commands

```bash
npm run typecheck     # Verify no type errors
npm run test          # All tests pass
npm run bench         # Benchmarks run and produce results
```

## Notes

- **Uniform is default**: When no slots are provided, behavior is identical to current. Zero regression risk.
- **Renderer untouched**: Canvas2DRenderer already handles per-instance Float32Array for size/rotation/scale2.
- **Compiler untouched**: No blocks currently emit per-instance transforms. The slots exist in IR for future use.
- **WeakMap is GC-friendly**: No manual cache invalidation needed. Buffer deallocation cleans cache.
