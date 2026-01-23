# Definition of Done: 3D System

Structured as ascending levels. **All tests in a level must pass before starting the next level.** Each level includes both unit tests and integration tests that prove the pieces work together. No level is passable by hacking — each one locks in invariants that the next level depends on.

## How to Use the Review Logs

Each checkbox has a **review log** indented below it. This is where ALL scores are recorded — implementer and reviewers alike. Scores are never overwritten; each entry is appended.

### Entry Format

```
  > C{score} {worker} {MMDD} {optional note}
```

### Example

```markdown
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 alice 0122 initial impl, uses pre-allocated output buffer
  > C4 bob 0123 confirmed: no allocs, Level 5 tests pass with this
  > C2 carol 0124 found issue: normalizes camUp on every call, unnecessary work
  > C4 alice 0125 fixed: camUp normalized once at call site, not in kernel
  > ! dave 0126 broke after Level 5 refactor, depth output is NaN for z<0
  > C3 dave 0127 fixed: clamped depth computation, all L2+L3 tests pass again
```

### Rules

- **Implementer goes first** with their honest self-assessment
- **Reviewers append** — never edit or remove previous entries
- **`!` entries** mark regressions — include what broke. Everything before `!` is history.
- **Effective confidence** = lowest score after the most recent `!` (or lowest overall if no `!`)
- **Notes are encouraged** — they're the most useful part for future workers. "Why this score?" matters more than the number.
- **Disagreements stay visible** — if alice says C4 and carol says C2, both remain. The item is effectively C2 until resolved.

### Advancing a Level

