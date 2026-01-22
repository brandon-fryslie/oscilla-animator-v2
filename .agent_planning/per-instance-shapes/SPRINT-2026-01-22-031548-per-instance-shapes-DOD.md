# Definition of Done: per-instance-shapes
Generated: 2026-01-22-031548
Confidence: MEDIUM
Plan: SPRINT-2026-01-22-031548-per-instance-shapes-PLAN.md

## Acceptance Criteria

### Shape Buffer Resolution
- [ ] `resolveShape()` correctly handles `{ k: 'slot' }` shape specification
- [ ] Shape buffer is read from slot and validated (type, length)
- [ ] Shape2D packed format is documented with word layout and alignment
- [ ] Error messages clearly indicate shape buffer issues (missing, wrong length, invalid format)
- [ ] Unit test: resolveShape with slot returns ArrayBufferView
- [ ] Unit test: resolveShape with missing slot throws descriptive error

### Topology Grouping
- [ ] Instances grouped by (topologyId, controlPointsBufferId) identity
- [ ] Grouping algorithm is O(N) single-pass (no nested loops)
- [ ] Each group tracks instance indices for buffer slicing
- [ ] Empty groups are filtered out (no zero-instance ops)
- [ ] Render order preserved within each topology group
- [ ] Unit test: 10 instances, 3 topologies produces 3 groups with correct indices
- [ ] Unit test: all instances same topology produces 1 group with all indices
- [ ] Unit test: each instance different topology produces N groups

### Multi-Op Emission
- [ ] `assembleDrawPathInstancesOp` returns `DrawPathInstancesOp[]` (array, not single op)
- [ ] One DrawPathInstancesOp emitted per topology group
- [ ] Each op has valid PathGeometry (topology, verbs, control points)
- [ ] Each op has valid InstanceTransforms (sliced position, color, size)
- [ ] Each op has valid PathStyle (sliced colors)
- [ ] Empty groups produce no ops (array length = number of non-empty groups)
- [ ] Integration test: render step with mixed shapes produces multiple ops
- [ ] Integration test: renderer executes all ops without errors

### Instance Buffer Slicing
- [ ] Position buffer sliced correctly per group (Float32Array, x,y interleaved)
- [ ] Color buffer sliced correctly per group (Uint8ClampedArray, RGBA interleaved)
- [ ] Sliced buffers have correct length (2*N for position, 4*N for color where N=group size)
- [ ] Instance indices correctly map full buffer → group buffer
- [ ] Uniform size/rotation/scale2 handled (not sliced, shared)
- [ ] Per-instance size/rotation/scale2 sliced when present (future work, document as TODO)
- [ ] Unit test: slice 10 instances at indices [0,3,7] produces buffers of length 6 and 12
- [ ] Unit test: sliced values match original buffer at source indices

### Renderer Integration
- [ ] `assembleRenderFrame_v2` flattens all ops from all render steps
- [ ] Renderer loops over all ops in frame (not just one per step)
- [ ] Each DrawPathInstancesOp rendered with correct geometry and instances
- [ ] No visual artifacts when rendering mixed topologies
- [ ] Performance: 100 instances across 5 topologies renders at >30fps (Canvas2D)
- [ ] Performance: 1000 instances across 10 topologies renders at >15fps (Canvas2D)
- [ ] Integration test: visual regression test with known output (golden image)

### Error Handling
- [ ] Shape buffer length validated at pass level (once, not per-instance)
- [ ] Topology existence validated at group level (once per topology)
- [ ] Control points buffer validated at group level (once per group)
- [ ] Error messages include instance indices and topology info
- [ ] No validation inside hot loops (instance iteration)
- [ ] Failed validation throws descriptive error (prevents render but no crash)
- [ ] Unit test: wrong buffer length throws at pass level
- [ ] Unit test: missing topology throws at group level with indices

### Documentation
- [ ] Shape2D buffer format documented (word layout, alignment, field meanings)
- [ ] Grouping algorithm documented with complexity analysis
- [ ] Performance characteristics documented (memory usage, state changes)
- [ ] Code comments explain topology grouping key construction
- [ ] Example usage provided (how to create Field<shape> from blocks)
- [ ] Migration guide: uniform shapes vs per-instance shapes

