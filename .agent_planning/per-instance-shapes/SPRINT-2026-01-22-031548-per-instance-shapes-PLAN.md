# Sprint: per-instance-shapes - Per-Instance Shape Support
Generated: 2026-01-22-031548
Updated: 2026-01-22-230000
Confidence: HIGH
Status: READY FOR IMPLEMENTATION
Source: Bead oscilla-animator-v2-f2w
Dependency: Bead oscilla-animator-v2-583 (RenderAssembler v2) — CLOSED ✅

## Sprint Goal
Enable per-instance shape specification using `Field<shape>` so each instance can have a different shape topology and control points, grouped by topology for efficient batched rendering.

## Scope

**Deliverables:**
- RenderAssembler handles `{ k: 'slot' }` shape specification
- Group instances by topology (topologyId + control points identity)
- Produce multiple `DrawPathInstancesOp` operations per render step (one per topology group)
- Maintain performance through batching (minimize state changes)
- Handle empty groups gracefully

**Out of Scope:**
- Optimization of grouping algorithm (use simple approach first)
- Caching of topology groups across frames
- Dynamic shape changes during animation (handled by continuity system separately)

## Work Items

### P0: Shape Buffer Resolution

**Dependencies**: RenderAssembler v2 (oscilla-animator-v2-583) complete
**Spec Reference**: `.agent_planning/_future/9-renderer.md` section 5 • `src/compiler/ir/types.ts` StepRender shape field

#### Description
Implement shape buffer resolution in `assembleDrawPathInstancesOp` for the `{ k: 'slot' }` case. Currently this throws "not yet implemented" error. The shape buffer contains packed Shape2D references for each instance.

#### Acceptance Criteria
- [ ] `resolveShape()` returns ArrayBufferView when `shapeSpec.k === 'slot'`
- [ ] Shape buffer is validated (exists in slot, correct type)
- [ ] Shape buffer format is documented (packed Shape2D layout from spec)
- [ ] Error messages are clear when shape buffer is missing or malformed

#### Technical Notes
Shape buffer format (from `.agent_planning/_future/3-local-space-spec-deeper.md`):
- Packed u32 array: `[topologyId, pointsFieldSlot, pointsCount, styleRef, flags, ...]` per instance
- 8 words per Shape2D reference (SHAPE2D_WORDS = 8)
- Extract topology ID and points buffer slot for each instance

### P0: Topology Grouping Algorithm

**Dependencies**: Shape buffer resolution
**Spec Reference**: `.agent_planning/_future/9-renderer.md` section 5

#### Description
Group instances by topology identity to enable batched rendering. Instances with the same topology and control points buffer can be rendered together in a single `DrawPathInstancesOp`.

Grouping key: `(topologyId, controlPointsBufferId)`

#### Acceptance Criteria
- [ ] Instances are grouped by topology identity (topologyId + points buffer)
- [ ] Each group maintains correct instance indices for buffer slicing
- [ ] Empty groups are skipped (zero instances)
- [ ] Grouping preserves render order within each topology group
- [ ] Algorithm is O(N) where N = instance count (single pass)

#### Technical Notes
Algorithm sketch:
```typescript
type TopologyGroup = {
  topologyId: number;
  controlPoints: Float32Array;
  instanceIndices: number[];
};

// Single pass grouping
const groups = new Map<string, TopologyGroup>();
for (let i = 0; i < count; i++) {
  const shapeRef = readShape2DFromBuffer(shapeBuffer, i);
  const key = `${shapeRef.topologyId}:${shapeRef.pointsFieldSlot}`;

  if (!groups.has(key)) {
    groups.set(key, {
      topologyId: shapeRef.topologyId,
      controlPoints: materializePoints(shapeRef),
      instanceIndices: [],
    });
  }
  groups.get(key)!.instanceIndices.push(i);
}
```

### P1: Multi-Op Emission

