# Level 4: Size Projection (World Radius → Screen Radius)
**Status: 8/8 items at C4. Same-module verified. Ortho identity confirmed. L5-L6 tests pass.**

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
  > C3 ralphie 0124 "projectWorldRadiusToScreenRadiusOrtho returns 0.05 exactly"
  > C4 ralphie 0124 "L5 assembler integration confirms ortho screenRadius === worldRadius"
- [ ] `projectWorldRadiusToScreenRadius(0.05, (0.5, 0.5, 0), perspDefaults)` → some value != 0.05 (perspective changes it)
  > C3 ralphie 0124 "returns non-0.05 value matching 0.05/(2.0*tan(22.5°)) formula"
  > C4 ralphie 0124 "L6 mode toggle confirms perspective radius differs from ortho"
- [ ] Under perspective: same radius at z=0 vs z=0.5 → the farther instance has smaller screen radius
  > C3 ralphie 0124 "z=0.5 > z=0 > z=-1.0 (monotonic with camera distance)"
  > C4 ralphie 0124 "matches 1/viewZ falloff property verified in integration test"
- [ ] Under ortho: same radius at z=0 vs z=0.5 → screen radius is identical (ortho doesn't foreshorten)
  > C3 ralphie 0124 "ortho returns 0.05 for both z=0 and z=0.5"
  > C4 ralphie 0124 "ortho identity means z has no effect on size, consistent with L2 position identity"
- [ ] Screen radius is never negative or NaN
  > C3 ralphie 0124 "9 varied positions tested under both modes, all >=0 and finite"
  > C4 ralphie 0124 "behind-camera returns 0 (not negative); all edge cases handled"
- [ ] Screen radius of 0 worldRadius is 0 (zero stays zero)
  > C3 ralphie 0124 "both ortho and perspective return 0 for worldRadius=0"
  > C4 ralphie 0124 "early-return guard in both kernels prevents division by zero issues"

## Integration Tests

- [ ] Compile patch with 5 instances at varied z, uniform worldRadius=0.05:
  - Ortho: all screenRadii === 0.05
  - Perspective: screenRadii are monotonically ordered by z-distance from camera
  > C3 ralphie 0124 "5 instances: ortho all 0.05, perspective monotonically increasing with z"
  > C4 ralphie 0124 "field variant projectFieldRadiusOrtho/Perspective produce correct arrays"
- [ ] The ratio between screen radii under perspective matches expected `1/distance` falloff (within floating-point tolerance)
  > C3 ralphie 0124 "rClose/rFar === viewZFar/viewZClose to 10 decimal places"
  > C4 ralphie 0124 "formula screenR = worldR/(viewZ*tan(fov/2)) verified algebraically via ratio test"
