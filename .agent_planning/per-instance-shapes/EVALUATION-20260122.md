# Evaluation: Per-Instance Shapes — Phase 2 (Transforms & Performance)
Generated: 2026-01-22
Previous Sprint: SPRINT-2026-01-22-031548 (core infrastructure — COMPLETE)

## Current State Summary

The core per-instance shapes infrastructure is **fully implemented**:
- Shape2D buffer format: ✅ `RuntimeState.ts` (SHAPE2D_WORDS, readShape2D, writeShape2D)
- RenderAssembler v2: ✅ Topology grouping, buffer slicing, multi-op emission
- Canvas2DRenderer v2: ✅ Supports per-instance position, rotation, scale2, fill/stroke
- InstanceTransforms type: ✅ Accepts `Float32Array` for size, rotation, scale2
- Tests: ✅ 22 tests covering v1/v2 paths

## What's Missing (User-Requested Items)

### 1. Per-Instance Size/Rotation/Scale2 (IR → Assembler Wiring)

**Gap**: The `InstanceTransforms` TYPE supports per-instance size/rotation/scale2, and the Canvas2DRenderer already RENDERS them, but:

- `StepRender` IR only has `scale?: { k: 'sig'; id: SigExprId }` — uniform signal only
- No `rotationSlot`, `sizeSlot`, or `scale2Slot` fields on `StepRender`
- `buildInstanceTransforms()` takes `size: number` (uniform), never `Float32Array`
- `assemblePerInstanceShapes()` hardcodes `size: scale` with comment "// Uniform scale"
- `sliceInstanceBuffers()` only handles position and color, not size/rotation/scale2

**Work required**:
- Add slot fields to `StepRender` for per-instance transforms
- Compiler emits these slots when field expressions produce per-instance transforms
- Assembler reads buffers from slots and passes to `buildInstanceTransforms()`
- Buffer slicing extended to handle size/rotation/scale2

**Scope decision**: User says "only uniform supported for now" — so the work is adding IR fields + reading from slots, but the compiler can start with uniform-only emission. The assembler/renderer should handle both already.

### 2. Caching Topology Groups Across Frames

**Gap**: `groupInstancesByTopology()` runs every frame, rebuilding the `Map<string, TopologyGroup>` from scratch even if the shape buffer hasn't changed.

**Work required**:
- Detect when shape buffer is unchanged (identity check or generation counter)
- Cache the grouping result (Map + per-group instance indices)
- Invalidate when shape buffer changes (new reference or dirty flag)
- Metrics: log cache hit/miss rate

**Complexity**: LOW — the grouping is O(N) and N is typically small, but caching avoids allocation churn for static scenes.

### 3. Buffer View Optimization

**Gap**: `sliceInstanceBuffers()` creates NEW `Float32Array`/`Uint8ClampedArray` per group per frame. For M groups, this is M allocations every frame.

**Work required** (copies acceptable initially):
- Document the allocation pattern and measure overhead
- Future path: Use `TypedArray.subarray()` when indices are contiguous
- Future path: Pre-allocate scratch buffers and reuse across frames
- For now: Keep copies, add performance comments

**Scope decision**: User explicitly says "copies are acceptable initially" — so this is documentation + measurement, not implementation change.

### 4. Performance Dashboard / Benchmarking

**Gap**: No benchmark infrastructure exists. HealthMonitor tracks frame times but doesn't break down per-operation timing (grouping, slicing, geometry build, render).

**Work required**:
- Vitest benchmark configuration (`vitest bench`)
- Benchmark suite: grouping, slicing, multi-op assembly at various scales
- Performance regression tests with thresholds
- Optional: Per-operation timing in HealthMonitor for runtime profiling

## Verdict: CONTINUE

All items are well-understood. No ambiguities requiring user clarification. Confidence: HIGH for all items.

## Dependencies

- Core per-instance shapes: ✅ COMPLETE (previous sprint)
- Canvas2DRenderer v2: ✅ COMPLETE (already handles per-instance transforms)
- HealthMonitor: ✅ EXISTS (can extend for per-operation timing)
- Vitest: ✅ CONFIGURED (needs bench mode addition)
