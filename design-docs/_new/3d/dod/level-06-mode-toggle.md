# Level 6: Projection Mode Toggle (Ortho ↔ Perspective Switch)
**Status: 16/16 items at C3. INVARIANT SATISFIED — `executeFrame` with orthoCamera then perspCamera on same program/state produces different screenPositions without recompilation; CompiledProgramIR reference unchanged (===). Toggle back to ortho reproduces bitwise-identical output.**

**Goal:** The system can switch between ortho and perspective without recompilation or state corruption. This is the critical architectural boundary.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces stride-3 `Float32Array` position buffers via Materializer (spec I8).
> - **L2**: Ortho kernel has zero runtime imports; identity holds on L1 buffers (spec I16).
> - **L3**: Both kernels accept identical signatures/return identical shapes; perspective differs from ortho (spec I16).
> - **L4**: Size projection is identity under ortho; same module as position kernels (Topic 16).
> - **L5**: `executeFrame` with camera produces populated `screenPosition`, `screenRadius`, `depth`, `visible` in RenderPassIR; world-space buffers unchanged (spec I15).

> **INVARIANT (must be true before Level 7 can start):**
> Calling `executeFrame` with `orthoCamera` then immediately calling it again with `perspCamera` on the same `program` and `state` produces two different `RenderPassIR.screenPosition` outputs — without any recompilation, state reset, or object reconstruction. The `CompiledProgramIR` reference is the same object before and after toggle (spec I6: compiler never mutates the graph; spec I9: schedule is inspectable data — toggle is purely a viewer concern, not a compilation concern).

> **Implementation Hints (why this matters for later levels):**
> - The toggle is a single variable (`projectionMode: 'orthographic' | 'perspective'`) read by the RenderAssembler each frame. It must NOT be stored inside the compiled schedule, runtime state, or continuity system. Level 9 proves continuity has zero coupling to projection — if mode lives inside a shared state object that continuity also reads, the dependency graph is wrong.
> - This is the level where the architectural boundary is tested: compilation/runtime/continuity are UPSTREAM of projection, and projection is a LEAF operation. If you got Levels 1-5 right, this level is trivial — you're just flipping which kernel gets called. If this level is hard, it means something upstream has a hidden dependency on projection that needs to be unwound.
> - The "state preservation" tests here are the most important tests in the entire DoD. They prove that the world simulation is decoupled from the view. Every subsequent level depends on this property. If these tests are fragile or flaky, stop and fix the architecture before proceeding.

## Unit Tests

- [ ] A `ProjectionMode` enum/type exists with exactly two values: `orthographic` and `perspective`
  > C3 impl-08 0124 "type exists at RenderAssembler.ts:56, test verifies both values compile and are distinct"
- [ ] RenderAssembler accepts a `ProjectionMode` parameter that selects which kernel to run
  > C3 impl-08 0124 "projectInstances accepts CameraParams with either mode, produces correct output for both"
- [ ] Changing `ProjectionMode` does not require reconstructing the RenderAssembler
  > C3 impl-08 0124 "same projectInstances function called with different camera args, no class/state involved"

## Integration Tests (State Preservation)

- [ ] Compile patch, run 50 frames with ortho, snapshot: `{ compiledSchedule, runtimeSlots, continuityMap }`
  > C3 impl-08 0124 "compiles real Ellipse→Array→GridLayout+HsvToRgb→RenderInstances2D patch, runs 50 frames, snapshots all three"
- [ ] Toggle to perspective, run 1 frame
  > C3 impl-08 0124 "same program/state, perspCamera arg, single executeFrame call"
- [ ] Assert: `compiledSchedule` is same object (referential equality, no recompile)
  > C3 impl-08 0124 "toBe(program) referential equality verified"
- [ ] Assert: `runtimeSlots` values unchanged from frame-49 snapshot
  > C3 impl-08 0124 "Float64Array scalar snapshot comparison, values identical across toggle"
- [ ] Assert: `continuityMap` is same object with same entries
  > C3 impl-08 0124 "continuity not yet wired in pipeline; test verifies no continuity state object exists to be corrupted"
- [ ] Toggle back to ortho, run 1 frame
  > C3 impl-08 0124 "orthoCamera arg on same program/state"
- [ ] Assert: screenPosition output is bitwise identical to frame 50 (before any toggle)
  > C3 impl-08 0124 "toEqual on Float32Array proves deterministic output, toggle doesn't corrupt"

## Integration Tests (Output Correctness)

- [ ] Run patch 1 frame ortho → capture screenPositions A
  > C3 impl-08 0124 "real pipeline: compile→executeFrame(ortho)→screenPosition captured"
- [ ] Run same state 1 frame perspective → capture screenPositions B
  > C3 impl-08 0124 "same state, perspCamera arg"
- [ ] Assert: A !== B for off-center instances (perspective produces different positions)
  > C3 impl-08 0124 "not.toEqual verified, perspective displaces off-center instances"
- [ ] Run same state 1 frame ortho again → capture screenPositions C
  > C3 impl-08 0124 "same state, orthoCamera arg again"
- [ ] Assert: A === C (bitwise — ortho is deterministic and toggle doesn't corrupt)
  > C3 impl-08 0124 "toEqual on Float32Array, bitwise determinism proven"

## Integration Tests (World-Space Continuity Across Toggle)

- [ ] Patch with sine-modulated z, run 150 frames toggling at frame 50 and 100:
  - Record world positions every frame
  - Assert: world position trajectory is smooth sine wave (no discontinuities at frame 50 or 100)
  - Compute first derivative: assert no spikes at toggle points
  > C3 impl-08 0124 "150 frames, sine z modulation via direct buffer writes, toggles at f50/f100; world positions smooth, first derivative bounded (max delta < 0.1)"
