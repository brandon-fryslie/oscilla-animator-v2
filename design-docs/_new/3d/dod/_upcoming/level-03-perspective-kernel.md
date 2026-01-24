# Level 3: Perspective Projection Kernel (Pure Math)
**Status: Not started.**

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
  >
- [ ] Points farther from center have more displacement under perspective than ortho (parallax property)
  >
- [ ] `camPos` is computed deterministically: `camTarget + R_yaw(0) * R_tilt(35°) * (0, 0, 2.0)` → verify exact vec3 value
  >
- [ ] `visible = false` for points behind camera (z > camPos.z for a looking-down camera)
  >
- [ ] `visible = false` for points outside near/far planes
  >
- [ ] `depth` is monotonically increasing with distance from camera along view axis
  >
- [ ] Kernel is pure: same inputs → bitwise identical outputs
  >

## Parallax Property Tests

- [ ] Two instances at (0.3, 0.3, 0) and (0.3, 0.3, 0.5): the z=0.5 instance has different screenPos.xy under perspective
  >
- [ ] The instance closer to camera is displaced MORE from center than the one farther (verify direction)
  >
- [ ] Under ortho, same two instances have IDENTICAL screenPos.xy (z doesn't affect ortho XY)
  >

## Field Variant Tests

- [ ] Field perspective kernel matches N individual scalar calls (element-wise identical)
  >
- [ ] Field kernel with varied z produces non-uniform screenPos.xy (unlike ortho)
  >

## Integration Tests

- [ ] Compile `GridLayout(4x4)` patch, run 1 frame, project same world positions through both kernels:
  - Ortho produces screenPos === worldPos.xy
  - Perspective produces screenPos !== worldPos.xy for off-center instances
  - Both produce valid (non-NaN, non-Inf) outputs
  - Both agree on visibility for in-frustum points
  >
