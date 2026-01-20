# User Response: Path System Scope

**Date:** 2026-01-20
**Status:** APPROVED (scope decisions)

## Questions Asked

### Q1: Path Primary Use Case
**Answer:** Both (layout source AND renderable shape)

### Q2: Topology-Changing Operators
**Answer:** Compile-time only (changing point count = recompile)

### Q3: SVG Support
**Answer:** Procedural only for v1

### Q4: Path Scope
**Answer:** Moderate (polygon + PathField + control point modulation + Trim)

## Additional User Requirements (from conversation)

- Must be able to **stretch paths** (non-uniform scale on control points)
- Must be able to **change joint angles** (move control points individually)
- Both operations preserve topology (point count stays same)

## Sprint Plans Generated

Based on these answers, created:

1. **unified-shape-foundation** (HIGH confidence)
   - ShapeRef, TopologyDef foundation
   - Ellipse/Rect blocks
   - Must complete first

2. **path-foundation** (MEDIUM confidence)
   - PathTopologyDef, PathVerb
   - ProceduralPolygon block
   - Control point fields
   - Path rendering

3. **path-operators** (MEDIUM confidence)
   - PathField block
   - LayoutAlongPath block
   - Trim operator
   - ProceduralStar block

## Files Created

- EVALUATION-path-system-20260120.md
- SPRINT-20260120-path-foundation-PLAN.md
- SPRINT-20260120-path-foundation-DOD.md
- SPRINT-20260120-path-operators-v2-PLAN.md
- SPRINT-20260120-path-operators-v2-DOD.md
