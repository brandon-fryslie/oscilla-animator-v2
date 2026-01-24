# Level 3: Perspective Projection Kernel (Pure Math)
**Status: 13/13 items at C4. Zero runtime imports. L4-L6 tests pass. All hints matched.**

**Goal:** Second projection kernel. Still pure math — prove it produces correct perspective and differs from ortho.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces stride-3 `Float32Array` position buffers via Materializer (spec I8).
> - **L2**: Ortho kernel has zero runtime/compiler imports; identity property (`screenPos === worldPos.xy` for z=0) holds on L1 buffers (spec I16).

> **INVARIANT (must be true before Level 4 can start):**
> Both kernels (`projectFieldOrtho`, `projectFieldPerspective`) accept identical input signatures (`Float32Array(N*3)` + camera params) and return identical output shapes (`{screenPosition: Float32Array(N*2), depth: Float32Array(N), visible: Uint8Array(N)}`). Given the same world positions, perspective produces different `screenPos` values than ortho for off-axis points — proving the two modes are functionally distinct while structurally interchangeable (spec I16: real render IR, generic intermediate).

> **Implementation Hints (why this matters for later levels):**
> - This kernel MUST have the same output shape as the ortho kernel: `{ screenPos, depth, visible }`. Level 6 calls one OR the other through the same interface. If they have different return types, the toggle requires branching in the consumer.
> - The `lookAt` / basis computation should be a shared helper used by both kernels (ortho needs it for depth computation too). Don't duplicate the view-axis math.
> - `camPos` derivation from `(tiltAngle, yawAngle, distance, camTarget)` should be a separate pure function — Level 10.5 tests explicit Camera blocks that provide camPos directly, bypassing the tilt/yaw derivation. Keep these two steps cleanly separated.
> - Both kernels must normalize screenPos to `[0,1]` — not pixels. Level 8 backends do the `[0,1] → pixel` mapping. If perspective outputs pixels while ortho outputs normalized coords, the backends need to know which mode they're in (violating the screen-space-only contract).

## Unit Tests

- [ ] `projectWorldToScreenPerspective((0.5, 0.5, 0), defaultPerspCam)` → screenPos near center but NOT (0.5, 0.5) unless point is exactly on optical axis (verify not bitwise equal to ortho result)
  > C3 ralphie 0124 "on-axis point (0.5,0.5,0) projects to (0.5,0.5); off-axis (0.8,0.3,0) differs from ortho identity"
  > C4 ralphie 0124 "L6 mode toggle confirms perspective differs from ortho at same call site"
- [ ] Points farther from center have more displacement under perspective than ortho (parallax property)
  > C3 ralphie 0124 "deviation at (0.9,0.5) > deviation at (0.7,0.5), both non-zero"
  > C4 ralphie 0124 "L6 toggle test validates parallax difference between modes"
- [ ] `camPos` is computed deterministically: `camTarget + R_yaw(0) * R_tilt(35°) * (0, 0, 2.0)` → verify exact vec3 value
  > C3 ralphie 0124 "deriveCamPos matches PERSP_CAMERA_DEFAULTS exactly; math verified against formula"
  > C4 ralphie 0124 "deriveCamPos is separate function per hint; L10.5 can bypass it"
- [ ] `visible = false` for points behind camera (z > camPos.z for a looking-down camera)
  > C3 ralphie 0124 "points at z=10 and (0.5,3.0,3.0) behind camera are invisible"
  > C4 ralphie 0124 "viewZ<=0 check correctly catches behind-camera points"
- [ ] `visible = false` for points outside near/far planes
  > C3 ralphie 0124 "z=-200 (beyond far) and point 0.005 along forward (within near) both invisible"
  > C4 ralphie 0124 "near=0.01, far=100 thresholds from PERSP_CAMERA_DEFAULTS enforced correctly"
- [ ] `depth` is monotonically increasing with distance from camera along view axis
  > C3 ralphie 0124 "5 z-values along optical axis produce strictly increasing depth"
  > C4 ralphie 0124 "depth = (viewZ-near)/range is linear, monotonicity guaranteed"
- [ ] Kernel is pure: same inputs → bitwise identical outputs
  > C3 ralphie 0124 "5 different points all produce bitwise identical results on repeated calls"
  > C4 ralphie 0124 "no state, no random; computeViewBasis is deterministic pure math"

## Parallax Property Tests

- [ ] Two instances at (0.3, 0.3, 0) and (0.3, 0.3, 0.5): the z=0.5 instance has different screenPos.xy under perspective
  > C3 ralphie 0124 "different z produces different screenPos under perspective"
  > C4 ralphie 0124 "L6 field variant test confirms varied z → non-uniform screen positions"
- [ ] The instance closer to camera is displaced MORE from center than the one farther (verify direction)
  > C3 ralphie 0124 "z=0.5 (closer) has smaller depth AND larger displacement from center"
  > C4 ralphie 0124 "perspective magnification of off-axis points at close range verified"
- [ ] Under ortho, same two instances have IDENTICAL screenPos.xy (z doesn't affect ortho XY)
  > C3 ralphie 0124 "ortho projects (0.3,0.3,0) and (0.3,0.3,0.5) to identical screenPos"
  > C4 ralphie 0124 "L2 identity property: ortho ignores z for screen XY, confirmed by L6 comparison"

## Field Variant Tests

- [ ] Field perspective kernel matches N individual scalar calls (element-wise identical)
  > C3 ralphie 0124 "15-element field matches scalar kernel bitwise (Math.fround verified)"
  > C4 ralphie 0124 "field uses same formula; invViewZ = 1/(viewZ*tan) matches scalar's divide"
- [ ] Field kernel with varied z produces non-uniform screenPos.xy (unlike ortho)
  > C3 ralphie 0124 "5 instances same XY different Z: perspective varies, ortho doesn't"
  > C4 ralphie 0124 "L6 mode toggle uses this property to prove modes are distinct"

## Integration Tests

- [ ] Compile `GridLayout(4x4)` patch, run 1 frame, project same world positions through both kernels:
  - Ortho produces screenPos === worldPos.xy
  - Perspective produces screenPos !== worldPos.xy for off-center instances
  - Both produce valid (non-NaN, non-Inf) outputs
  - Both agree on visibility for in-frustum points
  > C3 ralphie 0124 "16-instance grid: ortho=identity, perspective=parallax, all visible, all finite"
  > C4 ralphie 0124 "L5 assembler integration does this end-to-end through executeFrame"
