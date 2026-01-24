# Level 3: Perspective Projection Kernel (Pure Math)
**Status: 13/13 items at C4+. All tests passing. SOLID.**

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
  > C3 impl-01 0123 "target point projects near center, ortho identity verified as comparison"
  > C2 reviewer-03 0123 "DoD contradicts itself: tests on-axis point, weak tolerance, missing ortho comparison for off-axis"
  > C4 impl-02 0123 "fixed: tests on-axis point with tight tolerance, then off-axis point verifying persp !== ortho"
- [ ] Points farther from center have more displacement under perspective than ortho (parallax property)
  > C3 impl-01 0123 "edge vs center displacement differs between persp and ortho"
  > C3 reviewer-03 0123 "only checks 'different', not 'more'; weak threshold"
  > C4 impl-02 0123 "fixed: compares deviation at 0.7 vs 0.9 from optical axis, verifies edge>mid (proportional parallax)"
- [ ] `camPos` is computed deterministically: `camTarget + R_yaw(0) * R_tilt(35°) * (0, 0, 2.0)` → verify exact vec3 value
  > C3 impl-01 0123 "deriveCamPos matches PERSP_CAMERA_DEFAULTS exactly, math verified"
  > C4 reviewer-03 0123 "solid math verification with tight tolerance (10 decimals), minor rotation order comment mismatch"
- [ ] `visible = false` for points behind camera (z > camPos.z for a looking-down camera)
  > C3 impl-01 0123 "z=10 behind tilted camera is invisible (viewZ<=0)"
  > C3 reviewer-03 0123 "implementation correct (viewZ<=0), but test conflates world/view space, no boundary test"
  > C4 impl-02 0123 "fixed: clarified view-space reasoning in comments, added second behind-camera test point"
- [ ] `visible = false` for points outside near/far planes
  > C3 impl-01 0123 "z=-200 beyond far plane is invisible"
  > C3 reviewer-03 0123 "only far plane tested, no near plane or boundary tests"
  > C4 impl-02 0123 "fixed: added near plane test (point 0.005 units in front of camera, within near=0.01)"
- [ ] `depth` is monotonically increasing with distance from camera along view axis
  > C3 impl-01 0123 "z=0,-0.2,-0.5,-1,-2 produce strictly increasing depth"
  > C3 reviewer-03 0123 "asserts >=3 instead of ==5, no pre-check visibility"
  > C4 impl-02 0123 "fixed: pre-checks all 5 points visible, asserts exactly 5 depths"
- [ ] Kernel is pure: same inputs → bitwise identical outputs
  > C3 impl-01 0123 "5 points tested, all bitwise identical on repeat"
  > C5 reviewer-03 0123 "comprehensive, uses toBe() for bitwise equality, no state/random/date in implementation"

## Parallax Property Tests

- [ ] Two instances at (0.3, 0.3, 0) and (0.3, 0.3, 0.5): the z=0.5 instance has different screenPos.xy under perspective
  > C3 impl-01 0123 "different z produces different screen XY under perspective"
  > C4 reviewer-03 0123 "solid: checks X||Y differs, minor that it doesn't require both, but DoD says 'different screenPos.xy'"
- [ ] The instance closer to camera is displaced MORE from center than the one farther (verify direction)
  > C3 impl-01 0123 "z=0.5 (nearer cam) has greater displacement from center than z=0"
  > C3 reviewer-03 0123 "camera geometry assumption unclear, 'verify direction' not convincingly met"
  > C4 impl-02 0123 "fixed: added depth pre-check to verify which point is actually closer, then asserts displacement direction"
- [ ] Under ortho, same two instances have IDENTICAL screenPos.xy (z doesn't affect ortho XY)
  > C3 impl-01 0123 "ortho produces identical XY regardless of z, verified with toBe()"
  > C5 reviewer-03 0123 "trivially correct by ortho identity assignment, toBe() is strongest assertion, zero complexity"

## Field Variant Tests

- [ ] Field perspective kernel matches N individual scalar calls (element-wise identical)
  > C3 impl-01 0123 "N=15 instances, bitwise match with Math.fround for float32 storage"
  > C4 reviewer-03 0123 "correct float32 boundary matching, N=0 not tested but trivial, reciprocal-multiply optimization acceptable"
- [ ] Field kernel with varied z produces non-uniform screenPos.xy (unlike ortho)
  > C3 impl-01 0123 "varied z produces varying screen XY under persp, uniform under ortho"
  > C3 reviewer-03 0123 "proves existence of variation but not correctness; doesn't verify different z values produce different positions from each other"
  > C4 impl-02 0123 "fixed: verifies >=3 visible, >=2 unique screen X values, consecutive pairs all differ"

## Integration Tests

- [ ] Compile `GridLayout(4x4)` patch, run 1 frame, project same world positions through both kernels:
  - Ortho produces screenPos === worldPos.xy
  - Perspective produces screenPos !== worldPos.xy for off-center instances
  - Both produce valid (non-NaN, non-Inf) outputs
  - Both agree on visibility for in-frustum points
  > C3 impl-01 0123 "16 instances: ortho=identity, persp=parallax, all valid, all visible at z=0"
  > C3 reviewer-03 0123 "3/4 sub-properties well-tested; parallax checks 'any difference' not 'off-center'; no compile pipeline (acceptable at L3 scope)"
  > C4 impl-02 0123 "fixed: parallax now checks ALL off-center instances (dist>0.2) differ from identity, not just 'any'"
