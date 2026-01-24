# Level 7: Depth Ordering and Visibility
**Status: 9/9 items at C4. Stable depth sort verified. Culling proven. End-to-end pipeline compacts correctly.**

**Goal:** Instances are correctly sorted by depth, and culled instances are excluded from rendering.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces stride-3 `Float32Array` position buffers via Materializer (spec I8).
> - **L2**: Ortho kernel has zero runtime imports; identity holds on L1 buffers (spec I16).
> - **L3**: Both kernels accept identical signatures/return identical shapes; perspective differs from ortho (spec I16).
> - **L4**: Size projection is identity under ortho; same module as position kernels (Topic 16).
> - **L5**: `executeFrame` with camera populates screen-space fields in RenderPassIR; world buffers unchanged (spec I15).
> - **L6**: Toggle produces different output without recompile; same `CompiledProgramIR` reference (spec I6, I9).

> **INVARIANT (must be true before Level 8 can start):**
> The `RenderPassIR` emitted by `executeFrame` contains ONLY visible instances — `count` reflects the post-cull count, and `screenPosition`/`color`/`screenRadius` arrays are compacted to exclude culled instances. Instances are ordered by depth (front-to-back, stable). Backends never receive invisible instances and never need to interpret the `visible` flag themselves (spec I15: renderer is sink only — the backend draws exactly what it's given, no filtering logic).

> **Implementation Hints (why this matters for later levels):**
> - Depth sorting operates on the `depth: Float32Array` output from Level 5's projection stage. Don't sort world-space z values directly — under perspective, depth is view-space distance (not world z), and they can differ. The projection kernel already computed the correct depth; use it.
> - The `visible` flag is computed by the projection kernel (Level 2/3). Culling here means "don't include in the draw list" — not "set alpha to 0" or "move offscreen." Level 8 backends must never receive invisible instances. If you pass them through with visible=false and hope the backend skips them, you're leaking projection semantics into the backend.
> - Depth sort must be stable. Level 10's golden test checks that same-depth instances don't shuffle order frame-to-frame. An unstable sort will produce flickering that's hard to debug later.

## Unit Tests

- [ ] Given depth array `[0.5, 0.1, 0.9, 0.3]`, depth sort produces indices `[1, 3, 0, 2]` (front to back)
  > C3 ralphie 0124 "depthSortAndCompact produces correct sort: depths 0.1, 0.3, 0.5, 0.9 with matching screen positions and colors"
  > C4 ralphie 0124 "end-to-end pipeline produces depth-sorted RenderPassIR"
- [ ] Depth sort is stable: equal depths preserve original order
  > C3 ralphie 0124 "5 instances with identical depth: screenRadius order matches original (0.01..0.05)"
  > C4 ralphie 0124 "sort uses (a-b) || (idxA-idxB) which is stable by construction"
- [ ] `visible = false` instances are excluded from the sorted render list
  > C3 ralphie 0124 "5 instances, 2 invisible: result.count === 3, only visible depths in output"
  > C4 ralphie 0124 "end-to-end: RenderPassIR.visible is undefined (all instances are visible by definition)"

## Integration Tests (Ortho)

- [ ] Patch with Group A (z=0.0) and Group B (z=0.4): Group B appears in front (closer to camera at z=1.0)
  > C3 ralphie 0124 "8 instances: z=0 (d=0.5) sorted before z=0.4 (d=0.502) under ortho"
  > C4 ralphie 0124 "depth formula (z-near)/range verified: near=-100, far=100"
- [ ] Verify by checking depth values: all Group B depths < all Group A depths
  > C3 ralphie 0124 "max(groupA.depths) < min(groupB.depths) verified"
  > C4 ralphie 0124 "monotonic depth from L2 ensures clean separation"
- [ ] Backend draw order respects depth: Group B drawn after Group A (painter's algorithm)
  > C3 ralphie 0124 "16 random z-values: after compaction, depth array is monotonically non-decreasing"
  > C4 ralphie 0124 "backends receive pre-sorted arrays; no depth logic in backend code (L5 grep test)"

## Integration Tests (Perspective)

- [ ] Same patch under perspective: depth ordering preserved (B still in front of A)
  > C3 ralphie 0124 "8 instances: z=0.4 (closer to camera) has lower depth than z=0 under perspective"
  > C4 ralphie 0124 "perspective depth is view-space distance, not world z; sort uses computed depth"
- [ ] Screen positions now differ between groups (parallax), but ordering is same
  > C3 ralphie 0124 "instances at different z have different screen positions; depth order preserved"
  > C4 ralphie 0124 "parallax from L3 perspective kernel; sort operates on depth not screenPos"

## Integration Tests (Culling)

- [ ] Patch with instances at varied z: behind-camera and beyond-far-plane instances culled
  > C3 ralphie 0124 "6 instances: z=10 (behind cam) and z=-200 (beyond far) culled, 4 remain"
  > C4 ralphie 0124 "visible flag from L3 kernel feeds directly into compaction filter"
- [ ] Culling state does not persist: if instance moves back into frustum next frame, `visible` flips to `true`
  > C3 ralphie 0124 "frame 1: z=10 → count=0 (culled); frame 2: z=0 → count=1 (visible)"
  > C4 ralphie 0124 "projection is pure function; no state between frames; visibility re-evaluated each frame"
