# Sprint: path-operators - Path Operations and Layout

**Generated:** 2026-01-20
**Confidence:** MEDIUM
**Status:** READY AFTER path-foundation
**Depends On:** path-foundation

## Sprint Goal

Add path-specific operations: PathField for per-point properties, instance-along-path layout, and Trim operator. Enable paths as both layout sources AND renderable shapes.

## User Requirements

- Paths as layout source (place instances along path)
- Paths as renderable shape (draw the path itself)
- Trim operator (partial path visibility)
- All topology-stable (no point count changes at runtime)

## Scope

**Deliverables:**
1. PathField block - extracts per-point properties (position, tangent, arcLength)
2. LayoutAlongPath block - places instances along a path
3. Trim operator - render parameter for partial visibility
4. ProceduralStar block - bonus procedural shape

**Not in scope:**
- Bezier curves (future)
- SVG loading (v2)
- Boolean operations (v2)
- Topology-changing operators (Subdivide, Resample)

## Work Items

### P0: PathField Block

**Files:** `src/blocks/path-blocks.ts`

**Purpose:** Extract per-point properties from a path for use in modulation.

**Acceptance Criteria:**
- [ ] PathField block registered
- [ ] Input: path (PathShapeRef)
- [ ] Output: position (Field<vec2>) - control point positions
- [ ] Output: tangent (Field<vec2>) - direction at each point
- [ ] Output: arcLength (Field<float>) - cumulative arc length (0 to 1 normalized)
- [ ] Output: index (Field<int>) - control point index

**Technical Notes:**
```typescript
registerBlock({
  type: 'PathField',
  inputs: {
    path: { type: canonicalType('shape') },
  },
  outputs: {
    position: { type: signalTypeField('vec2', 'control') },
    tangent: { type: signalTypeField('vec2', 'control') },
    arcLength: { type: signalTypeField('float', 'control') },
    index: { type: signalTypeField('int', 'control') },
  },
});
```

### P1: LayoutAlongPath Block

**Files:** `src/blocks/layout-blocks.ts`

**Purpose:** Place instances at positions along a path.

**Acceptance Criteria:**
- [ ] LayoutAlongPath block registered
- [ ] Input: path (PathShapeRef)
- [ ] Input: count (int) - how many instances
- [ ] Input: spacing (float, 0-1) - distribution mode (0=even, 1=arc-length)
- [ ] Output: positions (Field<vec2>) - instance positions along path
- [ ] Output: tangents (Field<vec2>) - tangent direction at each position
- [ ] Output: t (Field<float>) - normalized position (0 to 1)
- [ ] Creates new instance domain for placed instances

**Technical Notes:**
```typescript
// LayoutAlongPath creates instances at sampled positions along path
// Interpolates between control points based on path segments

registerBlock({
  type: 'LayoutAlongPath',
  inputs: {
    path: { type: canonicalType('shape') },
    count: { type: canonicalType('int'), value: 10 },
  },
  outputs: {
    positions: { type: signalTypeField('vec2', 'default') },
    tangents: { type: signalTypeField('vec2', 'default') },
    t: { type: signalTypeField('float', 'default') },
  },
});
```

### P2: Trim Operator

**Files:** `src/blocks/path-blocks.ts`, `src/render/Canvas2DRenderer.ts`

**Purpose:** Render only a portion of the path (like After Effects trim paths).

**Acceptance Criteria:**
- [ ] Trim inputs on path blocks or separate TrimPath block
- [ ] Input: start (float, 0-1) - where to start drawing
- [ ] Input: end (float, 0-1) - where to stop drawing
- [ ] Renderer clips path to trim range
- [ ] Smooth animation of trim values
- [ ] Works with closed and open paths

**Technical Notes:**
- Trim is a **render parameter**, not topology change
- Implemented by calculating which segments to draw and partial segment rendering
- Uses arc-length parameterization for smooth trimming

```typescript
// In PathShapeRef params:
params: {
  trimStart: { type: 'float', default: 0 },
  trimEnd: { type: 'float', default: 1 },
}

// Renderer interprets trim:
function renderTrimmedPath(ctx, topology, controlPoints, trimStart, trimEnd) {
  // Calculate which segments fall within trim range
  // Render partial segments at boundaries
}
```

### P3: ProceduralStar Block

**Files:** `src/blocks/path-blocks.ts`

**Purpose:** Create star shapes procedurally.

**Acceptance Criteria:**
- [ ] ProceduralStar block registered
- [ ] Input: points (int) - number of star points
- [ ] Input: outerRadius (float)
- [ ] Input: innerRadius (float)
- [ ] Output: shape (PathShapeRef)
- [ ] Output: controlPoints (Field<vec2>)
- [ ] Creates alternating outer/inner vertices
- [ ] Topology: 2*points control points

**Technical Notes:**
```typescript
// Star with 5 points has 10 vertices (alternating outer, inner)
function createStarTopology(points: number): PathTopologyDef {
  const verbs = [PathVerb.MOVE];
  const pointsPerVerb = [1];

  for (let i = 1; i < points * 2; i++) {
    verbs.push(PathVerb.LINE);
    pointsPerVerb.push(1);
  }
  verbs.push(PathVerb.CLOSE);
  pointsPerVerb.push(0);

  return {
    id: `star-${points}`,
    verbs,
    pointsPerVerb,
    totalControlPoints: points * 2,
    closed: true,
  };
}
```

## Dependencies

- **HARD:** path-foundation sprint must complete first
- **SOFT:** Instance system for LayoutAlongPath

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Arc-length calculation complexity | MEDIUM | Use approximation (sample and measure) |
| Trim edge cases | LOW | Test with various start/end combinations |
| Tangent calculation at corners | LOW | Use average of adjacent segments |

## Test Plan

- [ ] Unit test: PathField outputs correct tangents
- [ ] Unit test: LayoutAlongPath creates correct instance count
- [ ] Unit test: Trim clips path correctly
- [ ] Integration test: Star shape renders
- [ ] Visual test: Circles placed along pentagon path
- [ ] Visual test: Trim animates smoothly from 0→1
- [ ] Visual test: Star with different inner/outer radius

## Success Criteria

A user can:
1. Create a path (polygon or star)
2. Use LayoutAlongPath to place circles along it
3. See circles distributed around the path perimeter
4. Use PathField to get tangent angles
5. Rotate placed instances to follow path direction
6. Apply Trim to animate path drawing on/off