**Dependencies**: Topology grouping
**Spec Reference**: `src/render/future-types.ts` DrawPathInstancesOp

#### Description
Modify `assembleDrawPathInstancesOp` to produce multiple `DrawPathInstancesOp` operations (one per topology group) instead of throwing on per-instance shapes.

#### Acceptance Criteria
- [ ] Function signature updated to return `DrawPathInstancesOp[]` instead of single op
- [ ] Each topology group produces one DrawPathInstancesOp
- [ ] Instance transforms are sliced correctly per group (position, color, etc.)
- [ ] All groups have valid geometry, instances, and style structures
- [ ] Empty groups produce no ops (filtered out)

#### Technical Notes
For each group:
1. Build `PathGeometry` from group's topology and control points
2. Build `InstanceTransforms` by slicing position/color buffers at group's instance indices
3. Build `PathStyle` from color buffer slices
4. Emit `DrawPathInstancesOp` for this group

Buffer slicing must preserve instance order and correctly map indices.

### P1: Instance Buffer Slicing

**Dependencies**: Multi-op emission
**Spec Reference**: `src/render/future-types.ts` InstanceTransforms

#### Description
Implement buffer slicing to extract per-group instance data (position, color, size, rotation, scale2) from the full instance buffers based on topology group membership.

#### Acceptance Criteria
- [ ] Position buffer correctly sliced per group (Float32Array, x,y interleaved)
- [ ] Color buffer correctly sliced per group (Uint8ClampedArray, RGBA per instance)
- [ ] Uniform size/rotation/scale2 handled (shared across all groups)
- [ ] Per-instance size/rotation/scale2 correctly sliced when present
- [ ] Sliced buffers have correct length (2 * instanceCount for vec2, 4 * instanceCount for color)

#### Technical Notes
```typescript
function sliceInstanceBuffers(
  fullPositions: Float32Array,
  fullColors: Uint8ClampedArray,
  instanceIndices: number[]
): { position: Float32Array; color: Uint8ClampedArray } {
  const N = instanceIndices.length;
  const position = new Float32Array(N * 2);
  const color = new Uint8ClampedArray(N * 4);

  for (let i = 0; i < N; i++) {
    const srcIdx = instanceIndices[i];
    position[i*2]   = fullPositions[srcIdx*2];
    position[i*2+1] = fullPositions[srcIdx*2+1];

    color[i*4]   = fullColors[srcIdx*4];
    color[i*4+1] = fullColors[srcIdx*4+1];
    color[i*4+2] = fullColors[srcIdx*4+2];
    color[i*4+3] = fullColors[srcIdx*4+3];
  }

  return { position, color };
}
```

### P2: Renderer Integration

**Dependencies**: Multi-op emission, instance buffer slicing
**Spec Reference**: `src/render/Canvas2DRenderer.ts`

#### Description
Update renderer to handle multiple DrawPathInstancesOp operations from a single render step. Current renderer expects one op per step.

#### Acceptance Criteria
- [ ] Renderer loops over all ops (not just single op)
- [ ] Each op is rendered with correct topology and instance data
- [ ] State changes minimized between ops (same style settings shared)
- [ ] No visual artifacts or incorrect rendering
- [ ] Performance acceptable (measure frame time with 100+ instances across 5+ topologies)

#### Technical Notes
Renderer changes are minimal - already loops over operations. Just ensure `assembleRenderFrame_v2` returns all ops from all groups.

### ~~P2: Shape2D Buffer Format Documentation~~ — ALREADY DONE

Canonical layout documented in `src/runtime/RuntimeState.ts`:
- `SHAPE2D_WORDS = 8` (8 x u32 per shape)
- `Shape2DWord` enum with all offsets
- `readShape2D`/`writeShape2D` pack/unpack utilities
- `Shape2DFlags` bitfield values
- `Shape2DRecord` interface

### P3: Error Handling and Validation

**Dependencies**: All P0-P2 work items
**Spec Reference**: `.agent_planning/_future/9-renderer.md` section 6

