# Evaluation: vec2 to vec3 Migration
Timestamp: 2026-01-25T10:50:00
Git Commit: 3234563

## Executive Summary
Overall: Scope analysis 100% complete | Migration 0% complete
Critical issues: 2 (semantic ambiguity, path system constraint)
Tests reliable: Partial (24/89 test files failing, but unrelated to this migration)

## Context

The user wants to standardize position-handling blocks on vec3, eliminating vec2 from instance position workflows. This is driven by:
1. FieldPolarToCartesian outputs vec3 but old Jitter2D expected vec2 (already fixed: JitterVec now uses vec3)
2. Layout blocks (GridLayout, CircleLayout, etc.) output vec3
3. RenderInstances2D expects vec3 positions
4. Explicit constraint: "vec3->vec2 converter is explicitly not allowed"

## Findings

### Category 1: Instance Position Blocks (MUST MIGRATE)

These blocks handle instance positions and conflict with the vec3 ecosystem:

| Block | File | Input Type | Output Type | Status |
|-------|------|------------|-------------|--------|
| PolarToCartesian | geometry-blocks.ts:15-65 | N/A | vec2 | NEEDS MIGRATION |
| CircularLayout | geometry-blocks.ts:71-131 | N/A | vec2 | NEEDS MIGRATION |
| OffsetPosition | geometry-blocks.ts:138-187 | vec2 | vec2 | NEEDS MIGRATION |
| LayoutAlongPath | path-operators-blocks.ts:133-235 | N/A | vec2 (positions, tangents) | NEEDS MIGRATION |

**Evidence**:
- geometry-blocks.ts:34: `pos: { label: 'Position', type: canonicalType('vec2') }`
- geometry-blocks.ts:88: `pos: { label: 'Position', type: signalTypeField('vec2', 'default') }`
- path-operators-blocks.ts:162: `positions: { label: 'Positions', type: signalTypeField('vec2', 'default') }`

**Impact**: These cannot wire to RenderInstances2D which expects vec3 positions.

### Category 2: Path Control Points (SHOULD NOT MIGRATE)

These blocks handle path geometry control points, which are conceptually 2D shape definitions:

| Block | File | Input Type | Output Type | Purpose |
|-------|------|------------|-------------|---------|
| ProceduralPolygon | path-blocks.ts:89-199 | N/A | Field<vec2, control> | Shape vertices |
| ProceduralStar | path-blocks.ts:280-393 | N/A | Field<vec2, control> | Shape vertices |
| PathField | path-operators-blocks.ts:41-101 | Field<vec2, control> | Field<vec2, control> | Extract control points |

**Evidence**:
- path-blocks.ts:126: `controlPoints: { label: 'Control Points', type: signalTypeField('vec2', 'control') }`
- Kernels polygonVertex and starVertex output stride-2 (vec2): FieldKernels.ts:563, 592

**Rationale**: Path control points define local-space 2D shapes. They are transformed to world-space positions by the rendering pipeline, not by position blocks. Converting these to vec3 would:
1. Add unnecessary z=0 component to all vertices
2. Increase memory usage by 50%
3. Conflate "local shape definition" with "world instance position"

### Category 3: Intermediate Operations (MAY NEED MIGRATION)

| Block/Operation | File | Context | Decision |
|-----------------|------|---------|----------|
| FieldCartesianToPolar | field-operations-blocks.ts:381-477 | Extracts XY from vec3 | NO CHANGE (input is vec3, internal xy extraction is fine) |
| Const<vec2> | signal-blocks.ts:117-129 | Generic constant block | KEEP (vec2 is still a valid type for non-position use cases) |

### Category 4: Domain Registry Intrinsics (MUST MIGRATE)

**Critical Finding**: domain-registry.ts:77-78 defines intrinsics using vec2:
```typescript
position: { name: 'position', type: 'vec2' as PayloadType, computation: 'inherent' as const },
bounds: { name: 'bounds', type: 'vec2' as PayloadType, computation: 'derived' as const },
```

This is the source of truth for intrinsic types. If intrinsics output vec2 but blocks expect vec3, there's a type mismatch.

### Category 5: Field Kernels (PARTIAL MIGRATION NEEDED)

Kernels that need vec3 versions:
- `circleLayout` - Already outputs vec3 (stride 3)
- `gridLayout` - Already outputs vec3 (stride 3)
- `lineLayout` - Already outputs vec3 (stride 3)

Kernels that should stay vec2:
- `polygonVertex` - Shape definition (local space)
- `starVertex` - Shape definition (local space)

Kernels with vec2/vec3 dual:
- `jitter2d` stays for vec2 (path control points)
- `fieldJitterVec` for vec3 (already exists)
- `makeVec2` stays for non-position vec2 data
- `makeVec3` for position data (already exists)

## Ambiguities Found

| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| CircularLayout in geometry-blocks.ts | Is this a duplicate of CircleLayout in instance-blocks.ts? | Assumed both needed | geometry-blocks.ts:CircularLayout outputs vec2, instance-blocks.ts:CircleLayout outputs vec3. Need to remove duplicate or migrate. |
| LayoutAlongPath tangents | Should tangents be vec2 or vec3? | N/A - unclear | Tangents are direction vectors. 2D tangents make sense if path is 2D. If migrated to vec3, z would always be 0. |
| bounds intrinsic | Is bounds a position or a dimension? | Named 'bounds' suggests AABB (min/max) | If bounds = {width, height}, vec2 makes sense. If bounds = position + size, might need vec4 or struct. |

## Missing Checks

1. **No schema migration test**: Nothing validates that all position-carrying fields are vec3
2. **No wiring validation for position types**: UI validation allows connecting vec2 output to vec3 input
3. **No lint rule for vec2 in position blocks**: Easy to accidentally add vec2 position outputs

## Recommendations

### Priority 1: Clarify CircularLayout Duplication

geometry-blocks.ts has `CircularLayout` outputting vec2, instance-blocks.ts has `CircleLayout` outputting vec3.
**Decision needed**: Are these intended to be different blocks, or is one deprecated?

If `CircularLayout` is the old version:
- Delete it entirely
- Update any patches referencing it to use `CircleLayout`

### Priority 2: Migrate Position Blocks to vec3

1. **PolarToCartesian** (geometry-blocks.ts:15-65)
   - Change output type from `canonicalType('vec2')` to `canonicalType('vec3')`
   - Update kernel reference to output vec3 (add z=0)

2. **OffsetPosition** (geometry-blocks.ts:138-187)
   - Change input/output from `canonicalType('vec2')` to `canonicalType('vec3')`
   - Update kernel `offsetPosition` to handle vec3

3. **LayoutAlongPath** (path-operators-blocks.ts:133-235)
   - Change positions output from `signalTypeField('vec2', 'default')` to `signalTypeField('vec3', 'default')`
   - Decision needed: Keep tangents as vec2 or migrate to vec3?

### Priority 3: Update Domain Registry Intrinsics

domain-registry.ts:77:
```typescript
// Before
position: { name: 'position', type: 'vec2' as PayloadType, computation: 'inherent' as const },
// After
position: { name: 'position', type: 'vec3' as PayloadType, computation: 'inherent' as const },
```

bounds intrinsic needs clarification before migration.

### Priority 4: Add Kernel Variants

If `polarToCartesian` kernel needs to output vec3:
- Either modify existing kernel in FieldKernels.ts
- Or create `polarToCartesian3` variant

Current `offsetPosition` kernel (if it exists) needs vec3 version.

### Priority 5: DO NOT Migrate Path Control Points

Explicitly keep these as vec2:
- ProceduralPolygon.controlPoints
- ProceduralStar.controlPoints
- PathField inputs/outputs
- polygonVertex kernel
- starVertex kernel

These are local-space shape definitions, not instance positions.

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing patches | Medium | High | Search for saved patches using affected blocks, test each |
| Runtime type mismatch | Low | High | Add defensive stride checks in Materializer |
| Performance regression | Low | Low | vec3 uses 50% more memory than vec2, but position buffers are small |
| Forgotten block | Medium | Medium | Grep for all canonicalType('vec2') and signalTypeField('vec2' after migration |

## Verdict
- [x] CONTINUE - Scope is clear, path forward is defined
- [ ] PAUSE - N/A

## Questions for User

1. **CircularLayout vs CircleLayout**: Should CircularLayout (geometry-blocks.ts, vec2) be deleted since CircleLayout (instance-blocks.ts, vec3) exists?

2. **LayoutAlongPath tangents**: Should tangent vectors remain vec2 (pure direction, no Z) or migrate to vec3 for consistency?

3. **bounds intrinsic**: What does "bounds" represent? If it's width/height dimensions, it should stay vec2. If it's a position, it should migrate.

---

## Summary

```
Blocks to migrate to vec3:      4 (PolarToCartesian, CircularLayout?, OffsetPosition, LayoutAlongPath)
Blocks to keep as vec2:         3 (ProceduralPolygon, ProceduralStar, PathField)
Blocks already vec3:            8 (GridLayout, LinearLayout, CircleLayout, LineLayout, FieldPolarToCartesian, JitterVec, SetZ, RenderInstances2D)
Kernels needing vec3 update:    2-3 (polarToCartesian, offsetPosition, possibly circleLayout signal variant)
Kernels staying vec2:           4 (polygonVertex, starVertex, makeVec2, jitter2d)
Domain intrinsics to review:    2 (position, bounds)
```

---

```
check project-evaluator complete
  Scope: vec2-to-vec3-migration | Completion: 0% (scope analysis only)
  Gaps: 4 blocks, 1 intrinsic, 2-3 kernels need migration
  Workflow: CONTINUE (scope clear, proceed with implementation)
  -> Recommend: Get user answers on 3 questions, then implement in order: intrinsics -> kernels -> blocks
```