## Performance Targets

| Scenario | Instance Count | Topology Count | Target FPS | Status |
|----------|---------------|----------------|------------|--------|
| Simple | 100 | 5 | >30 | ⬜ Not tested |
| Moderate | 500 | 10 | >20 | ⬜ Not tested |
| Complex | 1000 | 10 | >15 | ⬜ Not tested |
| Stress | 1000 | 50 | >10 | ⬜ Not tested |

Note: Performance measured on Canvas2D renderer, typical viewport size (1920x1080).

## Deferred Work

The following items are explicitly OUT OF SCOPE for this sprint:

### Optimization Work (Priority: P3-P4)
- **Grouping optimization**: Use spatial sorting or style sorting to improve cache locality
- **Buffer view optimization**: Use TypedArray views instead of copying for slicing
- **Caching**: Cache topology groups across frames when shape field unchanged
- **Parallel grouping**: Use Web Workers for grouping with large instance counts

### Feature Extensions (Priority: P2-P3)
- **Per-instance size/rotation/scale2**: Currently only uniform supported
- **Dynamic shape changes**: Hot-swap topology with continuity preservation
- **Style per group**: Different fill/stroke per topology group
- **Stroke rendering**: Add strokeColor, strokeWidth to PathStyle

### Infrastructure (Priority: P4)
- **Shape2D buffer compression**: Pack flags and styleRef more efficiently
- **Topology registry optimization**: Convert string IDs to numeric (oscilla-animator-v2-4h6)
- **Memory profiling**: Track buffer allocation overhead
- **Performance dashboard**: Automated benchmarking

## Blockers and Questions

### BLOCKER: Dependency on oscilla-animator-v2-583
Bead oscilla-animator-v2-583 (RenderAssembler v2) MUST be complete before this work can start. Current status: in_progress.

**What's blocked**: All implementation work
**Unblock condition**: oscilla-animator-v2-583 closed and verified
**ETA**: Check bead status with `bd show oscilla-animator-v2-583`

### QUESTION: Shape2D Buffer Format Authority
The Shape2D packed format is defined in the spec but not yet implemented in materializer.

**Question**: Should we implement materializer Shape2D output first, or mock it for testing?
**Impact**: Implementation order and testing strategy
**Decision needed from**: User

### QUESTION: Performance Requirements
What's the target scenario we're optimizing for?

**Question**: What's a realistic max instance count and topology count?
**Impact**: Algorithm choice, optimization priorities
**Suggested answer**: 100-500 instances, 5-20 topologies (typical use cases)

### QUESTION: Topology Numeric IDs
Current topology IDs are strings. Spec recommends numeric IDs for O(1) lookup.

**Question**: Should we do oscilla-animator-v2-4h6 first, or cast strings to numbers in this sprint?
**Impact**: Performance and code cleanliness
**Current approach**: Cast in assembler (already present in code)

## Exit Criteria (to raise confidence to HIGH)

Before implementation:
- [ ] Bead oscilla-animator-v2-583 is CLOSED
- [ ] Shape2D buffer format documented and agreed upon
- [ ] Materializer capability confirmed (produces Shape2D buffers or mock available)
- [ ] Performance targets confirmed with user
- [ ] Topology grouping approach reviewed and approved

## Verification Checklist

After implementation, verify:
- [ ] All acceptance criteria checked
- [ ] All unit tests pass (coverage >80% for new code)
- [ ] All integration tests pass
- [ ] Performance targets met
- [ ] Visual regression tests pass (no rendering artifacts)
- [ ] Documentation complete and reviewed
- [ ] No warnings or errors in console during normal usage
- [ ] Code review completed
- [ ] User acceptance: demo with mixed topology instances renders correctly

## Notes

**Single Source of Truth**: The Shape2D buffer format documented in this sprint becomes the canonical reference for both materializer (producer) and assembler (consumer).

**Mechanical Enforcement**: Buffer length validation at pass level catches format errors early. Group-level topology validation catches missing topologies before rendering.

**Performance First**: Grouping algorithm is O(N) to ensure scalability. Renderer batching minimizes state changes.

**Testing Philosophy**: Unit tests for algorithms (grouping, slicing), integration tests for end-to-end (compile → execute → render).