#### Description
Add comprehensive validation and error handling for per-instance shape paths. Validate at pass boundaries (not per-instance) for performance.

#### Acceptance Criteria
- [ ] Validate shape buffer length matches instance count (once per pass)
- [ ] Validate each referenced topology exists in registry (once per group)
- [ ] Validate control points buffer exists for each group (once per group)
- [ ] Clear error messages with instance index and topology info
- [ ] No validation inside hot loops (group loop is acceptable)
- [ ] Failed validation prevents rendering but doesn't crash

#### Technical Notes
Validation pattern:
```typescript
// Pass-level validation
if (shapeBuffer.length !== count * SHAPE2D_WORDS) {
  throw new Error(`Shape buffer length mismatch: expected ${count * SHAPE2D_WORDS}, got ${shapeBuffer.length}`);
}

// Group-level validation
for (const [key, group] of groups) {
  const topology = getTopology(group.topologyId);
  if (!topology) {
    throw new Error(`Topology ${group.topologyId} not found (referenced by ${group.instanceIndices.length} instances)`);
  }
  // ... validate control points buffer exists
}
```

## Dependencies

**BLOCKING DEPENDENCY (RESOLVED):**
- Bead oscilla-animator-v2-583: RenderAssembler v2 — CLOSED ✅
  - Closed: 2026-01-22T04:13:29
  - 22 tests passing, DrawPathInstancesOp production verified

**Parallel Work:**
- Shape topology numeric IDs (oscilla-animator-v2-4h6): RECOMMENDED but not blocking
  - Current: topology IDs are strings
  - Target: numeric array indices for O(1) lookup
  - Impact: If not done, casting will be needed (already present in current code)

## Risks

### MEDIUM: Shape2D Buffer Format Stability
**Risk**: Shape2D packed layout not yet implemented in materializer. Format may change during implementation.

**Mitigation**:
- Define canonical format in documentation FIRST
- Review with user before implementation
- Add format version field to buffer for future evolution

### MEDIUM: Performance with Many Topology Groups
**Risk**: 100 instances across 50 different topologies = 50 DrawPathInstancesOp operations with high state change overhead.

**Mitigation**:
- Profile with realistic scenarios (10-20 topologies typical)
- Document performance characteristics
- Future optimization: sort groups by style to minimize state changes
- Consider warning threshold (>20 unique topologies)

### LOW: Buffer Slicing Memory Overhead
**Risk**: Creating new buffers per group duplicates instance data in memory.

**Mitigation**:
- Acceptable for initial implementation (typical counts are small)
- Future optimization: use views/offsets instead of copying
- Document memory usage characteristics

## Exit Criteria (RESOLVED — all met)

- [x] Shape2D buffer format agreed upon and documented — `RuntimeState.ts` has `SHAPE2D_WORDS`, `Shape2DWord` enum, `readShape2D`/`writeShape2D`
- [x] Shape2D buffers available for testing — `ValueStore.shape2d: Uint32Array` bank exists, pack/unpack utilities ready
- [x] Performance target defined — 100 instances / 5 topologies > 30fps (DOD)
- [x] Topology grouping approach confirmed — group by `(topologyId, pointsFieldSlot)` key
- [x] Renderer v2 complete — oscilla-animator-v2-583 CLOSED, Canvas2DRenderer already loops multiple ops

## Next Steps

1. **Implement**: Follow P0→P1→P2→P3 order in this plan
2. **Test**: Unit tests for grouping/slicing, integration test for full pipeline
3. **Verify**: Run with realistic scenarios (10-20 topologies)

## Notes

- This is the "Swiss Army knife" upgrade - enables arbitrary per-instance shape mixing
- Key insight: Grouping by topology is essential for performance (batch instances with same shape)
- Render order within topology groups is preserved, but groups may interleave differently
- Future work: optimize grouping with spatial sorting, style sorting, etc.
