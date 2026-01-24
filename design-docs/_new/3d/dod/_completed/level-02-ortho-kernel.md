# Level 2: Orthographic Projection Kernel (Pure Math)
**Status: 15/16 items at C4, 1 item at C3. Remaining: item 15 (no compile pipeline — acceptable at L2 scope).**

**Goal:** A pure function that maps vec3 → (screenPos, depth, visible). No pipeline integration yet — just prove the math is right.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces a contiguous `Float32Array` with stride 3 for positions via the Materializer/field-slot pipeline (spec I8).

> **INVARIANT (must be true before Level 3 can start):**
> The ortho kernel module has zero imports from `src/runtime/`, `src/compiler/`, or any stateful module. Calling `projectFieldOrtho` on the exact `Float32Array(N*3)` buffer produced by Level 1's layout kernels returns correct `screenPos`, `depth`, and `visible` outputs — proving the data shape contract between levels holds. The kernel's identity property (`screenPos === worldPos.xy` for z=0 with default camera) is the foundation all higher levels assume.

> **Implementation Hints (why this matters for later levels):**
> - The kernel signature must accept camera params as explicit arguments (not read from a global/singleton). Level 6 switches between ortho and perspective by passing different params to the SAME call site — if camera is baked in, you can't switch.
> - Return a struct `{ screenPos, depth, visible }` — not just screenPos. Level 7 uses depth for ordering and visible for culling. If you add these later, every call site changes.
> - Put default camera values in ONE canonical const object (e.g., `ORTHO_CAMERA_DEFAULTS`). Level 6 needs to swap between `ORTHO_CAMERA_DEFAULTS` and `PERSP_CAMERA_DEFAULTS` at a single point — if defaults are scattered, the toggle becomes a shotgun surgery.
> - The field variant must operate on the SAME `Float32Array` buffers from Level 1. Don't convert to/from object arrays. Level 5 wires these directly — any format translation is wasted work and a correctness risk.
> - Make the kernel a standalone module with zero imports from runtime/pipeline/assembler. Level 9 proves that continuity has no dependency on projection — if the kernel imports runtime state, that test fails.

## Unit Tests

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

## Field Variant Tests

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

## Integration Tests

- [ ] Compile + run a `GridLayout(3x3)` patch for 1 frame → pass world positions through ortho kernel → screenPos matches worldPos.xy for every instance
  > C3 impl-01 0123 "9 instances, gridLayout3D→projectFieldOrtho, all screenPos===worldPos.xy"
  > C3 reviewer-02 0123 "gridLayout->ortho correct, asserts identity for all 9 instances; does NOT go through compilation pipeline (not expected at L2 scope)"
- [ ] Default camera values come from exactly one source (grep/import-trace: only one definition exists)
  > C3 impl-01 0123 "ORTHO_CAMERA_DEFAULTS is Object.freeze'd, single export, verified frozen"
  > C4 reviewer-02 0123 "defined exactly once (ortho-kernel.ts:37), Object.freeze applied, zero imports in module, no competing definitions found"
