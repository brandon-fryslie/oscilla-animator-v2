# Definition of Done: path-operators

**Sprint:** Path Operations and Layout
**Confidence:** MEDIUM
**Depends On:** path-foundation

## Acceptance Criteria

### 1. PathField Block

- [ ] Block registered with type 'PathField'
- [ ] Input: path (shape)
- [ ] Output: position (Field<vec2>) - control point positions
- [ ] Output: tangent (Field<vec2>) - direction vectors
- [ ] Output: arcLength (Field<float>) - normalized 0-1
- [ ] Output: index (Field<int>) - point indices
- [ ] Tangents calculated correctly at each point
- [ ] Arc length accumulates correctly

### 2. LayoutAlongPath Block

- [ ] Block registered with type 'LayoutAlongPath'
- [ ] Input: path (shape)
- [ ] Input: count (int)
- [ ] Output: positions (Field<vec2>)
- [ ] Output: tangents (Field<vec2>)
- [ ] Output: t (Field<float>)
- [ ] Positions interpolated along path segments
- [ ] Even distribution by default
- [ ] Creates instance domain for placed items
- [ ] Works with closed paths (wraps around)

### 3. Trim Operator

- [ ] trimStart, trimEnd params on path rendering
- [ ] Values 0-1 control visible portion
- [ ] trimStart=0, trimEnd=1 shows full path
- [ ] trimStart=0, trimEnd=0.5 shows first half
- [ ] Smooth interpolation at segment boundaries
- [ ] Works with both fill and stroke modes
- [ ] Animatable (can modulate trim values)

### 4. ProceduralStar Block

- [ ] Block registered with type 'ProceduralStar'
- [ ] Input: points (int)
- [ ] Input: outerRadius (float)
- [ ] Input: innerRadius (float)
- [ ] Output: shape (PathShapeRef)
- [ ] Output: controlPoints (Field<vec2>)
- [ ] Creates 2*points vertices (alternating outer/inner)
- [ ] Visual: Recognizable star shape

### 5. Tests

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Unit tests for PathField tangent calculation
- [ ] Unit tests for LayoutAlongPath distribution
- [ ] Unit tests for Trim clipping logic

### 6. Demo

- [ ] Demo with LayoutAlongPath placing circles on polygon
- [ ] Demo with animated Trim drawing path
- [ ] Demo with ProceduralStar

## Verification Commands

```bash
npm run typecheck
npm test
npm run dev
```

## Not In Scope

- Bezier curve support (CUBIC, QUAD)
- SVG loading
- Boolean path operations
- Topology-changing operators
- WarpNoise operator (could add in future)
