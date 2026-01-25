# Implementation Context: buffer-prealloc

## Key Files

### Primary
- `src/runtime/RenderAssembler.ts` - Contains `depthSortAndCompact` function (lines 113-220)

### Tests
- `src/runtime/__tests__/RenderAssembler.test.ts`
- `src/runtime/__tests__/RenderAssembler-per-instance-shapes.test.ts`

## Current Implementation

The `depthSortAndCompact` function at lines 113-220 currently:
1. Creates `indices: number[]` dynamically (line 131)
2. Allocates fresh TypedArrays for each output (lines 169-211)
3. Returns these fresh arrays

## Implementation Strategy

### Phase 1: Add Pooled Buffers (top of file, after imports)
Insert after the import block (around line 20):

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Preallocated Buffer Pool for depthSortAndCompact
// ═══════════════════════════════════════════════════════════════════════════
// These buffers are reused across frames to avoid per-frame allocations.
// They grow as needed (2x factor) but never shrink.
// Returned subarrays are views into these buffers - valid only until next call.

const INITIAL_POOL_CAPACITY = 256;

let pooledIndices: Uint32Array = new Uint32Array(INITIAL_POOL_CAPACITY);
let pooledScreenPos: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY * 2);
let pooledRadius: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY);
let pooledDepth: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY);
let pooledColor: Uint8ClampedArray = new Uint8ClampedArray(INITIAL_POOL_CAPACITY * 4);
let pooledRotation: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY);
let pooledScale2: Float32Array = new Float32Array(INITIAL_POOL_CAPACITY * 2);

function ensureBufferCapacity(needed: number): void {
  if (pooledIndices.length >= needed) return;

  const newSize = Math.max(needed, pooledIndices.length * 2);

  pooledIndices = new Uint32Array(newSize);
  pooledScreenPos = new Float32Array(newSize * 2);
  pooledRadius = new Float32Array(newSize);
  pooledDepth = new Float32Array(newSize);
  pooledColor = new Uint8ClampedArray(newSize * 4);
  pooledRotation = new Float32Array(newSize);
  pooledScale2 = new Float32Array(newSize * 2);
}
```

### Phase 2: Update depthSortAndCompact

Key changes:
1. Add `ensureBufferCapacity(count)` at start
2. Replace `const indices: number[] = []` with direct writes to `pooledIndices`
3. Replace `new Float32Array(...)` allocations with writes to pooled buffers
4. Return `.subarray(0, visibleCount * stride)` for each buffer

### Important: Index Collection

Current code:
```typescript
const indices: number[] = [];
for (let i = 0; i < count; i++) {
  if (visible[i] === 1) {
    indices.push(i);
  }
}
```

New code:
```typescript
let visibleCount = 0;
for (let i = 0; i < count; i++) {
  if (visible[i] === 1) {
    pooledIndices[visibleCount++] = i;
  }
}
```

### Important: Sort

Current code:
```typescript
indices.sort((a, b) => { ... });
```

New code needs to sort only the first `visibleCount` elements. Use a typed-array-compatible approach:

```typescript
// Sort only the visible portion
const indicesView = pooledIndices.subarray(0, visibleCount);
const sortedIndices = Array.from(indicesView).sort((a, b) => {
  const da = depth[a];
  const db = depth[b];
  if (da !== db) return db - da;
  return a - b;
});
for (let i = 0; i < visibleCount; i++) {
  pooledIndices[i] = sortedIndices[i];
}
```

Or use in-place quicksort for better performance.

## Caller Usage Review

Callers use the returned buffers immediately to build DrawOps:
- Line 754: `const compacted = depthSortAndCompact(...)`
- Line 1116: `const compacted = depthSortAndCompact(...)`

Both callers immediately consume the data to build `InstanceTransforms` and `PathStyle` objects. They don't hold long-lived references. This means `.subarray()` views are safe.

## Test Considerations

Tests may check exact reference equality. If so, they need updating to check values instead. The WORK-EVALUATION from the previous sprint (buffer-stride) shows that tests have already been updated to check values/instances rather than references.
