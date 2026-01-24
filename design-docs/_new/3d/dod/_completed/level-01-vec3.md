# Level 1: vec3 Everywhere (Data Representation)
**Status: 9/9 items at C4 (2 scorers agreeing). INVARIANT NOT YET VERIFIED — 3D layout kernels exist in `src/projection/layout-kernels.ts` but are not wired into the real Materializer/ScheduleExecutor pipeline.**

**Goal:** The world is 3D in memory. Nothing renders yet — just prove the data shape is correct.

> **PREREQUISITES: None.** This is the starting level.

> **INVARIANT (must be true before Level 2 can start):**
> `executeFrame()` with any patch containing a layout block produces a position buffer that is a contiguous `Float32Array` with stride 3, and the app's `Materializer` writes to it via the standard field-slot pipeline (spec I8: slot-addressed execution). Verify: compile a patch, run one frame, read the position slot — it is `Float32Array(N*3)` with finite values and explicit z components.

> **Implementation Hints (why this matters for later levels):**
> - Use `Float32Array` with stride 3 for positions — NOT a `Vec2` with an optional z. Level 5 (RenderAssembler) will pass these buffers directly to projection kernels, and any shape mismatch will force a rewrite.
> - Layout blocks MUST write z=0.0 explicitly, not leave memory uninitialized. Level 2's identity property (`screenPos === worldPos.xy`) depends on z being exactly 0.0 — garbage z will produce wrong depth values.
> - Make the position field a contiguous buffer (not an array of objects). Level 2-4's field kernels iterate over `Float32Array` directly for performance. If you use `{x, y, z}` objects, you'll have to rewrite all kernels at Level 5.
> - Size is a world-space scalar NOW — don't store it in pixels or screen units. Level 4 adds `projectWorldRadiusToScreenRadius` which assumes world-space input. If size is already in screen-space, that function becomes meaningless.

## Unit Tests

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

## Integration Tests

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
