# Sprint: camera-wiring - Wire Camera Through Pipeline & Fix Ordering Test

Generated: 2026-01-24
Confidence: HIGH: 2, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Wire the `camera` parameter from `executeFrame` into `AssemblerContext`, and rewrite the pipeline ordering integration test to invoke the real pipeline instead of manually sequencing spies.

## Scope

**Deliverables:**
1. Wire camera param through ScheduleExecutor → AssemblerContext
2. Rewrite pipeline ordering test to use real `executeFrame` call

## Work Items

### P0: Wire camera into AssemblerContext

**Acceptance Criteria:**
- [ ] `ScheduleExecutor.executeFrame(program, state, pool, tAbsMs, orthoCamera)` passes `camera` to the `AssemblerContext` created at the `render` step
- [ ] When camera is provided, `assembleRenderPass` receives it and calls `projectInstances`
- [ ] The resulting `RenderPassIR` has `screenPosition`, `screenRadius`, `depth`, and `visible` fields populated
- [ ] When camera is NOT provided (undefined), behavior is unchanged (no projection, no regression)

**Technical Notes:**
- One-line change: Add `camera,` to the AssemblerContext object literal at ScheduleExecutor.ts:291-295
- All downstream code already exists and is tested (L4 SOLID)

### P1: Rewrite pipeline ordering integration test

**Acceptance Criteria:**
- [ ] Test compiles a real patch (GridLayout → CircleShape → RenderSink), calls `executeFrame` with an ortho camera param
- [ ] Test verifies the output RenderPassIR has all four screen-space fields (screenPosition, screenRadius, depth, visible) populated with correct values
- [ ] This inherently proves ordering: fields must be materialized before projection can consume them — if ordering were wrong, projection would read uninitialized buffers and produce garbage/zeros
- [ ] No manual spy sequencing, no simulated integration — the test goes through `executeFrame` (the real orchestration layer)
- [ ] Score can be raised from C2 to C3+

**Technical Notes:**
- Reuse the same compile+execute pattern from the other two integration tests in this file
- The key insight: if `executeFrame` with camera produces correct screen-space output, ordering MUST be correct (materialize before render/project). No spy needed.
- The identity property (ortho + z=0 → screenPos === worldPos.xy) is the assertion that proves correctness

## Dependencies

- L4 SOLID (all kernels tested, size projection identity verified) ✓
- `assembleRenderPass` already handles camera ✓
- `projectInstances` fully implemented ✓

## Risks

- **None significant.** The infrastructure is all in place. This is a 1-line production fix + test rewrite.
- **Viewer-side duplication:** After this, both the pipeline AND `applyViewerProjection` in main.ts can project. This is intentional — Level 6 will resolve which path is canonical. For now, both can coexist.
