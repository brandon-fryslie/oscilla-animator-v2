# Definition of Done: buffer-prealloc
Sprint: Preallocate Depth-Sort Permutation Buffers
Bead: oscilla-animator-v2-la0

## Acceptance Criteria

### 1. Module-Level Buffer Pool
- [x] `pooledIndices: Uint32Array` declared at module level
- [x] `pooledScreenPos: Float32Array` declared at module level (stride 2)
- [x] `pooledRadius: Float32Array` declared at module level (stride 1)
- [x] `pooledDepth: Float32Array` declared at module level (stride 1)
- [x] `pooledColor: Uint8ClampedArray` declared at module level (stride 4)
- [x] `pooledRotation: Float32Array` declared at module level (stride 1)
- [x] `pooledScale2: Float32Array` declared at module level (stride 2)
- [x] Initial capacity of at least 256 instances

### 2. Grow-Only Resize Helper
- [x] `ensureBufferCapacity(count: number)` function exists
- [x] Returns early if current capacity is sufficient
- [x] Grows all buffers together to avoid capacity mismatch
- [x] Uses at least 2x growth factor (amortized O(1))

### 3. depthSortAndCompact Updated
- [x] Calls `ensureBufferCapacity(count)` at function start
- [x] Uses `Uint32Array` for indices instead of `number[]`
- [x] Writes output to pooled buffers (no `new Float32Array` in hot path)
- [x] Returns properly-sized fresh copies (ensures caller independence)
- [x] Return value interface unchanged (same properties, same behavior)

### 4. Tests Pass
- [x] `npm run test RenderAssembler.test.ts` passes (12/12)
- [x] `npm run test RenderAssembler-per-instance-shapes.test.ts` passes (8/8)
- [x] Full test suite has no new failures (typecheck has pre-existing errors unrelated to this work)

### 5. No Behavior Change
- [x] Existing callers work without modification
- [x] Sort order unchanged (far-to-near, stable)
- [x] Fast-path optimization still works (skip sort for already-ordered)

## Implementation Notes

**Final approach:** Returns fresh copies instead of subarray views to ensure caller independence.
- Pooled buffers are used during hot path (index building, sorting, compacting)
- Final output is copied to ensure each caller gets independent data
- Still significant performance win: avoid allocation during expensive operations
- Mitigates risk of callers holding stale references when depthSortAndCompact is called multiple times per frame

## Out of Scope
- Thread safety (single-threaded runtime)
- Buffer clearing/zeroing (not needed - we overwrite)
- Performance benchmarking (nice-to-have, not required)
- Changes to public interface

## Verification Commands
```bash
npm run test RenderAssembler.test.ts
npm run test RenderAssembler-per-instance-shapes.test.ts
```

## Status: COMPLETE
All acceptance criteria met. Commit: 941d47a
