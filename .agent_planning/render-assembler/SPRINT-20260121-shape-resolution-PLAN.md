# Sprint: shape-resolution - Pre-Resolve Shapes Before Renderer
Generated: 2026-01-21T21:15:00Z
Confidence: HIGH
Status: READY FOR IMPLEMENTATION (depends on extract-assembler)

## Sprint Goal
Move shape resolution from the renderer into RenderAssembler, so the renderer receives fully-resolved shape data with no interpretation required.

## Context
Currently, the renderer receives `ShapeDescriptor | ArrayBufferView | number` for shapes and must:
1. Determine shape mode (topology, perParticle, legacy)
2. Look up topology in registry by ID
3. Map params to topology definition
4. Handle controlPoints side-channel

After this sprint, shapes arrive at the renderer already resolved.

## Deliverables

### 1. Add shape resolution to RenderAssembler
Extend `assembleFrame()` to resolve ShapeDescriptor:
- Look up topology by topologyId
- Resolve control points from field buffers
- Produce normalized shape representation

**Acceptance Criteria:**
- [ ] ShapeDescriptor resolved to concrete topology + points in assembler
- [ ] Topology lookup happens in RenderAssembler, not renderer
- [ ] Control points embedded in shape data (not side-channel)
- [ ] All existing tests pass
- [ ] No behavioral changes to rendered output

### 2. Simplify renderer shape handling
Reduce shape interpretation in Canvas2DRenderer:
- Remove or simplify `determineShapeMode()`
- Renderer trusts pre-resolved shape data
- Keep backward compatibility with v1 format

**Acceptance Criteria:**
- [ ] Renderer no longer does topology registry lookups
- [ ] `determineShapeMode()` simplified or removed
- [ ] Rendered output identical to before
- [ ] All visual tests pass (if any exist)

### 3. Eliminate controlPoints side-channel
Remove `pass.controlPoints` optional field:
- Control points now part of resolved shape
- RenderAssembler produces complete shape data

**Acceptance Criteria:**
- [ ] `controlPoints?: ArrayBufferView` removed from RenderPassIR
- [ ] Renderer doesn't read controlPoints separately
- [ ] All path rendering still works

## Technical Approach

1. Add topology registry import to RenderAssembler
2. When assembling passes, resolve ShapeDescriptor:
   ```typescript
   if (isShapeDescriptor(shape)) {
     const topology = getTopology(shape.topologyId);
     const points = materialize(shape.controlPointsExprId);
     resolvedShape = { topologyId: numeric, verbs: topology.verbs, points };
   }
   ```
3. Update RenderPassIR to carry resolved shape (or add new field)
4. Update renderer to use resolved data
5. Remove controlPoints side-channel

## Dependencies
- Sprint: extract-assembler (must complete first)

## Files to Modify
- Modify: `src/runtime/RenderAssembler.ts`
- Modify: `src/runtime/ScheduleExecutor.ts` (RenderPassIR type)
- Modify: `src/render/Canvas2DRenderer.ts`

## Risks
| Risk | Probability | Mitigation |
|------|-------------|------------|
| Breaking path rendering | MEDIUM | Test with polygon/path patches |
| Missing shape types | LOW | Enumerate all shape modes first |
