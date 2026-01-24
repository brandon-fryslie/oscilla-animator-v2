---
topic: 18
name: Camera & Projection
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/18-camera-projection.md
category: critical
audited: 2026-01-24T00:00:00Z
item_count: 3
---

# Topic 18: Camera & Projection - CRITICAL Items

## C-1: Depth Sort Direction is Inverted (Front-to-Back Instead of Far-to-Near)

**Spec requirement (Depth Ordering Contract, lines 260-262):**
> Primary key: depth (far-to-near)
> Larger depth values (farther from camera) drawn first
> Smaller depth values (nearer to camera) drawn last, overpainting farther objects

**Implementation (src/runtime/RenderAssembler.ts, line 146):**
```typescript
// Stable sort by depth (front-to-back: smaller depth first)
indices.sort((a, b) => {
  const da = depth[a];
  const db = depth[b];
  if (da !== db) return da - db;  // ascending depth = near first
  return a - b;
});
```

**Impact:** The sort order is inverted. The implementation draws near instances first, far instances last (overpainting near ones). Correct painter's algorithm requires far-to-near (draw far first, overpaint with near). The renderer in `Canvas2DRenderer.ts` (line 87) iterates `for (const op of frame.ops)` in order, so far instances drawn last will cover near instances.

**Within `depthSortAndCompact` specifically:** `da - db` produces ascending order (0.1 before 0.9). Spec requires `db - da` (descending = far first).

**Also incorrect in tests:** Level 7 tests (`src/projection/__tests__/level7-depth-culling.test.ts`) assert front-to-back order, confirming the bug is "tested in" rather than accidental.

**Fix:** Change sort comparator to `return db - da` (descending depth). Update all Level 7 tests to expect far-to-near.

---

## C-2: No Preallocated Permutation Buffer (Per-Frame Allocations)

**Spec requirement (Depth Ordering Contract, lines 305-309):**
> Permutation storage:
> - MUST be preallocated (no per-frame allocation)
> - Reuse same Uint32Array buffer across frames
> - Reallocate only when instanceCount increases

**Implementation (src/runtime/RenderAssembler.ts, lines 139-167):**
```typescript
const indices: number[] = [];
for (let i = 0; i < count; i++) {
  if (visible[i] === 1) {
    indices.push(i);
  }
}
// ...
const compactedScreenPos = new Float32Array(visibleCount * 2);
const compactedRadius = new Float32Array(visibleCount);
const compactedDepth = new Float32Array(visibleCount);
```

**Impact:** Every frame allocates:
- A new `number[]` for indices
- Multiple new `Float32Array` buffers for compacted output

This violates the preallocated buffer requirement and causes GC pressure in the hot render loop.

**Fix:** Maintain a persistent `Uint32Array` permutation buffer on the AssemblerContext (or RenderAssembler module scope) that grows only when instance count increases, never shrinks. Similarly preallocate compaction output buffers.

---

## C-3: No Two-Phase Ordering (Missing Fast-Path Monotone Check)

**Spec requirement (Depth Ordering Contract, lines 276-288):**
> Phase 1: Fast-path detection
> Check if depth array is already monotone decreasing (far-to-near):
> ```
> let alreadyOrdered = true;
> for (let i = 1; i < instanceCount; i++) {
>   if (visible[i] && visible[i-1] && depth[i] > depth[i-1]) {
>     alreadyOrdered = false;
>     break;
>   }
> }
> ```
> If true, skip sorting (common case for flat layouts or stable camera).

**Implementation:** No monotone check exists. The sort is always performed unconditionally.

**Impact:** Performance loss for the common case where all instances are at z=0 (flat layouts). In this case depth is already monotone and sort is unnecessary.

**Fix:** Add monotone check before sort. When already ordered, skip sort entirely and only compact visible instances.
