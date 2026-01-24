# Level 4: Size Projection (World Radius → Screen Radius)
**Status: 8/8 items at C4+. All tests passing. SOLID.**

**Goal:** Sizes project correctly under both modes. Still standalone math, but now combining position + size.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces stride-3 `Float32Array` position buffers via Materializer (spec I8).
> - **L2**: Ortho kernel has zero runtime imports; identity property holds on L1 buffers (spec I16).
> - **L3**: Both kernels accept identical input signatures and return identical output shapes; perspective differs from ortho for off-axis points (spec I16).

> **INVARIANT (must be true before Level 5 can start):**
> `projectWorldRadiusToScreenRadius` lives in the same module as the projection kernels, accepts `worldRadius + worldPos + cameraParams`, and under ortho defaults returns `worldRadius` unchanged (identity). This guarantees the RenderAssembler (Level 5) can call position projection and size projection together from one import, and that `RenderPass.screenRadius === worldRadius` under ortho — matching the spec's coordinate space contract (Topic 16: `scale` is world-space, backend does `scalePx = scale × viewport`).

> **Implementation Hints (why this matters for later levels):**
> - Size projection depends on the instance's world position (because perspective foreshortening varies with distance). The function signature must accept BOTH worldRadius AND worldPos. Don't compute it from screenPos — that's a derived value you don't have yet at this stage.
> - This function lives in the same kernel module as the projection kernels. Level 5 calls position projection and size projection together in the RenderAssembler. Same module = one import.
> - Under ortho with default camera, size projection MUST be identity (screenRadius === worldRadius). If it's not, Level 5's integration test (`RenderPass.screenRadius === 0.03`) will fail and you'll be debugging the wrong layer.

## Unit Tests

- [ ] `projectWorldRadiusToScreenRadius(0.05, (0.5, 0.5, 0), orthoDefaults)` → `0.05` (identity)
  > C3 impl-01 0123 "ortho returns worldRadius unchanged, toBe(0.05)"
  > C3 reviewer-02 0123 "confirmed: pure identity, no allocs, interface matches persp variant. Field variant uses toBeCloseTo due to f32 storage — appropriate."
  > C4 reviewer-04 0123 "trivially correct identity, toBe() bitwise check, mathematically provable"
- [ ] `projectWorldRadiusToScreenRadius(0.05, (0.5, 0.5, 0), perspDefaults)` → some value != 0.05 (perspective changes it)
  > C3 impl-01 0123 "perspective returns different value, >0, finite"
  > C2 reviewer-04 0123 "only checks 'different and positive', doesn't verify 1/distance formula"
  > C4 impl-02 0123 "fixed: added quantitative check against expected formula worldR/(viewZ*tan(fov/2))"
- [ ] Under perspective: same radius at z=0 vs z=0.5 → the farther instance has smaller screen radius
  > C3 impl-01 0123 "z=0 farther from cam → smaller; z=-1 even smaller"
  > C2 reviewer-04 0123 "DoD wording ambiguous about which is 'farther' without camera context"
  > C4 impl-02 0123 "fixed: clarified camera geometry, added 3-point monotonic chain (z=0.5>z=0>z=-1)"
- [ ] Under ortho: same radius at z=0 vs z=0.5 → screen radius is identical (ortho doesn't foreshorten)
  > C3 impl-01 0123 "ortho identity: z has no effect on radius, toBe() verified"
  > C5 reviewer-04 0123 "trivial identity, exact equality, no possible improvement"
- [ ] Screen radius is never negative or NaN
  > C3 impl-01 0123 "7 positions tested under both modes, all >=0 and not NaN"
  > C3 reviewer-04 0123 "missing behind-camera edge case for perspective"
  > C4 impl-02 0123 "fixed: added behind-camera test (z=10), far point (z=-50), verified behind-cam returns 0"
- [ ] Screen radius of 0 worldRadius is 0 (zero stays zero)
  > C3 impl-01 0123 "zero in → zero out for both ortho and perspective"
  > C4 reviewer-04 0123 "correct, simple, uses toBe(0) exact check"

## Integration Tests

- [ ] Compile patch with 5 instances at varied z, uniform worldRadius=0.05:
  - Ortho: all screenRadii === 0.05
  - Perspective: screenRadii are monotonically ordered by z-distance from camera
  > C3 impl-01 0123 "5 instances z=-0.5..0.75: ortho all 0.05, persp monotonically increasing with z"
  > C5 reviewer-04 0123 "both sub-properties verified with correct assertions and geometry reasoning"
- [ ] The ratio between screen radii under perspective matches expected `1/distance` falloff (within floating-point tolerance)
  > C3 impl-01 0123 "ratio rClose/rFar = viewZ_far/viewZ_close, 1/d property verified"
  > C1 reviewer-04 0123 "TAUTOLOGY: line 164 compares ratio to itself (rClose/rFar === rClose/rFar); no independent viewZ computation"
  > C4 impl-02 0123 "fixed: independently computes viewZ via forward vector dot product, verifies ratio matches viewZfar/viewZclose to 10 decimals"
