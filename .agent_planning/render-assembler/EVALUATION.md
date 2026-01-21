# Evaluation: RenderAssembler / Before-Render Stage

**Topic:** Render Pipeline Refactor - RenderAssembler Stage
**Source:** `.agent_planning/_future/8-before-render.md`
**Generated:** 2026-01-21
**Verdict:** CONTINUE (3 sprints for core work, 2 future sprints deferred)

## Summary

The recommendation describes adding a RenderAssembler stage between schedule execution and rendering. This stage resolves all IR references into concrete typed arrays, making the renderer a pure sink with no interpretation logic.

## Current State Analysis

### What Exists

1. **ScheduleExecutor.executeFrame()** - Already produces `RenderFrameIR`
   - Evaluates signals → f64 typed array
   - Materializes fields → typed array buffers
   - Assembles render passes with slot references

2. **RenderFrameIR (v1)** - Current structure
   - `position: ArrayBufferView` ✅ Already concrete
   - `color: ArrayBufferView` ✅ Already concrete
   - `size: number | ArrayBufferView` ✅ Already concrete
   - `shape: ShapeDescriptor | ArrayBufferView | number` ❌ Not fully resolved
   - `controlPoints?: ArrayBufferView` ❌ Side-channel hack

3. **Materializer** - Already correct
   - Returns typed arrays
   - Coordinate-space agnostic
   - Field kernel dispatch working

4. **future-types.ts** - Target architecture defined
   - `DrawPathInstancesOp` with explicit `PathGeometry` + `InstanceTransforms`
   - `RenderFrameIR_Future` (v2) with `DrawOp[]`

### Gaps Identified

| Gap | Current State | Target State | Sprint |
|-----|---------------|--------------|--------|
| Shape resolution | `ShapeDescriptor` union in RenderPassIR | Numeric topologyId + resolved geometry | Sprint 1 |
| Control points | Side-channel `pass.controlPoints` | Embedded in `PathGeometry` | Sprint 1 |
| Renderer interpretation | Decodes shapes, maps params, scales points | Pure sink, no interpretation | Sprint 2 |
| Typed scalar banks | Single f64 array | Separate f32/i32/shape2d banks | Future |
| SlotMeta storage kinds | Implicit | Explicit f32/i32/shape2d markers | Future |

## Sprint Breakdown

### Sprint 1: RenderAssembler Core (HIGH confidence)
**Goal:** Extract render assembly logic into dedicated module

- Create `src/runtime/RenderAssembler.ts`
- Move render pass assembly from ScheduleExecutor to RenderAssembler
- Keep current RenderPassIR structure (no breaking changes)
- Add `assembleFrame()` function that ScheduleExecutor calls

**Files:**
- Create: `src/runtime/RenderAssembler.ts`
- Modify: `src/runtime/ScheduleExecutor.ts` (call assembleFrame)

### Sprint 2: Shape Resolution (HIGH confidence)
**Goal:** Resolve shapes before renderer sees them

- Add shape resolution in RenderAssembler
- Convert `ShapeDescriptor` to resolved `PathGeometry`
- Eliminate `controlPoints` side-channel
- Renderer still accepts v1 format but shapes are pre-resolved

**Files:**
- Modify: `src/runtime/RenderAssembler.ts`
- Modify: `src/render/Canvas2DRenderer.ts` (simplify shape handling)

### Sprint 3: RenderFrameIR v2 Migration (MEDIUM confidence)
**Goal:** Migrate to future-types.ts structure

- Implement `DrawPathInstancesOp` production in RenderAssembler
- Add v2 dispatch path in renderer
- Dual-format support during transition
- Remove shape decoding from renderer hot path

**Files:**
- Modify: `src/runtime/RenderAssembler.ts`
- Modify: `src/render/Canvas2DRenderer.ts`
- Modify: `src/render/future-types.ts` (promote to active use)

### Future Sprint A: Typed Scalar Banks (DEFERRED)
**Goal:** Separate scalar storage by type

- Add `scalarsF32`, `scalarsI32`, `scalarsShape2D` to RuntimeState
- Update SlotMeta with storage kind markers
- Update all slot read/write paths

**Rationale for deferral:** Requires extensive changes to RuntimeState and slot system. Current single-array approach works. Prioritize visible architectural improvements first.

### Future Sprint B: Local-Space Geometry (DEFERRED)
**Goal:** Control points in local space, instance transforms separate

- Kernels output unit-radius geometry
- Instance transforms applied at render time
- Consistent scale/rotate/translate behavior

**Rationale for deferral:** Requires changes to multiple kernels and renderer transform logic. Current world-space approach works for basic cases.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing patches | LOW | HIGH | Keep v1 format support, test extensively |
| Performance regression | MEDIUM | MEDIUM | Profile before/after, optimize hot paths |
| Incomplete shape resolution | LOW | MEDIUM | Start with current shapes, extend incrementally |

## Recommendations

1. **Start with Sprint 1** - Minimal risk, creates clean separation
2. **Sprint 2 can follow immediately** - Shape resolution is well-understood
3. **Sprint 3 requires careful testing** - Dual-format adds complexity
4. **Defer Future Sprints** - Typed banks are optimization, not blocking

## Dependencies

- Sprint 2 depends on Sprint 1
- Sprint 3 depends on Sprint 2
- Future sprints independent of Sprints 1-3

## Files Reference

- Recommendation: `.agent_planning/_future/8-before-render.md`
- Future types: `src/render/future-types.ts`
- Current executor: `src/runtime/ScheduleExecutor.ts`
- Current renderer: `src/render/Canvas2DRenderer.ts`
- Materializer: `src/runtime/Materializer.ts`
