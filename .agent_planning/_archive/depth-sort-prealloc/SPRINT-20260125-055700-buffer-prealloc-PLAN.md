# Sprint: buffer-prealloc - Preallocate Depth-Sort Permutation Buffers
Generated: 2026-01-25-055700
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Bead: oscilla-animator-v2-la0

## Sprint Goal
Replace per-frame allocations in `depthSortAndCompact` with preallocated, grow-only module-level buffers to eliminate GC pressure during animation.

## Background

The `depthSortAndCompact` function in `src/runtime/RenderAssembler.ts` is called every frame for each draw group. Currently it allocates fresh TypedArrays on every call:

1. `indices: number[]` - dynamic array for permutation
2. `compactedScreenPos: Float32Array` - stride-2 screen positions
3. `compactedRadius: Float32Array` - stride-1 radii
4. `compactedDepth: Float32Array` - stride-1 depth values
5. `compactedColor: Uint8ClampedArray` - stride-4 RGBA
6. `compactedRotation?: Float32Array` - stride-1 rotations
7. `compactedScale2?: Float32Array` - stride-2 anisotropic scales

For a 1000-instance animation at 60fps, this creates thousands of short-lived allocations per second, causing GC pressure.

**Spec Reference:** Topic 18 lines 305-309

## Scope

**Deliverables:**
- Module-level buffer pool with grow-only semantics
- Updated `depthSortAndCompact` using pooled buffers
- Existing tests passing (no behavior change)

**NOT in scope:**
- Changing the function's public interface
- Adding buffer clearing between frames (not needed - we overwrite)
- Thread safety (single-threaded runtime)

## Work Items

### [P0] Create Module-Level Buffer Pool
**Confidence**: HIGH
**Dependencies**: None

#### Description
Add module-level preallocated buffers at the top of RenderAssembler.ts:

```typescript
// Preallocated buffers for depthSortAndCompact
// Grow-only: never shrink, reused across frames
let pooledIndices: Uint32Array = new Uint32Array(256);
let pooledScreenPos: Float32Array = new Float32Array(256 * 2);
let pooledRadius: Float32Array = new Float32Array(256);
let pooledDepth: Float32Array = new Float32Array(256);
let pooledColor: Uint8ClampedArray = new Uint8ClampedArray(256 * 4);
let pooledRotation: Float32Array = new Float32Array(256);
let pooledScale2: Float32Array = new Float32Array(256 * 2);
```

Use `Uint32Array` instead of `number[]` for indices (faster, no boxing).

#### Acceptance Criteria
- [ ] Module-level buffer variables declared at file top
- [ ] Initial capacity of 256 instances (reasonable default)
- [ ] `Uint32Array` used for indices (not `number[]`)

#### Technical Notes
- Use `let` not `const` since we may need to grow
- No need to clear between frames - we overwrite all used slots

---

### [P1] Add Grow-Only Resize Helper
**Confidence**: HIGH
**Dependencies**: P0

#### Description
Add a helper function to grow buffers when needed:

```typescript
function ensureBufferCapacity(needed: number): void {
  if (pooledIndices.length >= needed) return;

  // Grow by 2x to amortize allocation cost
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

#### Acceptance Criteria
- [ ] `ensureBufferCapacity(count)` function exists
- [ ] Uses 2x growth factor
- [ ] All buffers grown together (no size mismatch)

#### Technical Notes
- Could also use geometric growth: `newSize = Math.ceil(needed * 1.5)`
- Growing all together avoids needing to track capacity per-buffer

---

### [P2] Update depthSortAndCompact to Use Pooled Buffers
**Confidence**: HIGH
**Dependencies**: P0, P1

#### Description
Modify `depthSortAndCompact` to:
1. Call `ensureBufferCapacity(count)` at the start
2. Use `pooledIndices` instead of `indices: number[]`
3. Write to pooled buffers instead of allocating new ones
4. Return **views** or **slices** of the pooled buffers

Important: The return must NOT return the full pooled buffer. Return `.subarray(0, visibleCount)` or copy to new array. Since callers may hold references, we need to decide:

**Option A: Return subarray views** (zero-copy, but caller must not hold reference)
**Option B: Copy to fresh arrays** (safe, but still allocates - defeats purpose)
**Option C: Return the pooled buffer + count** (caller uses count, not length)

Recommend **Option A** with documentation that returned arrays are only valid until next call.

#### Acceptance Criteria
- [ ] `depthSortAndCompact` calls `ensureBufferCapacity(count)`
- [ ] Uses `pooledIndices` for index permutation
- [ ] Uses pooled buffers for all outputs
- [ ] Returns subarrays sized to `visibleCount` (not full buffer)
- [ ] All existing tests pass

#### Technical Notes
- `.subarray()` creates a view, not a copy (zero allocation)
- Sort operates in-place on the pooled indices buffer
- Color buffer uses `.subarray()` too (Uint8ClampedArray supports it)

## Dependencies

None - this is a self-contained optimization.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Callers hold reference to returned buffer | Medium | High | Document that returned arrays are frame-local; review call sites |
| Incorrect subarray bounds | Low | High | Careful bounds checking; tests catch this |
| Grow race condition | None | N/A | Single-threaded runtime |

## Verification

1. `npm run typecheck` passes
2. `npm run test` passes (existing tests)
3. Manual verification: no "new Float32Array" in hot path
4. Optional: profile with Chrome DevTools to confirm reduced allocations
