# EVALUATION: Path Shape System

**Date:** 2026-01-20
**Topic:** Path shape system - how arbitrary paths with control points work in the unified shape model
**Verdict:** PAUSE - Need user input on scope questions

## Current State Summary

The unified shape model design (TopologyDef + ShapeRef + Fields) is sound. However, **paths have unique requirements** that Ellipse/Rect don't have:

### What Paths Need That Primitives Don't

| Aspect | Ellipse/Rect | Path |
|--------|--------------|------|
| Control points | None (implicit from rx/ry) | N variable points as Field<vec2> |
| Topology | Single verb | Multiple verbs (MOVE, LINE, CUBIC, CLOSE) |
| Rendering | Single Canvas call | Iterate verbs, sample curves |
| Continuity | Trivial (params only) | Complex (point count can change) |

### Key Technical Gaps for Paths

1. **Path Topology Format** - No spec for how verbs + point counts are stored
2. **Control Point → Field<vec2> Binding** - DOMAIN_CONTROL exists but unused
3. **Path Interpolation** - No sampling/rasterization in Materializer
4. **Path Block API** - No defined blocks for creating paths

## Critical Unknowns

### 1. Path Verb Representation

How are verbs stored?
```typescript
// Option A: Numeric opcodes
enum PathVerb { MOVE = 0, LINE = 1, CUBIC = 2, QUAD = 3, CLOSE = 4 }

// Option B: Per-segment metadata
interface PathSegment { verb: PathVerb; pointCount: number; }

// Option C: Parallel arrays
{ verbs: PathVerb[], pointsPerVerb: number[] }
```

**Recommendation:** Option C - parallel arrays, matches existing pattern in design doc.

### 2. Control Point Storage

Where do control points live at runtime?
```typescript
// Option A: Field<vec2> over DOMAIN_CONTROL
const controlPoints = createInstance(DOMAIN_CONTROL, topology.totalPoints);
const positions = fieldIntrinsic(controlPoints, 'position', vec2);

// Option B: Direct buffer in ShapeRef
interface PathShapeRef extends ShapeRef {
  controlPointBuffer: Float32Array;
}
```

**Recommendation:** Option A - use existing instance/field system.

### 3. Runtime Interpolation

Where does curve sampling happen?
- **Materializer** - Pre-sample at compile time (deterministic, but rigid)
- **Runtime** - Sample per-frame (flexible, but slower)

**Recommendation:** Materializer for static paths, runtime for animated control points.

### 4. Stretch and Joint Angle Changes (User Requirement)

User explicitly wants:
- Stretch paths non-uniformly (scale x or y independently)
- Change joint angles (move points to change corner shapes)

**These are fully supported by the model:**
- Stretch = multiply Field<vec2> values by scale factors
- Joint angles = directly modulate control point positions
- Neither changes topology (point count stays same)

## Research Questions (Need User Input)

### Q1: Path Primary Use Case

What's the main use for paths in v1?

| Option | Description |
|--------|-------------|
| A. Layout source | Place instances (circles, rects) along path |
| B. Renderable shape | Draw the path itself as a shape |
| C. Both | Full path support |

### Q2: Topology-Changing Operators

Should these work at runtime or compile-time?

| Operator | Runtime Possible? | Compile-Time Easier? |
|----------|-------------------|---------------------|
| Trim (0-1 visibility) | Yes (render param) | N/A |
| Resample (N points) | No (changes count) | Yes |
| Subdivide | No (changes count) | Yes |
| Boolean ops | No (new topology) | Yes |

### Q3: SVG Loading

Need SVG path loading in v1, or procedural-only?

| Option | Scope |
|--------|-------|
| Procedural only | ProceduralPolygon(sides), ProceduralStar, etc. |
| SVG loading | Parse SVG path strings, flatten curves |

### Q4: v1 Scope for Paths

| Scope | Includes |
|-------|----------|
| Minimal | ProceduralPolygon, basic rendering |
| Moderate | + PathField for per-point properties, + Trim |
| Ambitious | + SVG, + all operators |

## Recommended Sprint Structure

Based on evaluation, recommend **3 sprints** (sequential dependency):

### Sprint 1: Shape Fundamentals (HIGH confidence)
- ShapeRef, TopologyDef types
- Built-in TOPOLOGY_ELLIPSE, TOPOLOGY_RECT
- Renderer topology dispatch
- **Must complete before any path work**

### Sprint 2: Path Foundation (MEDIUM confidence)
- Path topology format (verbs + points)
- DOMAIN_CONTROL integration
- ProceduralPolygon block
- Path rendering (iterate verbs, sample curves)
- Control point modulation (stretch, joint angles)

### Sprint 3: Path Operations (LOW confidence → needs research)
- PathField block (per-point properties)
- Instance-along-path layout
- Trim operator
- (Deferred: SVG, boolean ops)

## Blockers

1. **Shape Fundamentals must complete first** - Ellipse/Rect currently broken (output single float)
2. **Need user input on scope** - Q1-Q4 above affect Sprint 2-3 planning

## Next Steps

1. Answer research questions (Q1-Q4)
2. Complete Shape Fundamentals sprint
3. Generate detailed Path Foundation plan based on answers
