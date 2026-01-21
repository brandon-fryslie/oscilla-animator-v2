# Sprint: render-ir-v2 - Migrate to RenderFrameIR v2
Generated: 2026-01-21T21:15:00Z
Confidence: MEDIUM
Status: RESEARCH MAY BE NEEDED (depends on shape-resolution)

## Sprint Goal
Migrate from RenderFrameIR v1 to v2 (DrawOp-based), making the renderer a pure sink that executes typed draw operations.

## Context
The future-types.ts file defines the target architecture:
- `DrawPathInstancesOp` with explicit `PathGeometry` + `InstanceTransforms`
- `RenderFrameIR_Future` (v2) with `DrawOp[]`

This sprint implements that migration while maintaining backward compatibility.

## Current Understanding

The v2 format is well-defined in `src/render/future-types.ts`:
- `DrawPathInstancesOp`: geometry + instances + style
- `PathGeometry`: topologyId, verbs, points, pointsCount
- `InstanceTransforms`: count, position, size, rotation, scale2
- `PathStyle`: fillColor, strokeColor, etc.

## Unknowns
1. **Dual-format transition**: How to support both v1 and v2 during migration?
   - Research approach: Add version check, dispatch to appropriate handler
2. **Performance impact**: Does v2 format add overhead?
   - Research approach: Benchmark before/after

## Tentative Deliverables

### 1. Implement DrawPathInstancesOp production
RenderAssembler produces `DrawPathInstancesOp` for path passes:
- Convert resolved shapes to PathGeometry
- Package instance transforms
- Include styling

**Acceptance Criteria:**
- [ ] `DrawPathInstancesOp` produced by RenderAssembler
- [ ] PathGeometry contains resolved topology + points
- [ ] InstanceTransforms contains position/size/rotation
- [ ] Tests verify correct structure

### 2. Add v2 dispatch in renderer
Renderer handles both v1 and v2 formats:
- Check frame.version
- Dispatch to appropriate render path
- v2 path uses DrawOp execution

**Acceptance Criteria:**
- [ ] Renderer accepts RenderFrameIR v1 or v2
- [ ] v2 DrawOps executed correctly
- [ ] Identical visual output for both versions
- [ ] No regression in existing functionality

### 3. Remove shape decoding from renderer hot path
With v2, renderer becomes pure sink:
- No topology lookups
- No param mapping
- No control point scaling (done in assembler)

**Acceptance Criteria:**
- [ ] v2 render path has no shape interpretation
- [ ] No registry lookups in hot loop
- [ ] Renderer code significantly simplified

## Research Tasks
- [ ] Profile current render loop for baseline
- [ ] Determine optimal dual-format strategy
- [ ] Verify all shape types covered by v2 format

## Exit Criteria (to reach HIGH confidence)
- [ ] Dual-format strategy validated
- [ ] Performance impact measured and acceptable
- [ ] All shape types mapped to DrawOps

## Dependencies
- Sprint: extract-assembler (must complete first)
- Sprint: shape-resolution (must complete first)

## Files to Modify
- Modify: `src/runtime/RenderAssembler.ts`
- Modify: `src/runtime/ScheduleExecutor.ts` (export v2 types)
- Modify: `src/render/Canvas2DRenderer.ts`
- Modify: `src/render/future-types.ts` (promote to active use)
