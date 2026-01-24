# Level 10: Full System Certification (Golden Tests)

**Goal:** Multi-concern integration tests that exercise the entire pipeline under realistic conditions. If these pass, the system is correct.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces stride-3 `Float32Array` position buffers via Materializer (spec I8).
> - **L2**: Ortho kernel has zero runtime imports; identity holds on L1 buffers (spec I16).
> - **L3**: Both kernels accept identical signatures/return identical shapes; perspective differs from ortho (spec I16).
> - **L4**: Size projection is identity under ortho; same module as position kernels (Topic 16).
> - **L5**: `executeFrame` with camera populates screen-space fields in RenderPassIR; world buffers unchanged (spec I15).
> - **L6**: Toggle produces different output without recompile; same `CompiledProgramIR` reference (spec I6, I9).
> - **L7**: RenderPassIR contains only visible instances, depth-sorted and compacted (spec I15).
> - **L8**: Both backends produce identical pixel positions; neither imports `src/projection/` (Topic 16).
> - **L9**: ContinuityState identical regardless of camera mode; continuity has zero projection imports; write-trap on world buffers passes (spec I2, I30).

> **INVARIANT (must be true for the 3D system to be considered complete):**
> A 240-frame run with layout+continuity+toggle+export produces bitwise-identical `RenderPassIR` output whether the user toggled perspective mid-run or never toggled at all — proving spec I31 (export matches playback) and I21 (deterministic replay). The full pipeline `compile → executeFrame × 240 → export` exercises every level's work in composition, and the golden output is the single certification artifact for the entire 3D system.

> **Implementation Hints:**
> - If Levels 1-9 all pass, Level 10 should pass without new code. These tests are CERTIFICATION — they don't test new functionality, they test that all the pieces compose correctly. If a Level 10 test fails, the bug is in a lower level that wasn't caught by its own tests (find which level's invariant is violated and fix the gap there, not here).
> - The "golden patch" (10.1) is the single most important test in the project. It's the test you show someone to prove the system works. Write it first as a failing test, then watch it turn green as you complete each level. It exercises: vec3 positions, ortho identity, depth modulation, continuity stability, perspective parallax, size foreshortening, toggle round-trip, and export isolation — all in one 240-frame run.
> - The stress test (10.3) catches buffer-length bugs and NaN propagation that small tests miss. 10,000 instances with noise-modulated z will exercise every edge case in your projection and depth-sort code. Don't skip it just because the small tests pass.

## 10.1 The Golden Patch (Everything Together)

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

## 10.2 Determinism Replay

- [ ] Run golden patch for 60 frames, record all RenderPass outputs
  >
- [ ] Reset completely, recompile, run again
  >
- [ ] Assert: all 60 frames produce bitwise-identical outputs
  >
- [ ] Run with modulated camera (LFO → camPos.z): same determinism property holds
  >

## 10.3 Stress Test (Scale)

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

## 10.4 Export Isolation

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

## 10.5 Explicit Camera Override

- [ ] Patch with `CameraBlock(camPos=(0.5, 0.5, 3.0), fovY=60°)` wired
  >
- [ ] Run ortho: assert projection uses patch camera, NOT defaults (output differs from default-camera run)
  >
- [ ] Toggle perspective: assert perspective uses patch camera as base
  >
- [ ] Assert: default camera values are never read when explicit camera is wired
  >

## 10.6 CombineMode Enforcement in Full Compilation

- [ ] Compile patch with two shape2d writers to same slot, `CombineMode.last`: succeeds, last writer wins at runtime
  >
- [ ] Compile patch with `CombineMode.layer` on shape2d: diagnostic error produced at compile time
  >
- [ ] Error message names the restriction and suggests `ShapeStack` alternative
  >
- [ ] Compile patch with two float writers, `CombineMode.add`: succeeds, runtime produces sum
  >

## 10.7 Multi-Backend Golden Comparison

- [ ] Golden patch rendered through Canvas2D and SVG at frame 60 (ortho):
  - Positions match within 0.5px at 1000px viewport
  - Radii match within 0.5px
  >
- [ ] Same at frame 150 (perspective): same tolerances hold
  >
- [ ] Neither backend has performed any projection math (only consumed screen-space data)
  >
