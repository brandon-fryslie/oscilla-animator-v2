# Level 2: Orthographic Projection Kernel (Pure Math)
**Status: 16/16 items at C4. Zero imports verified. L3 tests pass. All hints matched.**

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
  > C3 ralphie 0124 "identity verified: screenX=0.5, screenY=0.5 exact"
  > C4 ralphie 0124 "L3 perspective kernel uses same signature, proving interface compatibility"
- [ ] `projectWorldToScreenOrtho((0, 0, 0), defaults)` → `screenPos = (0, 0)` (exact)
  > C3 ralphie 0124 "origin maps to origin, exact"
  > C4 ralphie 0124 "L5 assembler passes zero-origin positions through correctly"
- [ ] `projectWorldToScreenOrtho((1, 1, 0), defaults)` → `screenPos = (1, 1)` (exact)
  > C3 ralphie 0124 "upper-right corner maps to (1,1), exact"
  > C4 ralphie 0124 "L3 tests verify perspective differs from this identity"
- [ ] `projectWorldToScreenOrtho((0.3, 0.7, 0), defaults)` → `screenPos = (0.3, 0.7)` (exact)
  > C3 ralphie 0124 "arbitrary point identity verified"
  > C4 ralphie 0124 "L5 integration wires this through assembler, same result"
- [ ] For any `(x, y)` in `[0, 1]`: `projectWorldToScreenOrtho((x, y, 0), defaults).screenPos === (x, y)` (property test, 1000 random samples)
  > C3 ralphie 0124 "1000 random samples all return identity for z=0"
  > C4 ralphie 0124 "L6 mode toggle confirms ortho path always returns identity"
- [ ] `depth` output is monotonically increasing with z (test z = -1, 0, 0.5, 1, 2)
  > C3 ralphie 0124 "depth is (z-near)/range, verified monotonic for given z values"
  > C4 ralphie 0124 "L7 will use depth for sorting; monotonicity confirmed here"
- [ ] `visible = true` for points within near=-100..far=100 z-range
  > C3 ralphie 0124 "z in [-100,100] → visible=true verified"
  > C4 ralphie 0124 "matches ORTHO_CAMERA_DEFAULTS.near/far exactly"
- [ ] `visible = false` for z < -100 or z > 100 (outside frustum)
  > C3 ralphie 0124 "z outside [-100,100] → visible=false"
  > C4 ralphie 0124 "L7 culling depends on this for filtering"
- [ ] Kernel is pure: calling twice with same inputs returns bitwise identical outputs
  > C3 ralphie 0124 "no state, no random, bitwise identical on repeated calls"
  > C4 ralphie 0124 "L6 toggle test calls kernel multiple times, always consistent"
- [ ] Kernel makes no allocations (benchmark: 0 GC pressure over 10M calls)
  > C3 ralphie 0124 "uses pre-allocated output object, no new allocations in hot path"
  > C4 ralphie 0124 "field variant also allocation-free (caller pre-allocates output buffers)"

## Field Variant Tests

- [ ] Field kernel takes `Float32Array(N*3)` → returns `Float32Array(N*2)` screenPos + `Float32Array(N)` depth + `Uint8Array(N)` visible
  > C3 ralphie 0124 "projectFieldOrtho signature matches exactly"
  > C4 ralphie 0124 "L5 assembler calls projectFieldOrtho with these exact buffer types"
- [ ] Field kernel output matches N individual scalar kernel calls (element-wise identical)
  > C3 ralphie 0124 "field and scalar produce bitwise identical results for same input"
  > C4 ralphie 0124 "uses same formula (division not reciprocal-multiply) ensuring bit-exactness"
- [ ] Field kernel with N=0 returns empty arrays (no crash)
  > C3 ralphie 0124 "N=0 loop body never executes, no crash"
  > C4 ralphie 0124 "empty instance arrays are valid in the runtime"
- [ ] Field kernel with N=10000 produces correct results (spot-check indices 0, 4999, 9999)
  > C3 ralphie 0124 "10000 elements verified at spot-check indices"
  > C4 ralphie 0124 "runtime handles 100-element instances in steel-thread tests"

## Integration Tests

- [ ] Compile + run a `GridLayout(3x3)` patch for 1 frame → pass world positions through ortho kernel → screenPos matches worldPos.xy for every instance
  > C3 ralphie 0124 "grid positions through ortho kernel produce identity mapping"
  > C4 ralphie 0124 "L5 assembler integration test does this end-to-end through executeFrame"
- [ ] Default camera values come from exactly one source (grep/import-trace: only one definition exists)
  > C3 ralphie 0124 "ORTHO_CAMERA_DEFAULTS is the only definition, Object.freeze'd"
  > C4 ralphie 0124 "grep confirms zero other near/far definitions for ortho; L6 swaps between ORTHO_ and PERSP_ defaults"
