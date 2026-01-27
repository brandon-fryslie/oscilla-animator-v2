# Quick Reference: projectInstances Helper Extraction

**Sprint:** Single sprint (2-4 hours)  
**Files:** `src/runtime/RenderAssembler.ts`, `src/runtime/index.ts`

---

## Helper #1: projectAndCompact()

**Insert after line 283 in RenderAssembler.ts**

```typescript
/**
 * Project world-space instances and depth-sort/compact in one step.
 * Returns OWNED copies of all buffers (safe for persistent storage).
 */
export function projectAndCompact(
  worldPositions: Float32Array,
  worldRadius: number,
  count: number,
  color: Uint8ClampedArray,
  camera: ResolvedCameraParams,
  rotation?: Float32Array,
  scale2?: Float32Array,
  pool?: BufferPool,
): {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  depth: Float32Array;
  color: Uint8ClampedArray;
  rotation?: Float32Array;
  scale2?: Float32Array;
} {
  const projection = projectInstances(worldPositions, worldRadius, count, camera, pool);
  const compacted = depthSortAndCompact(projection, count, color, rotation, scale2);
  
  return {
    count: compacted.count,
    screenPosition: new Float32Array(compacted.screenPosition),
    screenRadius: new Float32Array(compacted.screenRadius),
    depth: new Float32Array(compacted.depth),
    color: new Uint8ClampedArray(compacted.color),
    rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
    scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
  };
}
```

---

## Helper #2: compactAndCopy()

**Insert after projectAndCompact()**

```typescript
/**
 * Depth-sort, compact, and copy projection results in one step.
 * For multi-group path where projection already done.
 */
export function compactAndCopy(
  projection: ProjectionOutput,
  count: number,
  color: Uint8ClampedArray,
  rotation?: Float32Array,
  scale2?: Float32Array,
): {
  count: number;
  screenPosition: Float32Array;
  screenRadius: Float32Array;
  depth: Float32Array;
  color: Uint8ClampedArray;
  rotation?: Float32Array;
  scale2?: Float32Array;
} {
  const compacted = depthSortAndCompact(projection, count, color, rotation, scale2);
  
  return {
    count: compacted.count,
    screenPosition: new Float32Array(compacted.screenPosition),
    screenRadius: new Float32Array(compacted.screenRadius),
    depth: new Float32Array(compacted.depth),
    color: new Uint8ClampedArray(compacted.color),
    rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
    scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
  };
}
```

---

## Call Site #1: assembleDrawPathInstancesOp (lines 1200-1218)

**Replace:**
```typescript
const projection = projectInstances(positionBuffer, scale, count, context.resolvedCamera, pool);
const compacted = depthSortAndCompact(projection, count, colorBuffer, rotation, scale2);
const compactedCopy = {
  count: compacted.count,
  screenPosition: new Float32Array(compacted.screenPosition),
  screenRadius: new Float32Array(compacted.screenRadius),
  depth: new Float32Array(compacted.depth),
  color: new Uint8ClampedArray(compacted.color),
  rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
  scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
};
```

**With:**
```typescript
const compactedCopy = projectAndCompact(
  positionBuffer,
  scale,
  count,
  colorBuffer,
  context.resolvedCamera,
  rotation,
  scale2,
  pool
);
```

---

## Call Site #2: assemblePerInstanceShapes (lines 826-846)

**Replace:**
```typescript
const compacted = depthSortAndCompact(
  groupProjection,
  group.instanceIndices.length,
  color,
  rotation,
  scale2
);

const compactedCopy = {
  count: compacted.count,
  screenPosition: new Float32Array(compacted.screenPosition),
  screenRadius: new Float32Array(compacted.screenRadius),
  depth: new Float32Array(compacted.depth),
  color: new Uint8ClampedArray(compacted.color),
  rotation: compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
  scale2: compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
};
```

**With:**
```typescript
const compactedCopy = compactAndCopy(
  groupProjection,
  group.instanceIndices.length,
  color,
  rotation,
  scale2
);
```

---

## Exports (src/runtime/index.ts)

**Add:**
```typescript
export { projectAndCompact, compactAndCopy } from './RenderAssembler';
```

---

## Verification Commands

```bash
# Type check
npm run typecheck

# Run all tests
npm run test

# Visual verification
npm run dev
# Open http://localhost:5174 and verify rendering
```

---

## Rollback (if needed)

```bash
# Revert changes to call sites (keep helpers in place)
git checkout src/runtime/RenderAssembler.ts
git checkout src/runtime/index.ts
```

---

## Success Checklist

- [ ] Both helpers added to RenderAssembler.ts
- [ ] Call site #1 refactored (lines 1200-1218)
- [ ] Call site #2 refactored (lines 826-846)
- [ ] Exports added to src/runtime/index.ts
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all green)
- [ ] Visual verification (dev server)
- [ ] Code review (verify copy logic is identical)

---

**See CONTEXT document for full JSDoc and detailed implementation notes.**
