# Level 7: Depth Ordering and Visibility

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
  >
- [ ] Depth sort is stable: equal depths preserve original order
  >
- [ ] `visible = false` instances are excluded from the sorted render list
  >

## Integration Tests (Ortho)

- [ ] Patch with Group A (z=0.0) and Group B (z=0.4): Group B appears in front (closer to camera at z=1.0)
  >
- [ ] Verify by checking depth values: all Group B depths < all Group A depths
  >
- [ ] Backend draw order respects depth: Group B drawn after Group A (painter's algorithm)
  >

## Integration Tests (Perspective)

- [ ] Same patch under perspective: depth ordering preserved (B still in front of A)
  >
- [ ] Screen positions now differ between groups (parallax), but ordering is same
  >

## Integration Tests (Culling)

- [ ] Patch with instances at z = -1, 0, 0.5, 1, 50, 150:
  - Under perspective (cam at z=2.0, far=100): z=150 has `visible=false`
  - All other instances have `visible=true`
  - Backend receives no draw command for the culled instance
  >
- [ ] Culling state does not persist: if instance moves back into frustum next frame, `visible` flips to `true`
  >
