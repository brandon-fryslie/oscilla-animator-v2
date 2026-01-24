# Level 5: RenderAssembler Projection Stage (Pipeline Wiring)
**Status: 7/8 items at C3+, 1 item at C2 (pipeline ordering spy test). INVARIANT NOT YET SATISFIED — `ScheduleExecutor.executeFrame` accepts `camera` param but does not pass it to `AssemblerContext` (dead code). Lowest: pipeline ordering (C2:impl-06:0123, manual spy ordering).**

**Goal:** Projection kernels are called at the right place in the pipeline. World-space in, screen-space out. No toggle yet — just ortho default working end-to-end.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces stride-3 `Float32Array` position buffers via Materializer (spec I8).
> - **L2**: Ortho kernel has zero runtime imports; identity property holds on L1 buffers (spec I16).
> - **L3**: Both kernels accept identical signatures/return identical shapes; perspective differs from ortho (spec I16).
> - **L4**: `projectWorldRadiusToScreenRadius` is identity under ortho defaults; lives in same module as position kernels (Topic 16).

> **INVARIANT (must be true before Level 6 can start):**
> Calling `executeFrame(program, state, pool, tAbsMs, orthoCamera)` on a compiled patch produces a `RenderPassIR` whose `screenPosition`, `screenRadius`, `depth`, and `visible` fields are all populated — proving the camera parameter flows through `ScheduleExecutor` → `assembleRenderPass` → `projectInstances` in the real pipeline. The world-space position buffer in `state` is unchanged after the call (spec I15: renderer is sink only, no mutation of upstream state).

> **Implementation Hints (why this matters for later levels):**
> - The RenderAssembler must accept camera params and a projection mode as ARGUMENTS to its per-frame method — not as constructor config or state. Level 6 changes the mode every frame without reconstructing anything. If mode is baked into the assembler, toggling requires creating a new assembler (which may reset state).
> - World-space buffers must be READ-ONLY from the assembler's perspective. Use `Readonly<Float32Array>` or equivalent. Level 9 verifies (via write traps) that projection never mutates world state. If the assembler writes to world buffers even accidentally, that test will catch it — but it's easier to prevent with types now.
> - The assembler must produce its screen-space outputs into SEPARATE buffers (not in-place over world buffers). Level 6 needs to re-run projection with different params on the same world state. If projection overwrites the input, the second run gets garbage.
> - Don't hardcode ortho as the only path. Even though this level only tests ortho, structure the code as `if (mode === 'orthographic') { orthoKernel(...) } else { perspKernel(...) }` now. The Level 6 test literally flips that flag — if the branch doesn't exist, you're doing surgery under pressure.

## Unit Tests

- [ ] RenderAssembler has a projection step that accepts: world position buffers + camera params
  > C3 impl-02 0123 "projectInstances() accepts Float32Array(N*3) + CameraParams, exported from RenderAssembler"
  > C4 reviewer-05 0123 "signature verified for both camera modes, function accepts inputs as arguments not state"
- [ ] RenderAssembler projection step outputs: `screenPosition: Float32Array`, `screenRadius: Float32Array`, `depth: Float32Array`, `visible: Uint8Array`
  > C3 impl-02 0123 "ProjectionOutput struct with correct types, tested N=9"
  > C4 reviewer-05 0123 "all four types verified, lengths checked for correct stride (2 for positions, 1 for others)"
- [ ] RenderAssembler does NOT mutate world-space input buffers (snapshot before === snapshot after)
  > C3 impl-02 0123 "snapshot comparison before/after both ortho and persp, toEqual verified"
  > C5 reviewer-05 0123 "snapshot before/after both modes, exceeds requirements"
  > C5 reviewer-06 0123 "test: C5 all dimensions; impl: C5 pure separation; minor: type sig uses Float32Array not Readonly<Float32Array>"
- [ ] RenderPass struct contains all four screen-space fields with correct lengths
  > C3 impl-02 0123 "screenPosition(N*2), screenRadius(N), depth(N), visible(N) all verified"
  > C3 reviewer-05 0123 "tests ProjectionOutput not RenderPassIR; gap covered by integration tests when implemented"
  > C3 reviewer-06 0123 "test targets ProjectionOutput not RenderPassIR (C3 correct); impl C4 correct-by-construction; gap: optional camera in assembleRenderPass means fields can be absent"

## Integration Tests

- [ ] Compile `GridLayout(4x4)` → `CircleShape(radius=0.03)` → `RenderSink`; run full pipeline for 1 frame:
  - World positions are vec3 with z=0
  - RenderAssembler runs ortho projection
  - RenderPass.screenPosition matches worldPosition.xy (identity)
  - RenderPass.screenRadius === 0.03 for all instances
  - RenderPass.depth is uniform (all z=0)
  - RenderPass.visible is all-true
  > C3 impl-06 0123 "all 6 sub-properties verified with toBe() exact equality; uses projectInstances directly (compile pipeline not yet 3D-aware)"
- [ ] Same patch but layout emits z=0.3 for all instances:
  - screenPosition.xy still matches worldPosition.xy (ortho identity holds regardless of z)
  - depth values differ from z=0 case
  - visible is still all-true
  > C3 impl-06 0123 "all 3 sub-properties verified; compares z=0.3 vs z=0 depth, ortho identity holds, all visible"
- [ ] Pipeline runs signals → fields → continuity → projection → render IR in that order (instrument/spy to verify call sequence)
  > C2 impl-06 0123 "uses vitest spies to verify layout→projection ordering; weak: constructs ordering manually rather than instrumenting real pipeline"
- [ ] No world-to-screen math exists in backend code (grep: backends import no projection functions)
  > C3 impl-06 0123 "reads Canvas2D/SVG source files, checks for forbidden imports and function patterns; static analysis in test"
