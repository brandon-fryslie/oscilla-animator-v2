# Evaluation: 3d-L5-pipeline-ordering-and-invariant-wiring

**Date:** 2026-01-24
**Verdict:** CONTINUE

## Current State

Level 5 (Pipeline Wiring) has **7/8 items at C3+, 1 item at C2**. The L4 floor is SOLID (all C4+).

Two linked issues remain:

### Issue 1: Pipeline Ordering Test (C2) — Score Disqualifier #4

**File:** `src/projection/__tests__/level5-assembler-projection.test.ts:215-268`

The "Pipeline runs signals → fields → continuity → projection → render IR in that order" test is a **simulated integration**. It:
1. Creates two spies (layoutSpy, projectionSpy)
2. Manually calls them in sequence
3. Verifies the sequence it just created

This proves nothing about the actual pipeline. Per ORIENTATION.md Score Disqualifier #4: "An integration test that doesn't integrate anything — it imports individual functions and calls them in sequence rather than going through the real orchestration layer."

### Issue 2: L5 Invariant Not Satisfied — Dead Camera Parameter

**File:** `src/runtime/ScheduleExecutor.ts:200,291-295`

`executeFrame` accepts `camera?: CameraParams` but **never passes it to the AssemblerContext**:
```typescript
const assemblerContext: AssemblerContext = {
  signals,
  instances: instances as ReadonlyMap<string, InstanceDecl>,
  state,
  // camera is MISSING
};
```

The L5 invariant requires: "Calling `executeFrame(program, state, pool, tAbsMs, orthoCamera)` produces a RenderPassIR whose `screenPosition`, `screenRadius`, `depth`, and `visible` fields are all populated."

Currently the camera param is dead code — `assembleRenderPass` already checks `context.camera` and calls `projectInstances` when present, but it never receives camera.

### How They Connect

These are the same bug expressed two ways:
1. The test can't verify real pipeline ordering because the pipeline doesn't actually wire camera→projection
2. The invariant isn't satisfied because the wiring is missing

**Fix both with one change:** Wire `camera` into `AssemblerContext`, then rewrite the test to call `executeFrame` with a camera param and verify the output has screen-space fields populated.

## Infrastructure Ready

- `AssemblerContext` already has `camera?: CameraParams` field
- `assembleRenderPass` already checks for camera and calls `projectInstances`
- `projectInstances` is fully implemented and tested (L4 SOLID)
- The only missing piece is `ScheduleExecutor.ts:291-295` not including `camera` in the context

## Risks

1. **Viewer-side projection (`applyViewerProjection`) duplication:** After this fix, projection runs inside the pipeline. The viewer-side post-processing in `main.ts:1043-1067` will be redundant for the camera case. This is a Level 6 concern (mode toggle), not Level 5.

2. **Optional camera means existing tests still pass:** Since `camera` is optional, all existing tests that don't pass camera will still get the no-projection path. No regression risk.
