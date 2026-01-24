# Sprint: mode-toggle-tests - Level 6 Mode Toggle Tests
Generated: 2026-01-24T05:20:00
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Write all Level 6 DoD tests proving projection mode toggle doesn't corrupt state, produces correct output, and preserves world-space continuity.

## Scope
**Deliverables:**
- Unit tests: ProjectionMode type, assembler accepts mode, no reconstruction needed
- Integration tests: State preservation across toggle (7 assertions)
- Integration tests: Output correctness (5 assertions)
- Integration tests: World-space continuity across toggle (1 complex test)

## Work Items

### P0: Unit Tests (3 checkboxes)
**Acceptance Criteria:**
- [ ] Test that `ProjectionMode` type has exactly `'orthographic'` and `'perspective'` values
- [ ] Test that `projectInstances` (the RenderAssembler projection step) accepts a `CameraParams` with either mode and produces output
- [ ] Test that calling `projectInstances` with different modes on the same world data doesn't require any object reconstruction (same function, different arg)

**Technical Notes:**
- `ProjectionMode` already exists at `RenderAssembler.ts:56`
- `projectInstances()` already accepts `CameraParams` at `RenderAssembler.ts:92-97`
- "No reconstruction" means same function is called with different args — no class instantiation, no state reset

### P1: State Preservation Integration Tests (7 checkboxes)
**Acceptance Criteria:**
- [ ] Compile a patch, run 50 frames with ortho camera, snapshot `{ compiledSchedule, runtimeSlots, continuityMap }`
- [ ] Toggle to perspective camera, run 1 frame
- [ ] Assert: `compiledSchedule` is same object (referential equality via `===`)
- [ ] Assert: `runtimeSlots` values unchanged from frame-49 snapshot
- [ ] Assert: `continuityMap` is same object with same entries
- [ ] Toggle back to ortho, run 1 frame
- [ ] Assert: screenPosition output is bitwise identical to frame 50 output (before any toggle)

**Technical Notes:**
- Use a real compiled patch (GridLayout or similar) compiled via the compiler
- `CompiledProgramIR` is the `program` arg — just check referential equality
- `RuntimeState` has `values.f64` (Float64Array) and `values.objects` (Map) — snapshot the scalars
- For continuity: check if `ContinuityState` exists or if continuity is tracked elsewhere
- "Bitwise identical" means `Float32Array` byte-for-byte comparison

### P2: Output Correctness Integration Tests (5 checkboxes)
**Acceptance Criteria:**
- [ ] Run patch 1 frame ortho → capture screenPositions A
- [ ] Run same state 1 frame perspective → capture screenPositions B
- [ ] Assert: A !== B for off-center instances (perspective displaces them)
- [ ] Run same state 1 frame ortho again → capture screenPositions C
- [ ] Assert: A === C (bitwise — ortho is deterministic, toggle doesn't corrupt)

**Technical Notes:**
- Must use instances at non-zero z and off-center xy so perspective actually moves them
- Same `state` object between calls — camera is an argument, not state
- Use `toEqual` on Float32Array or manual byte comparison for bitwise checks

### P3: World-Space Continuity Across Toggle (1 checkbox)
**Acceptance Criteria:**
- [ ] Patch with sine-modulated z, run 150 frames toggling at frame 50 and 100:
  - Record world positions every frame
  - Assert: world position trajectory is smooth sine wave (no discontinuities at frame 50 or 100)
  - Compute first derivative: assert no spikes at toggle points

**Technical Notes:**
- Need a patch that produces time-varying z positions (sine wave modulation)
- This tests that world-space (pre-projection) is completely unaffected by camera mode
- "Smooth" = first derivative magnitude stays within expected bounds (no sudden jumps)
- The sine wave should be in the z-component specifically since that's what projection affects

## Dependencies
- All Level 5 tests must pass (verified ✅)
- Compiler must be able to compile a patch with a layout that produces vec3 positions

## Risks
- **LOW**: Need to verify how to compile a patch with sine-modulated z. May need a custom FieldExpr or use existing time-based signal in layout.
- **MITIGATION**: If sine z is hard to compile, use a simpler time-varying pattern or manually set z values per frame in the state.

## Implementation Strategy
All items are independent and can be implemented together in a single test file: `src/projection/__tests__/level6-mode-toggle.test.ts`

The tests are structured to exercise the real pipeline (`executeFrame`) with different camera args on each call — proving the toggle is purely a viewer concern.
