# Plan: 3D L5 Pipeline Ordering — Real Instrumentation

## Problem

Level 5 integration test #3 ("Pipeline runs signals → fields → continuity → projection → render IR in that order") is at C2 because it manually constructs the pipeline ordering with vitest spies rather than instrumenting the real `ScheduleExecutor` pipeline. This is Score Disqualifier #4 ("Simulated integration").

Two issues need fixing:
1. **Implementation gap**: `executeFrame()` accepts `camera?: CameraParams` but never passes it to `AssemblerContext` (line 291-295 of ScheduleExecutor.ts). The camera is dead code in the real pipeline.
2. **Test weakness**: The test manually calls `layoutSpy()` then `projectionSpy()` in sequence — it doesn't go through `executeFrame()` at all.

## Acceptance Criterion

> Pipeline runs signals → fields → continuity → projection → render IR in that order (instrument/spy to verify call sequence)

The test must invoke the **real** `executeFrame()` with a compiled program and verify that projection happens after field materialization, using instrumentation on the actual code paths.

## Plan

### Step 1: Wire camera through in ScheduleExecutor

In `src/runtime/ScheduleExecutor.ts`, the `render` case (lines 288-301) must pass camera to `AssemblerContext`:

```typescript
case 'render': {
  const assemblerContext: AssemblerContext = {
    signals,
    instances: instances as ReadonlyMap<string, InstanceDecl>,
    state,
    camera,  // ← ADD THIS
  };
  const pass = assembleRenderPass(step, assemblerContext);
  if (pass) {
    passes.push(pass);
  }
  break;
}
```

This is the implementation fix — without it, projection never runs in the real pipeline regardless of what tests say.

### Step 2: Rewrite the integration test

Replace the manual spy-based test with one that:

1. Compiles a minimal patch (GridLayout → CircleShape → RenderSink) using the real compile pipeline
2. Creates a RuntimeState and BufferPool
3. Calls `executeFrame()` with ortho camera params
4. Instruments the real functions via `vi.spyOn` on the module exports (not manual spy wrappers)
5. Verifies:
   - `assembleRenderPass` was called (proves render step executed)
   - The returned `RenderPassIR` contains screen-space projection fields (`screenPosition`, `depth`, `visible`)
   - The screen-space fields have correct values (ortho identity for z=0)
   - Field materialization happened before projection (the position buffer was populated when projection consumed it — provable because ortho identity means screenPos === worldPos.xy, which is only true if layout ran first)

The key insight: if the pipeline ran in wrong order (projection before layout), the position buffer would be uninitialized (all zeros or garbage), and the identity check would fail. This proves ordering without needing timing spies.

### Step 3: Verify all L5 tests still pass

Run the full L5 test suite to ensure nothing regressed.

## Files Modified

1. `src/runtime/ScheduleExecutor.ts` — wire `camera` into `AssemblerContext`
2. `src/projection/__tests__/level5-assembler-projection.test.ts` — rewrite integration test #3

## Risks

- The compile pipeline may not produce a schedule that includes a `render` step with the right field references. Need to verify what `compile()` actually produces for a simple patch.
- If `assembleRenderPass` doesn't find the position buffer in state (because field materialization writes to a different slot than render reads), the test will fail for the wrong reason. Need to trace the slot wiring.

## What This Does NOT Do

- Does not change the projection kernel logic (L2-L4 scope)
- Does not implement the mode toggle (L6 scope)
- Does not add depth sorting (L7 scope)
- Does not change backend code (L8 scope)
