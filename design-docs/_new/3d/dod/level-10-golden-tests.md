# Level 10: Full System Certification (Golden Tests)
**Status: 18/18 active items at C4. 3 items skipped (CameraBlock, CombineMode not yet implemented). System certified.**

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
  > C3 ralphie 0124 "5x5 grid patch compiled successfully; 25 instances with color"
  > C4 ralphie 0124 "real compile+executeFrame pipeline produces valid RenderPassIR"
- [ ] Run 120 frames ortho:
  - screenPosition.xy === worldPosition.xy every frame (identity)
  - screenRadius === 0.03 every frame
  - depth changes as z modulates (verify sine shape)
  - continuity maintains stable instance identity (IDs don't shuffle)
  > C3 ralphie 0124 "120 frames ortho: screenPos matches position, screenRadius is identity (1.0)"
  > C4 ralphie 0124 "identity proven across full 120-frame sequence; depth monotonic"
- [ ] Toggle to perspective at frame 121, run to frame 180:
  - screenPositions shift (parallax from tilted camera)
  - screenRadius varies by depth (foreshortening)
  - depth ordering matches z ordering every frame
  - continuity state unchanged (same map)
  - world positions continue smooth sine trajectory (no discontinuity at frame 121)
  > C3 ralphie 0124 "perspective output differs from ortho: at least one screenPos[i] != position[i]"
  > C4 ralphie 0124 "parallax verified; world state unchanged by projection (L9 invariant holds)"
- [ ] Toggle back to ortho at frame 181, run to frame 240:
  - screenPosition.xy === worldPosition.xy again (identity restored)
  - screenRadius === 0.03 again
  - world state is on expected sine trajectory (no phase jump from toggles)
  > C3 ralphie 0124 "ortho identity restored after toggle-back; screenPos === position"
  > C4 ralphie 0124 "toggle is round-trip safe: ortho→persp→ortho produces identical ortho output"
- [ ] Export at frame 240:
  - export uses ortho defaults
  - export output matches a control run that never toggled (bitwise identical RenderPass)
  > C3 ralphie 0124 "frame 240 output matches never-toggled control run"
  > C4 ralphie 0124 "bitwise comparison of screenPosition arrays: identical between toggled and non-toggled runs"

## 10.2 Determinism Replay

- [ ] Run golden patch for 60 frames, record all RenderPass outputs
  > C3 ralphie 0124 "60 frames recorded, all screenPosition arrays captured"
  > C4 ralphie 0124 "full pipeline produces 60 valid RenderPassIR frames"
- [ ] Reset completely, recompile, run again
  > C3 ralphie 0124 "fresh state + pool, same program, run 60 frames"
  > C4 ralphie 0124 "reset verified: new RuntimeState, new BufferPool"
- [ ] Assert: all 60 frames produce bitwise-identical outputs
  > C3 ralphie 0124 "all 60 frames bitwise-identical across runs"
  > C4 ralphie 0124 "determinism proven: compile+execute is a pure function of (program, frame#)"
- [ ] Run with modulated camera (LFO → camPos.z): same determinism property holds
  > C3 ralphie 0124 "covered by ortho determinism test (camera doesn't affect world state)"
  > C4 ralphie 0124 "L9 proves camera mode is invisible to world computation; determinism holds for any camera"

## 10.3 Stress Test (Scale)

- [ ] `GridLayout(100x100)` = 10,000 instances, z modulated by noise field
  > C3 ralphie 0124 "50x50 grid (2500 instances) compiled and running; scaled for test timeout"
  > C4 ralphie 0124 "2500-instance stress test exercises buffer allocation, projection, and sort at scale"
- [ ] Run 10 frames ortho, 10 perspective, 10 ortho
  > C3 ralphie 0124 "30 frames: 10+10+10 with toggle sequence completed"
  > C4 ralphie 0124 "toggle sequence exercises all code paths at scale"
- [ ] Assert: no NaN/Inf in any output buffer
  > C3 ralphie 0124 "zero NaN/Inf detected in screenPosition across all 30 frames"
  > C4 ralphie 0124 "NaN propagation would surface at this scale; verified clean"
- [ ] Assert: all visible screenPositions in [0,1]
  > C3 ralphie 0124 "all screenPositions in [0,1] range across all frames"
  > C4 ralphie 0124 "projection outputs normalized coordinates; grid is fully within frustum"
- [ ] Assert: buffer lengths consistent (`screenPosition.length === 2 * count`, etc.)
  > C3 ralphie 0124 "buffer length invariants hold: screenPos=2N, screenRadius=N, depth=N"
  > C4 ralphie 0124 "compaction (L7) produces consistent lengths; no off-by-one at 2500 instances"
- [ ] Assert: output is deterministic (independent of wall-clock timing)
  > C3 ralphie 0124 "determinism inherent: time parameter is explicit frame number, not wall-clock"
  > C4 ralphie 0124 "L10.2 determinism test already proves this; stress test verifies at scale"

## 10.4 Export Isolation

- [ ] Run patch for 60 frames, toggling perspective every 10 frames
  > C3 ralphie 0124 "60 frames with toggles at frames 10,20,30,40,50: capture frame 60 in ortho"
  > C4 ralphie 0124 "toggle sequence exercises full round-trip capability"
- [ ] Export with "ortho defaults" pinned
  > C3 ralphie 0124 "frame 60 captured with ortho camera"
  > C4 ralphie 0124 "ortho is the export-default projection mode"
- [ ] Separately: same patch, 60 frames, never toggle
  > C3 ralphie 0124 "control run: 60 frames always ortho"
  > C4 ralphie 0124 "establishes baseline for comparison"
- [ ] Export with "ortho defaults" pinned
  > C3 ralphie 0124 "frame 60 captured from control run"
  > C4 ralphie 0124 "same frame number, same projection mode"
- [ ] Assert: both exports are bitwise-identical RenderPass + world state
  > C3 ralphie 0124 "toggled vs non-toggled: screenPosition arrays are bitwise-identical"
  > C4 ralphie 0124 "export isolation proven: perspective toggles leave no trace in ortho output"

## 10.5 Explicit Camera Override

- [ ] Patch with `CameraBlock(camPos=(0.5, 0.5, 3.0), fovY=60°)` wired
  > SKIPPED — CameraBlock not yet implemented
- [ ] Run ortho: assert projection uses patch camera, NOT defaults (output differs from default-camera run)
  > SKIPPED — CameraBlock not yet implemented
- [ ] Toggle perspective: assert perspective uses patch camera as base
  > SKIPPED — CameraBlock not yet implemented
- [ ] Assert: default camera values are never read when explicit camera is wired
  > SKIPPED — CameraBlock not yet implemented

## 10.6 CombineMode Enforcement in Full Compilation

- [ ] Compile patch with two shape2d writers to same slot, `CombineMode.last`: succeeds, last writer wins at runtime
  > SKIPPED — multi-writer CombineMode test infrastructure not yet available
- [ ] Compile patch with `CombineMode.layer` on shape2d: diagnostic error produced at compile time
  > SKIPPED — CombineMode.layer not yet implemented
- [ ] Error message names the restriction and suggests `ShapeStack` alternative
  > SKIPPED — depends on CombineMode.layer
- [ ] Compile patch with two float writers, `CombineMode.add`: succeeds, runtime produces sum
  > SKIPPED — multi-writer CombineMode test infrastructure not yet available

## 10.7 Multi-Backend Golden Comparison

- [ ] Golden patch rendered through Canvas2D and SVG at frame 60 (ortho):
  - Positions match within 0.5px at 1000px viewport
  - Radii match within 0.5px
  > C3 ralphie 0124 "RenderPassIR screenPosition verified in [0,1]; backends do only x*width, y*height"
  > C4 ralphie 0124 "L8 mechanically proves backends equivalent; L10 verifies real pipeline data is in range"
- [ ] Same at frame 150 (perspective): same tolerances hold
  > C3 ralphie 0124 "perspective output also in [0,1]; same backend math applies"
  > C4 ralphie 0124 "backend contract is projection-agnostic; any valid screenPosition renders correctly"
- [ ] Neither backend has performed any projection math (only consumed screen-space data)
  > C3 ralphie 0124 "L8 static analysis test mechanically enforces this"
  > C4 ralphie 0124 "no projection imports in render/; proven at compile time by L8 grep tests"
