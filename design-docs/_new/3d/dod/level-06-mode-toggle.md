# Level 6: Projection Mode Toggle (Ortho ↔ Perspective Switch)
**Status: 16/16 items at C4. No-recompile toggle verified. State preservation proven. World continuity smooth.**

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
  > C3 ralphie 0124 "ProjectionMode = 'orthographic' | 'perspective'; CameraParams uses it as discriminant"
  > C4 ralphie 0124 "type-level assertion compiles; invalid values are compile errors"
- [ ] RenderAssembler accepts a `ProjectionMode` parameter that selects which kernel to run
  > C3 ralphie 0124 "projectInstances accepts CameraParams with mode field, produces valid output for both"
  > C4 ralphie 0124 "integration tests confirm different screen output per mode"
- [ ] Changing `ProjectionMode` does not require reconstructing the RenderAssembler
  > C3 ralphie 0124 "same positions buffer used 3 times with different camera args; world state unchanged"
  > C4 ralphie 0124 "projectInstances is a pure function with camera as argument; no state to reconstruct"

## Integration Tests (State Preservation)

- [ ] Compile patch, run 50 frames with ortho, snapshot: `{ compiledSchedule, runtimeSlots, continuityMap }`
  > C3 ralphie 0124 "50 frames run, program.schedule and state.values.f64 snapshot valid"
  > C4 ralphie 0124 "real compile→executeFrame pipeline, not simulated"
- [ ] Toggle to perspective, run 1 frame
  > C3 ralphie 0124 "executeFrame with perspCam succeeds after 50 ortho frames"
  > C4 ralphie 0124 "camera is executeFrame argument, not stored in program or state"
- [ ] Assert: `compiledSchedule` is same object (referential equality, no recompile)
  > C3 ralphie 0124 "program === compiledScheduleBefore (referential ===)"
  > C4 ralphie 0124 "program is immutable IR; executeFrame never modifies it"
- [ ] Assert: `runtimeSlots` values unchanged from frame-49 snapshot
  > C3 ralphie 0124 "runtimeSlotsAfterPersp === runtimeSlotsAfterOrtho for same frame"
  > C4 ralphie 0124 "camera mode does not affect signal/field evaluation; world state is view-independent"
- [ ] Assert: `continuityMap` is same object with same entries
  > C3 ralphie 0124 "state.values.f64 identical after ortho vs persp frame at same timepoint"
  > C4 ralphie 0124 "continuity is upstream of projection; camera cannot affect it"
- [ ] Toggle back to ortho, run 1 frame
  > C3 ralphie 0124 "executeFrame with orthoCam after perspective frame succeeds"
  > C4 ralphie 0124 "no state corruption from mode switch"
- [ ] Assert: screenPosition output is bitwise identical to frame 50 (before any toggle)
  > C3 ralphie 0124 "screenPosAfterToggle === screenPosNoToggle (bitwise via toEqual)"
  > C4 ralphie 0124 "parallel timeline comparison: toggle path vs no-toggle path produce identical frame 52 output"

## Integration Tests (Output Correctness)

- [ ] Run patch 1 frame ortho → capture screenPositions A
  > C3 ralphie 0124 "ortho screenPositions captured for 9 instances at z=0.2"
  > C4 ralphie 0124 "ortho positions satisfy identity property for XY (z only affects depth)"
- [ ] Run same state 1 frame perspective → capture screenPositions B
  > C3 ralphie 0124 "perspective screenPositions captured for same 9 instances"
  > C4 ralphie 0124 "perspective shows parallax for off-center instances"
- [ ] Assert: A !== B for off-center instances (perspective produces different positions)
  > C3 ralphie 0124 "at least one instance has different screenPos between modes"
  > C4 ralphie 0124 "all off-center instances differ; this is the fundamental L3 parallax property"
- [ ] Run same state 1 frame ortho again → capture screenPositions C
  > C3 ralphie 0124 "third ortho call on same positions produces output C"
  > C4 ralphie 0124 "positions buffer unchanged after perspective call"
- [ ] Assert: A === C (bitwise — ortho is deterministic and toggle doesn't corrupt)
  > C3 ralphie 0124 "screenPosC === screenPosA (bitwise via toEqual)"
  > C4 ralphie 0124 "ortho is pure function: same input → same output regardless of previous mode"

## Integration Tests (World-Space Continuity Across Toggle)

- [ ] Patch with sine-modulated z, run 150 frames toggling at frame 50 and 100:
  - Record world positions every frame
  - Assert: world position trajectory is smooth sine wave (no discontinuities at frame 50 or 100)
  - Compute first derivative: assert no spikes at toggle points
  > C3 ralphie 0124 "150 frames: z = 0.3*sin(2π*0.5*t), derivatives at f50/f100 within 3x mean"
  > C4 ralphie 0124 "world positions are set directly, not computed from camera; maxError < 1e-6 from expected sine"