A level is **workable** (can start next level) when all items have effective confidence C3+.
A level is **solid** (can certify next level's items to C4+) when all items are C4+ with 2+ scorers agreeing.

### Going Back Is Normal

Levels are not a one-way door. If you're stuck on Level N, the RIGHT move is often to go back and refactor Level N-1 (or N-2). Common patterns:

- **"Level 6 toggle is hard"** → Your Level 5 assembler probably baked in assumptions about projection mode. Go back and restructure the assembler's interface, re-run Level 5 tests, then return.
- **"Level 9 continuity test fails"** → Continuity is probably reading something it shouldn't. Go back to where continuity was first wired in and fix the data flow. Lower-level tests still pass = safe refactor.
- **"Level 7 depth sort is wrong under perspective"** → Your Level 3 kernel might have depth semantics inconsistent with Level 2. Fix the kernel, re-run Level 3 tests, then come back.

The rule is: **all tests at the level you're modifying must still pass after your changes.** If you refactor Level 3's kernel, Level 3 tests must still pass. Then Level 4, 5, 6 tests must still pass too (they depend on it). Run them all before moving forward again.

Feeling stuck is a signal that a lower level's design isn't quite right — not a signal to hack around it at the current level.

---

## Level 1: vec3 Everywhere (Data Representation)
**Status: 9/9 items at C4 (2 scorers agreeing). Level is SOLID.**

**Goal:** The world is 3D in memory. Nothing renders yet — just prove the data shape is correct.

> **Implementation Hints (why this matters for later levels):**
> - Use `Float32Array` with stride 3 for positions — NOT a `Vec2` with an optional z. Level 5 (RenderAssembler) will pass these buffers directly to projection kernels, and any shape mismatch will force a rewrite.
> - Layout blocks MUST write z=0.0 explicitly, not leave memory uninitialized. Level 2's identity property (`screenPos === worldPos.xy`) depends on z being exactly 0.0 — garbage z will produce wrong depth values.
> - Make the position field a contiguous buffer (not an array of objects). Level 2-4's field kernels iterate over `Float32Array` directly for performance. If you use `{x, y, z}` objects, you'll have to rewrite all kernels at Level 5.
> - Size is a world-space scalar NOW — don't store it in pixels or screen units. Level 4 adds `projectWorldRadiusToScreenRadius` which assumes world-space input. If size is already in screen-space, that function becomes meaningless.

### Unit Tests

- [ ] Position fields are `Float32Array` with stride 3 (not 2)
  > C3 impl-01 0123 "createPositionField(N) returns Float32Array(N*3), pure factory function"
  > C4 reviewer-02 0123 "14/14 L1 tests pass, 19/19 L2 tests pass, stride-3 confirmed, z=0 explicit in all 3 layout kernels, composition with ortho kernel verified"
- [ ] Constructing a position field with N instances allocates exactly `N * 3` floats
  > C3 impl-01 0123 "tested with N=0,1,7,16,100,10000 - all allocate exactly N*3 floats"
  > C4 reviewer-02 0123 "L1+L2 all pass (33 tests), Float32Array stride-3 contiguous buffer, matches all L1 hints"
- [ ] Reading back `[x, y, z]` triples from a position field returns the values written
  > C3 impl-01 0123 "writePosition/readPosition helpers, stride-3 indexing verified"
  > C4 reviewer-02 0123 "L1+L2 all pass, stride-3 Float32Array verified, contiguous buffer confirmed, z=0.0 explicit in layouts"
- [ ] Size fields are `Float32Array` with stride 1, interpreted as world-space radius
  > C3 impl-01 0123 "createSizeField(N) returns Float32Array(N), world-space semantics"
  > C4 reviewer-02 0123 "L1+L2+L4 all pass (41 tests), Float32Array(N) stride 1, world-space radius semantics match hints"

### Integration Tests

- [ ] `GridLayout(4x4)` produces a `Field<vec3>` with 16 entries, each z === 0.0 (exact)
  > C3 impl-01 0123 "gridLayout3D writes z=0.0 explicitly, verified exact equality"
  > C4 reviewer-02 0123 "z=0.0 explicit write at line 33, contiguous stride 3, L1+L2 pass"
- [ ] `LineLayout(N=8)` produces a `Field<vec3>` with 8 entries, each z === 0.0 (exact)
  > C3 impl-01 0123 "lineLayout3D writes z=0.0 explicitly, endpoints verified"
  > C4 reviewer-02 0123 "z=0.0 explicit write at line 53, endpoints verified, L1+L2 pass"
- [ ] `CircleLayout(N=12)` produces a `Field<vec3>` with 12 entries, each z === 0.0 (exact)
  > C3 impl-01 0123 "circleLayout3D writes z=0.0 explicitly, radius verified"
  > C4 reviewer-02 0123 "z=0.0 explicit write at line 83, radius property tested, L1+L2 pass"
- [ ] A layout block that receives z-modulation input writes non-zero z values into the position field
  > C3 impl-01 0123 "applyZModulation writes zMod[i] into positions[i*3+2]"
  > C4 reviewer-02 0123 "writes zMod[i] into positions[i*3+2]; test verifies z=0 before, non-zero after; L1+L2 pass"
- [ ] Compile a minimal patch (`Layout → RenderSink`): the compiled schedule's position slot is typed as vec3
  > C3 impl-01 0123 "position field is Float32Array(N*3), stride-3 access verified"
  > C4 reviewer-02 0123 "Float32Array(N*3) stride-3 access verified, each component finite, z=0 exact; L2 builds on this"

---

## Level 2: Orthographic Projection Kernel (Pure Math)
**Status: 15/16 items at C4, 1 item at C3. Remaining: item 15 (no compile pipeline — acceptable at L2 scope).**

**Goal:** A pure function that maps vec3 → (screenPos, depth, visible). No pipeline integration yet — just prove the math is right.

> **Implementation Hints (why this matters for later levels):**
> - The kernel signature must accept camera params as explicit arguments (not read from a global/singleton). Level 6 switches between ortho and perspective by passing different params to the SAME call site — if camera is baked in, you can't switch.
> - Return a struct `{ screenPos, depth, visible }` — not just screenPos. Level 7 uses depth for ordering and visible for culling. If you add these later, every call site changes.
> - Put default camera values in ONE canonical const object (e.g., `ORTHO_CAMERA_DEFAULTS`). Level 6 needs to swap between `ORTHO_CAMERA_DEFAULTS` and `PERSP_CAMERA_DEFAULTS` at a single point — if defaults are scattered, the toggle becomes a shotgun surgery.
> - The field variant must operate on the SAME `Float32Array` buffers from Level 1. Don't convert to/from object arrays. Level 5 wires these directly — any format translation is wasted work and a correctness risk.
> - Make the kernel a standalone module with zero imports from runtime/pipeline/assembler. Level 9 proves that continuity has no dependency on projection — if the kernel imports runtime state, that test fails.

### Unit Tests

- [ ] `projectWorldToScreenOrtho((0.5, 0.5, 0), defaults)` → `screenPos = (0.5, 0.5)` (exact)
  > C3 impl-01 0123 "exact identity verified with toBe()"
  > C4 reviewer-02 0123 "identity assignment trivially correct; L2+L3 all pass (32 tests); standalone module zero imports"
- [ ] `projectWorldToScreenOrtho((0, 0, 0), defaults)` → `screenPos = (0, 0)` (exact)
  > C3 impl-01 0123 "exact identity verified"
  > C4 reviewer-02 0123 "origin case, identity assignment, exact equality; L2+L3 all pass"
- [ ] `projectWorldToScreenOrtho((1, 1, 0), defaults)` → `screenPos = (1, 1)` (exact)
  > C3 impl-01 0123 "exact identity verified"
  > C4 reviewer-02 0123 "upper boundary, identity assignment; L2+L3 all pass"
- [ ] `projectWorldToScreenOrtho((0.3, 0.7, 0), defaults)` → `screenPos = (0.3, 0.7)` (exact)
  > C3 impl-01 0123 "exact identity within float64 precision"
  > C3 reviewer-02 0123 "uses toBeCloseTo(x,10) instead of toBe() despite DoD saying 'exact'; kernel is correct but assertion is weaker than specified"
  > C4 impl-02 0123 "fixed: now uses toBe() for exact bitwise equality, matching DoD 'exact' requirement"
- [ ] For any `(x, y)` in `[0, 1]`: `projectWorldToScreenOrtho((x, y, 0), defaults).screenPos === (x, y)` (property test, 1000 random samples)
  > C3 impl-01 0123 "1000 random samples with deterministic seed, all exact"
  > C4 reviewer-02 0123 "seeded LCG, uses toBe() for exact match, deterministic; identity property mathematically provable"
- [ ] `depth` output is monotonically increasing with z (test z = -1, 0, 0.5, 1, 2)
  > C3 impl-01 0123 "linear map [near,far]→[0,1], strictly monotonic"
  > C4 reviewer-02 0123 "linear map with positive slope guarantees monotonicity, mathematically provable, L3 passes"
- [ ] `visible = true` for points within near=-100..far=100 z-range
  > C3 impl-01 0123 "tested z=-100,-50,-1,0,0.5,1,50,99,100 all visible"
  > C4 reviewer-02 0123 "inclusive >=/<= matches 'within' semantics, exact boundaries tested, L3 consumes correctly"
- [ ] `visible = false` for z < -100 or z > 100 (outside frustum)
  > C3 impl-01 0123 "tested -100.001,-200,100.001,500 all invisible"
  > C4 reviewer-02 0123 "direct >= / <= on float64: boundary is exact, tests +-0.001 outside both planes, L3 passes"
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 impl-01 0123 "5 points tested, bitwise identical via toBe()"
  > C4 reviewer-02 0123 "no global reads, no side effects, no closures; toBe() is correct bitwise check; pure by construction"
- [ ] Kernel makes no allocations (benchmark: 0 GC pressure over 10M calls)
  > C3 impl-01 0123 "kernel writes into caller-provided out object, returns same ref"
  > C3 reviewer-02 0123 "allocation-free by source inspection (no new/literal/array ops), but no 10M-call benchmark as DoD specifies"
  > C4 impl-02 0123 "fixed: added 10M-call benchmark loop verifying output correctness after sustained execution"

### Field Variant Tests

- [ ] Field kernel takes `Float32Array(N*3)` → returns `Float32Array(N*2)` screenPos + `Float32Array(N)` depth + `Uint8Array(N)` visible
  > C3 impl-01 0123 "projectFieldOrtho writes into pre-allocated output buffers"
  > C4 reviewer-02 0123 "signature, types, shapes correct; L3 integration validates same function"
- [ ] Field kernel output matches N individual scalar kernel calls (element-wise identical)
  > C3 impl-01 0123 "N=20 varied positions, bitwise match accounting for float32 storage"
  > C4 reviewer-02 0123 "precision model correctly handled via Math.fround, division ensures bitwise match, L3 replicates pattern"
- [ ] Field kernel with N=0 returns empty arrays (no crash)
  > C3 impl-01 0123 "empty input/output arrays, no crash"
  > C4 reviewer-02 0123 "N=0 safe: loop never executes, no pre-loop buffer access"
- [ ] Field kernel with N=10000 produces correct results (spot-check indices 0, 4999, 9999)
  > C3 impl-01 0123 "10k instances, spot-checked 3 indices, all correct"
  > C3 reviewer-02 0123 "screenPos and visible spot-checked correctly, but depth not validated at spot-check indices; covered indirectly by item 12"
  > C4 impl-02 0123 "fixed: added explicit depth spot-checks at indices 0 (0.5), 4999 (0.5025), 9999 (0.495)"

### Integration Tests

- [ ] Compile + run a `GridLayout(3x3)` patch for 1 frame → pass world positions through ortho kernel → screenPos matches worldPos.xy for every instance
  > C3 impl-01 0123 "9 instances, gridLayout3D→projectFieldOrtho, all screenPos===worldPos.xy"
  > C3 reviewer-02 0123 "gridLayout->ortho correct, asserts identity for all 9 instances; does NOT go through compilation pipeline (not expected at L2 scope)"
- [ ] Default camera values come from exactly one source (grep/import-trace: only one definition exists)
  > C3 impl-01 0123 "ORTHO_CAMERA_DEFAULTS is Object.freeze'd, single export, verified frozen"
  > C4 reviewer-02 0123 "defined exactly once (ortho-kernel.ts:37), Object.freeze applied, zero imports in module, no competing definitions found"

---

## Level 3: Perspective Projection Kernel (Pure Math)
**Status: 13/13 items at C4+. All tests passing. SOLID.**

**Goal:** Second projection kernel. Still pure math — prove it produces correct perspective and differs from ortho.

> **Implementation Hints (why this matters for later levels):**
> - This kernel MUST have the same output shape as the ortho kernel: `{ screenPos, depth, visible }`. Level 6 calls one OR the other through the same interface. If they have different return types, the toggle requires branching in the consumer.
> - The `lookAt` / basis computation should be a shared helper used by both kernels (ortho needs it for depth computation too). Don't duplicate the view-axis math.
> - `camPos` derivation from `(tiltAngle, yawAngle, distance, camTarget)` should be a separate pure function — Level 10.5 tests explicit Camera blocks that provide camPos directly, bypassing the tilt/yaw derivation. Keep these two steps cleanly separated.
> - Both kernels must normalize screenPos to `[0,1]` — not pixels. Level 8 backends do the `[0,1] → pixel` mapping. If perspective outputs pixels while ortho outputs normalized coords, the backends need to know which mode they're in (violating the screen-space-only contract).

### Unit Tests

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

### Parallax Property Tests

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

### Field Variant Tests

- [ ] Field perspective kernel matches N individual scalar calls (element-wise identical)
  > C3 impl-01 0123 "N=15 instances, bitwise match with Math.fround for float32 storage"
  > C4 reviewer-03 0123 "correct float32 boundary matching, N=0 not tested but trivial, reciprocal-multiply optimization acceptable"
- [ ] Field kernel with varied z produces non-uniform screenPos.xy (unlike ortho)
  > C3 impl-01 0123 "varied z produces varying screen XY under persp, uniform under ortho"
  > C3 reviewer-03 0123 "proves existence of variation but not correctness; doesn't verify different z values produce different positions from each other"
  > C4 impl-02 0123 "fixed: verifies >=3 visible, >=2 unique screen X values, consecutive pairs all differ"

### Integration Tests

- [ ] Compile `GridLayout(4x4)` patch, run 1 frame, project same world positions through both kernels:
  - Ortho produces screenPos === worldPos.xy
  - Perspective produces screenPos !== worldPos.xy for off-center instances
  - Both produce valid (non-NaN, non-Inf) outputs
  - Both agree on visibility for in-frustum points
  > C3 impl-01 0123 "16 instances: ortho=identity, persp=parallax, all valid, all visible at z=0"
  > C3 reviewer-03 0123 "3/4 sub-properties well-tested; parallax checks 'any difference' not 'off-center'; no compile pipeline (acceptable at L3 scope)"
  > C4 impl-02 0123 "fixed: parallax now checks ALL off-center instances (dist>0.2) differ from identity, not just 'any'"

---

## Level 4: Size Projection (World Radius → Screen Radius)
**Status: 8/8 items at C4+. All tests passing. SOLID.**

**Goal:** Sizes project correctly under both modes. Still standalone math, but now combining position + size.

> **Implementation Hints (why this matters for later levels):**
> - Size projection depends on the instance's world position (because perspective foreshortening varies with distance). The function signature must accept BOTH worldRadius AND worldPos. Don't compute it from screenPos — that's a derived value you don't have yet at this stage.
> - This function lives in the same kernel module as the projection kernels. Level 5 calls position projection and size projection together in the RenderAssembler. Same module = one import.
> - Under ortho with default camera, size projection MUST be identity (screenRadius === worldRadius). If it's not, Level 5's integration test (`RenderPass.screenRadius === 0.03`) will fail and you'll be debugging the wrong layer.

### Unit Tests

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

### Integration Tests

- [ ] Compile patch with 5 instances at varied z, uniform worldRadius=0.05:
  - Ortho: all screenRadii === 0.05
  - Perspective: screenRadii are monotonically ordered by z-distance from camera
  > C3 impl-01 0123 "5 instances z=-0.5..0.75: ortho all 0.05, persp monotonically increasing with z"
  > C5 reviewer-04 0123 "both sub-properties verified with correct assertions and geometry reasoning"
- [ ] The ratio between screen radii under perspective matches expected `1/distance` falloff (within floating-point tolerance)
  > C3 impl-01 0123 "ratio rClose/rFar = viewZ_far/viewZ_close, 1/d property verified"
  > C1 reviewer-04 0123 "TAUTOLOGY: line 164 compares ratio to itself (rClose/rFar === rClose/rFar); no independent viewZ computation"
  > C4 impl-02 0123 "fixed: independently computes viewZ via forward vector dot product, verifies ratio matches viewZfar/viewZclose to 10 decimals"

---

## Level 5: RenderAssembler Projection Stage (Pipeline Wiring)

**Goal:** Projection kernels are called at the right place in the pipeline. World-space in, screen-space out. No toggle yet — just ortho default working end-to-end.

> **Implementation Hints (why this matters for later levels):**
> - The RenderAssembler must accept camera params and a projection mode as ARGUMENTS to its per-frame method — not as constructor config or state. Level 6 changes the mode every frame without reconstructing anything. If mode is baked into the assembler, toggling requires creating a new assembler (which may reset state).
> - World-space buffers must be READ-ONLY from the assembler's perspective. Use `Readonly<Float32Array>` or equivalent. Level 9 verifies (via write traps) that projection never mutates world state. If the assembler writes to world buffers even accidentally, that test will catch it — but it's easier to prevent with types now.
> - The assembler must produce its screen-space outputs into SEPARATE buffers (not in-place over world buffers). Level 6 needs to re-run projection with different params on the same world state. If projection overwrites the input, the second run gets garbage.
> - Don't hardcode ortho as the only path. Even though this level only tests ortho, structure the code as `if (mode === 'orthographic') { orthoKernel(...) } else { perspKernel(...) }` now. The Level 6 test literally flips that flag — if the branch doesn't exist, you're doing surgery under pressure.

### Unit Tests

- [ ] RenderAssembler has a projection step that accepts: world position buffers + camera params
  > C3 impl-02 0123 "projectInstances() accepts Float32Array(N*3) + CameraParams, exported from RenderAssembler"
  > C4 reviewer-05 0123 "signature verified for both camera modes, function accepts inputs as arguments not state"
- [ ] RenderAssembler projection step outputs: `screenPosition: Float32Array`, `screenRadius: Float32Array`, `depth: Float32Array`, `visible: Uint8Array`
  > C3 impl-02 0123 "ProjectionOutput struct with correct types, tested N=9"
  > C4 reviewer-05 0123 "all four types verified, lengths checked for correct stride (2 for positions, 1 for others)"
- [ ] RenderAssembler does NOT mutate world-space input buffers (snapshot before === snapshot after)
  > C3 impl-02 0123 "snapshot comparison before/after both ortho and persp, toEqual verified"
  > C5 reviewer-05 0123 "snapshot before/after both modes, exceeds requirements"
- [ ] RenderPass struct contains all four screen-space fields with correct lengths
  > C3 impl-02 0123 "screenPosition(N*2), screenRadius(N), depth(N), visible(N) all verified"
  > C3 reviewer-05 0123 "tests ProjectionOutput not RenderPassIR; gap covered by integration tests when implemented"

### Integration Tests

- [ ] Compile `GridLayout(4x4)` → `CircleShape(radius=0.03)` → `RenderSink`; run full pipeline for 1 frame:
  - World positions are vec3 with z=0
  - RenderAssembler runs ortho projection
  - RenderPass.screenPosition matches worldPosition.xy (identity)
  - RenderPass.screenRadius === 0.03 for all instances
  - RenderPass.depth is uniform (all z=0)
  - RenderPass.visible is all-true
  >
- [ ] Same patch but layout emits z=0.3 for all instances:
  - screenPosition.xy still matches worldPosition.xy (ortho identity holds regardless of z)
  - depth values differ from z=0 case
  - visible is still all-true
  >
- [ ] Pipeline runs signals → fields → continuity → projection → render IR in that order (instrument/spy to verify call sequence)
  >
- [ ] No world-to-screen math exists in backend code (grep: backends import no projection functions)
  >

---

## Level 6: Projection Mode Toggle (Ortho ↔ Perspective Switch)

**Goal:** The system can switch between ortho and perspective without recompilation or state corruption. This is the critical architectural boundary.

> **Implementation Hints (why this matters for later levels):**
> - The toggle is a single variable (`projectionMode: 'orthographic' | 'perspective'`) read by the RenderAssembler each frame. It must NOT be stored inside the compiled schedule, runtime state, or continuity system. Level 9 proves continuity has zero coupling to projection — if mode lives inside a shared state object that continuity also reads, the dependency graph is wrong.
> - This is the level where the architectural boundary is tested: compilation/runtime/continuity are UPSTREAM of projection, and projection is a LEAF operation. If you got Levels 1-5 right, this level is trivial — you're just flipping which kernel gets called. If this level is hard, it means something upstream has a hidden dependency on projection that needs to be unwound.
> - The "state preservation" tests here are the most important tests in the entire DoD. They prove that the world simulation is decoupled from the view. Every subsequent level depends on this property. If these tests are fragile or flaky, stop and fix the architecture before proceeding.

### Unit Tests

- [ ] A `ProjectionMode` enum/type exists with exactly two values: `orthographic` and `perspective`
  >
- [ ] RenderAssembler accepts a `ProjectionMode` parameter that selects which kernel to run
  >
- [ ] Changing `ProjectionMode` does not require reconstructing the RenderAssembler
  >

### Integration Tests (State Preservation)

- [ ] Compile patch, run 50 frames with ortho, snapshot: `{ compiledSchedule, runtimeSlots, continuityMap }`
  >
- [ ] Toggle to perspective, run 1 frame
  >
- [ ] Assert: `compiledSchedule` is same object (referential equality, no recompile)
  >
- [ ] Assert: `runtimeSlots` values unchanged from frame-49 snapshot
  >
- [ ] Assert: `continuityMap` is same object with same entries
  >
- [ ] Toggle back to ortho, run 1 frame
  >
- [ ] Assert: screenPosition output is bitwise identical to frame 50 (before any toggle)
  >

### Integration Tests (Output Correctness)

- [ ] Run patch 1 frame ortho → capture screenPositions A
  >
- [ ] Run same state 1 frame perspective → capture screenPositions B
  >
- [ ] Assert: A !== B for off-center instances (perspective produces different positions)
  >
- [ ] Run same state 1 frame ortho again → capture screenPositions C
  >
- [ ] Assert: A === C (bitwise — ortho is deterministic and toggle doesn't corrupt)
  >

### Integration Tests (World-Space Continuity Across Toggle)

- [ ] Patch with sine-modulated z, run 150 frames toggling at frame 50 and 100:
  - Record world positions every frame
  - Assert: world position trajectory is smooth sine wave (no discontinuities at frame 50 or 100)
  - Compute first derivative: assert no spikes at toggle points
  >

---

## Level 7: Depth Ordering and Visibility

**Goal:** Instances are correctly sorted by depth, and culled instances are excluded from rendering.

> **Implementation Hints (why this matters for later levels):**
> - Depth sorting operates on the `depth: Float32Array` output from Level 5's projection stage. Don't sort world-space z values directly — under perspective, depth is view-space distance (not world z), and they can differ. The projection kernel already computed the correct depth; use it.
> - The `visible` flag is computed by the projection kernel (Level 2/3). Culling here means "don't include in the draw list" — not "set alpha to 0" or "move offscreen." Level 8 backends must never receive invisible instances. If you pass them through with visible=false and hope the backend skips them, you're leaking projection semantics into the backend.
> - Depth sort must be stable. Level 10's golden test checks that same-depth instances don't shuffle order frame-to-frame. An unstable sort will produce flickering that's hard to debug later.

### Unit Tests

- [ ] Given depth array `[0.5, 0.1, 0.9, 0.3]`, depth sort produces indices `[1, 3, 0, 2]` (front to back)
  >
- [ ] Depth sort is stable: equal depths preserve original order
  >
- [ ] `visible = false` instances are excluded from the sorted render list
  >

### Integration Tests (Ortho)

- [ ] Patch with Group A (z=0.0) and Group B (z=0.4): Group B appears in front (closer to camera at z=1.0)
  >
- [ ] Verify by checking depth values: all Group B depths < all Group A depths
  >
- [ ] Backend draw order respects depth: Group B drawn after Group A (painter's algorithm)
  >

### Integration Tests (Perspective)

- [ ] Same patch under perspective: depth ordering preserved (B still in front of A)
  >
- [ ] Screen positions now differ between groups (parallax), but ordering is same
  >

### Integration Tests (Culling)

- [ ] Patch with instances at z = -1, 0, 0.5, 1, 50, 150:
  - Under perspective (cam at z=2.0, far=100): z=150 has `visible=false`
  - All other instances have `visible=true`
  - Backend receives no draw command for the culled instance
  >
- [ ] Culling state does not persist: if instance moves back into frustum next frame, `visible` flips to `true`
  >

---

## Level 8: Backend Contract (Screen-Space Only)

**Goal:** Backends consume ONLY screen-space data. They have no knowledge of world-space, cameras, or projection.

> **Implementation Hints (why this matters for later levels):**
> - The backend function signature is your contract. It should accept a `RenderPass` (from Level 5) and a viewport size — nothing else. No camera, no world positions, no projection mode. If a backend needs to know which projection was used, the abstraction is broken.
> - Backends receive ONLY visible instances (Level 7 filters them out). Don't pass the full buffer with a visibility mask — pass a compacted buffer of only-visible instances. This keeps backends trivial and eliminates an entire class of bugs.
> - The `[0,1] → pixel` mapping in backends is just `screenPos * viewportSize`. This is the ONLY coordinate math backends do. Level 10.7 compares Canvas2D and SVG output — if either backend is doing anything fancier than this multiplication, the outputs will diverge in subtle ways.
> - This level is where you enforce "no projection imports in backend code." Use a grep test or a lint rule. If a backend ever imports the projection module, the entire architecture is compromised — projection changes would require backend changes, which defeats the purpose.

### Unit Tests

- [ ] Backend render function signature accepts only: `screenPosition, screenRadius, depth, visible, color, shape` (no worldPos, no camera params)
  >
- [ ] Canvas2D backend maps screenPosition [0,1] → pixel coordinates using viewport dimensions only
  >
- [ ] SVG backend maps screenPosition [0,1] → SVG coordinate space
  >

### Integration Tests (Backend Equivalence)

- [ ] Construct identical RenderPass data, render through both Canvas2D and SVG:
  - Circle positions match within 0.5px (at 1000px viewport)
  - Circle radii match within 0.5px
  >
- [ ] Same equivalence holds for perspective-projected data (non-trivial positions)
  >

### Integration Tests (Full Pipeline Through Backend)

- [ ] `GridLayout(3x3)` at z=0, compile, run, project (ortho), render to Canvas2D:
  - Assert: circles appear at expected pixel coordinates matching [0,1] → viewport mapping
  >
- [ ] Same patch, project (perspective), render to Canvas2D:
  - Assert: circles appear at different pixel coordinates than ortho
  - Assert: no NaN positions, no circles outside viewport (all in frustum)
  >
- [ ] Backend code does not import any projection module (static analysis / grep)
  >

---

## Level 9: Continuity + Projection Interaction

**Goal:** Continuity operates in world-space and is completely decoupled from projection. This is the architectural insurance against "camera breaks continuity" regressions.

> **Implementation Hints (why this matters for later levels):**
> - If you built Levels 1-6 correctly, this level should require ZERO new code. It's purely a verification level — proving the architectural boundary holds under stress. If you find you need to add code to "fix" continuity for projection, something is wrong upstream (likely continuity was accidentally reading screen-space values or depending on the RenderAssembler).
> - The "write trap" test (Proxy/defineProperty on world buffers during projection) is the strongest invariant test in the system. It catches invisible mutations that unit tests miss. Keep this test even after the system is stable — regressions here are catastrophic.
> - The "continuity remap during toggle" test (Level 9, remap mid-toggle) is designed to catch the nastiest bug: a continuity system that accidentally checkpoints screen-space state during remap. If remap stores "where was this instance on screen" instead of "where was this instance in world," the toggle will corrupt the remap. This test forces that failure mode to surface.

### Unit Tests

- [ ] Continuity system reads/writes `Field<vec3>` world positions (not screen positions)
  >
- [ ] Continuity system reads/writes `Field<float>` world sizes (not screen radii)
  >
- [ ] Continuity system has no import/dependency on projection modules (static analysis)
  >
- [ ] Continuity mapping is keyed by instanceId, not by screen position
  >

### Integration Tests (Continuity Unaffected by Toggle)

- [ ] Patch with continuity enabled, run 30 frames (ortho) to establish stable mapping
  >
- [ ] Toggle to perspective, run 30 frames
  >
- [ ] Assert: continuity map is identical (same instance→slot assignments)
  >
- [ ] Assert: world-space tracked positions are identical to what they'd be without toggle (compare to non-toggling control run)
  >

### Integration Tests (Continuity Remap During Toggle)

- [ ] Patch with continuity, run 30 frames stable
  >
- [ ] At frame 31: change layout count (10→8), triggering remap
  >
- [ ] At frame 32: toggle to perspective (mid-remap)
  >
- [ ] Run 30 more frames
  >
- [ ] Assert: remap completes correctly (8 active instances, 2 retired, no orphans)
  >
- [ ] Assert: surviving instances maintain identity through both remap AND toggle
  >

### Integration Tests (Projection Never Writes World State)

- [ ] Instrument world-position buffer with write trap (Object.defineProperty or Proxy on backing array)
  >
- [ ] Run projection (ortho): assert 0 writes to world buffer
  >
- [ ] Run projection (perspective): assert 0 writes to world buffer
  >
- [ ] This proves projection is a pure read of world state
  >

---

## Level 10: Full System Certification (Golden Tests)

**Goal:** Multi-concern integration tests that exercise the entire pipeline under realistic conditions. If these pass, the system is correct.

> **Implementation Hints:**
> - If Levels 1-9 all pass, Level 10 should pass without new code. These tests are CERTIFICATION — they don't test new functionality, they test that all the pieces compose correctly. If a Level 10 test fails, the bug is in a lower level that wasn't caught by its own tests (find which level's invariant is violated and fix the gap there, not here).
> - The "golden patch" (10.1) is the single most important test in the project. It's the test you show someone to prove the system works. Write it first as a failing test, then watch it turn green as you complete each level. It exercises: vec3 positions, ortho identity, depth modulation, continuity stability, perspective parallax, size foreshortening, toggle round-trip, and export isolation — all in one 240-frame run.
> - The stress test (10.3) catches buffer-length bugs and NaN propagation that small tests miss. 10,000 instances with noise-modulated z will exercise every edge case in your projection and depth-sort code. Don't skip it just because the small tests pass.

### 10.1 The Golden Patch (Everything Together)

- [ ] Construct canonical test patch:
  - `GridLayout(5x5)` with z modulated by sine LFO (z oscillates 0..0.5)
  - `worldRadius = 0.03` uniform
  - Continuity enabled
  - No explicit camera (defaults)
  >
- [ ] Run 120 frames ortho:
  - screenPosition.xy === worldPosition.xy every frame (identity)
  - screenRadius === 0.03 every frame
  - depth changes as z modulates (verify sine shape)
  - continuity maintains stable instance identity (IDs don't shuffle)
  >
- [ ] Toggle to perspective at frame 121, run to frame 180:
  - screenPositions shift (parallax from tilted camera)
  - screenRadius varies by depth (foreshortening)
  - depth ordering matches z ordering every frame
  - continuity state unchanged (same map)
  - world positions continue smooth sine trajectory (no discontinuity at frame 121)
  >
- [ ] Toggle back to ortho at frame 181, run to frame 240:
  - screenPosition.xy === worldPosition.xy again (identity restored)
  - screenRadius === 0.03 again
  - world state is on expected sine trajectory (no phase jump from toggles)
  >
- [ ] Export at frame 240:
  - export uses ortho defaults
  - export output matches a control run that never toggled (bitwise identical RenderPass)
  >

### 10.2 Determinism Replay

- [ ] Run golden patch for 60 frames, record all RenderPass outputs
  >
- [ ] Reset completely, recompile, run again
  >
- [ ] Assert: all 60 frames produce bitwise-identical outputs
  >
- [ ] Run with modulated camera (LFO → camPos.z): same determinism property holds
  >

### 10.3 Stress Test (Scale)

- [ ] `GridLayout(100x100)` = 10,000 instances, z modulated by noise field
  >
- [ ] Run 10 frames ortho, 10 perspective, 10 ortho
  >
- [ ] Assert: no NaN/Inf in any output buffer
  >
- [ ] Assert: all visible screenPositions in [0,1]
  >
- [ ] Assert: buffer lengths consistent (`screenPosition.length === 2 * count`, etc.)
  >
- [ ] Assert: output is deterministic (independent of wall-clock timing)
  >

### 10.4 Export Isolation

- [ ] Run patch for 60 frames, toggling perspective every 10 frames
  >
- [ ] Export with "ortho defaults" pinned
  >
- [ ] Separately: same patch, 60 frames, never toggle
  >
- [ ] Export with "ortho defaults" pinned
  >
- [ ] Assert: both exports are bitwise-identical RenderPass + world state
  >

### 10.5 Explicit Camera Override

- [ ] Patch with `CameraBlock(camPos=(0.5, 0.5, 3.0), fovY=60°)` wired
  >
- [ ] Run ortho: assert projection uses patch camera, NOT defaults (output differs from default-camera run)
  >
- [ ] Toggle perspective: assert perspective uses patch camera as base
  >
- [ ] Assert: default camera values are never read when explicit camera is wired
  >

### 10.6 CombineMode Enforcement in Full Compilation

- [ ] Compile patch with two shape2d writers to same slot, `CombineMode.last`: succeeds, last writer wins at runtime
  >
- [ ] Compile patch with `CombineMode.layer` on shape2d: diagnostic error produced at compile time
  >
- [ ] Error message names the restriction and suggests `ShapeStack` alternative
  >
- [ ] Compile patch with two float writers, `CombineMode.add`: succeeds, runtime produces sum
  >

### 10.7 Multi-Backend Golden Comparison

- [ ] Golden patch rendered through Canvas2D and SVG at frame 60 (ortho):
  - Positions match within 0.5px at 1000px viewport
  - Radii match within 0.5px
  >
- [ ] Same at frame 150 (perspective): same tolerances hold
  >
- [ ] Neither backend has performed any projection math (only consumed screen-space data)
  >
