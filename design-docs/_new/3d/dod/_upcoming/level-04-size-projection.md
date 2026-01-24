# Level 4: Size Projection (World Radius → Screen Radius)
**Status: Not started.**

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
  >
- [ ] `projectWorldRadiusToScreenRadius(0.05, (0.5, 0.5, 0), perspDefaults)` → some value != 0.05 (perspective changes it)
  >
- [ ] Under perspective: same radius at z=0 vs z=0.5 → the farther instance has smaller screen radius
  >
- [ ] Under ortho: same radius at z=0 vs z=0.5 → screen radius is identical (ortho doesn't foreshorten)
  >
- [ ] Screen radius is never negative or NaN
  >
- [ ] Screen radius of 0 worldRadius is 0 (zero stays zero)
  >

## Integration Tests

- [ ] Compile patch with 5 instances at varied z, uniform worldRadius=0.05:
  - Ortho: all screenRadii === 0.05
  - Perspective: screenRadii are monotonically ordered by z-distance from camera
  >
- [ ] The ratio between screen radii under perspective matches expected `1/distance` falloff (within floating-point tolerance)
  >
