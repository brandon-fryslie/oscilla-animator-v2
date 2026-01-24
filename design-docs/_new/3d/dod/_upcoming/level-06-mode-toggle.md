# Level 6: Projection Mode Toggle (Ortho ↔ Perspective Switch)

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
  >
- [ ] RenderAssembler accepts a `ProjectionMode` parameter that selects which kernel to run
  >
- [ ] Changing `ProjectionMode` does not require reconstructing the RenderAssembler
  >

## Integration Tests (State Preservation)

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

## Integration Tests (Output Correctness)

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

## Integration Tests (World-Space Continuity Across Toggle)

- [ ] Patch with sine-modulated z, run 150 frames toggling at frame 50 and 100:
  - Record world positions every frame
  - Assert: world position trajectory is smooth sine wave (no discontinuities at frame 50 or 100)
  - Compute first derivative: assert no spikes at toggle points
  >
