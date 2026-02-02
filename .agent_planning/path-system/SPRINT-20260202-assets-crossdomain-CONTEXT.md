# Implementation Context: assets-crossdomain
Generated: 2026-02-02
Status: RESEARCH REQUIRED
Plan: SPRINT-20260202-assets-crossdomain-PLAN.md
Source: EVALUATION-20260202.md

## Note on Context Completeness

This sprint is LOW confidence. The implementation context below is preliminary and will need significant revision after research questions are resolved. The primary value of this document is identifying the codebase touchpoints and existing patterns to follow.

## WI-1: Path Asset Format

### Relevant existing code

**`src/shapes/types.ts`** -- PathTopologyDef is the compile-time representation of a path topology. The asset format must serialize the data in PathTopologyDef plus default control point positions.

**`src/shapes/registry.ts`** -- registerDynamicTopology() assigns IDs. Path asset loading would use this to register loaded topologies.

**`src/graph/Patch.ts`** -- The Patch is the user-facing graph model. Path assets would be referenced from Patch (e.g., a block that loads a path asset).

### Serialization format sketch
```typescript
interface PathAsset {
  version: 1;
  name: string;
  topology: {
    verbs: PathVerb[];
    pointsPerVerb: number[];
    totalControlPoints: number;
    closed: boolean;
  };
  defaultControlPoints: number[]; // flat array [x0, y0, x1, y1, ...]
  metadata?: Record<string, unknown>;
}
```

### Storage approach candidates
1. **JSON in localStorage** -- Simplest, limited size (~5MB)
2. **IndexedDB** -- Better for binary data, complex API
3. **File system (via File API)** -- Export/import, not persistent
4. Likely: localStorage for MVP, with export/import to JSON files

---

## WI-2: LayoutAlongPath

### Relevant existing code

**`src/core/domain-registry.ts`** -- Domain system. LayoutAlongPath creates instances in a target domain, positioned by a path from a source domain.

**`src/runtime/ValueExprMaterializer.ts`** -- The materializer evaluates field expressions. Cross-domain field evaluation may require new expression types or a bridge mechanism.

**`src/blocks/shape/procedural-polygon.ts`** -- Pattern for a block that creates instances (controlInstance) and computes their positions. LayoutAlongPath would follow a similar pattern but with positions derived from path evaluation.

### Architecture sketch
```
LayoutAlongPath block:
  Inputs: path (shapeRef), count (int signal)
  Creates: instance domain with `count` instances
  Computes: position[i] = evaluatePathAt(path, i/count)  // by arc length
  Outputs: position (field vec2), tangent (field vec3), t (field float)
```

The key challenge is `evaluatePathAt(path, t)` which needs:
1. Arc length parameterization (from sprint advanced-ops)
2. Bezier evaluation at arbitrary t (new capability)
3. Cross-domain field creation (position field over new domain, computed from path in source domain)

### Bezier evaluation at arbitrary t
Not yet implemented anywhere. Needs:
```typescript
function evaluateBezierCubic(P0: vec2, P1: vec2, P2: vec2, P3: vec2, t: number): vec2 {
  const u = 1 - t;
  return [
    u*u*u*P0[0] + 3*u*u*t*P1[0] + 3*u*t*t*P2[0] + t*t*t*P3[0],
    u*u*u*P0[1] + 3*u*u*t*P1[1] + 3*u*t*t*P2[1] + t*t*t*P3[1],
  ];
}
```

---

## WI-3: Dynamic Topology Queries

### Relevant existing code

**`src/shapes/registry.ts`** -- Topology lookup by ID. Queries would use this to access topology data.

**`src/runtime/ExternalChannel.ts`** -- External input bridge. Mouse position queries ("is cursor inside path?") would flow through external channels.

### Point-in-path algorithm (polygons)
Standard ray casting / winding number algorithm. For each segment, count crossings with a horizontal ray from the query point.

### Nearest-point-on-path (polygons)
For each line segment, project the query point onto the segment and find the closest point. Return the minimum distance across all segments.

### Performance consideration
For 10K queries/frame, brute-force per-segment is O(queries * segments). For 100-segment paths, that's 1M segment tests per frame. May need spatial acceleration for complex paths.

### No existing spatial acceleration
The codebase does not currently have spatial data structures (BVH, spatial hash, etc.). This would be a new capability.
