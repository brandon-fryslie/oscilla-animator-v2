# Level 1: vec3 Everywhere (Data Representation)
**Status: Not started.**

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
  >
- [ ] Constructing a position field with N instances allocates exactly `N * 3` floats
  >
- [ ] Reading back `[x, y, z]` triples from a position field returns the values written
  >
- [ ] Size fields are `Float32Array` with stride 1, interpreted as world-space radius
  >

## Integration Tests

- [ ] `GridLayout(4x4)` produces a `Field<vec3>` with 16 entries, each z === 0.0 (exact)
  >
- [ ] `LineLayout(N=8)` produces a `Field<vec3>` with 8 entries, each z === 0.0 (exact)
  >
- [ ] `CircleLayout(N=12)` produces a `Field<vec3>` with 12 entries, each z === 0.0 (exact)
  >
- [ ] A layout block that receives z-modulation input writes non-zero z values into the position field
  >
- [ ] Compile a minimal patch (`Layout → RenderSink`): the compiled schedule's position slot is typed as vec3
  >
