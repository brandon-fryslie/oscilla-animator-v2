# Implementation Context: bezier-support
Generated: 2026-02-02
Status: PARTIALLY READY
Plan: SPRINT-20260202-bezier-support-PLAN.md
Source: EVALUATION-20260202.md

## WI-1: Precomputed dispatch data

### Files to modify

**`src/shapes/types.ts` -- PathTopologyDef (lines 144-153)**
Add fields after `closed`:
```typescript
export interface PathTopologyDef extends TopologyDef {
  readonly verbs: readonly PathVerb[];
  readonly pointsPerVerb: readonly number[];
  readonly totalControlPoints: number;
  readonly closed: boolean;
  // NEW: precomputed dispatch data
  readonly segmentKind: readonly ('line' | 'cubic' | 'quad')[];
  readonly segmentPointBase: readonly number[];
  readonly hasQuad: boolean;
  readonly hasCubic: boolean;
}
```

**`src/shapes/registry.ts` -- registerDynamicTopology()**
Compute dispatch data from verbs[]:
```
segmentKind: verbs.filter(v => v !== PathVerb.MOVE && v !== PathVerb.CLOSE).map(v =>
  v === PathVerb.LINE ? 'line' : v === PathVerb.CUBIC ? 'cubic' : 'quad')
segmentPointBase: cumulative sum of pointsPerVerb for segment verbs
hasQuad: verbs.includes(PathVerb.QUAD)
hasCubic: verbs.includes(PathVerb.CUBIC)
```

**`src/blocks/shape/procedural-polygon.ts` -- createPolygonTopology() (lines 29-62)**
Add dispatch data to return value. Since this returns `Omit<PathTopologyDef, 'id'>`, add:
```typescript
segmentKind: Array(sides - 1).fill('line') as ('line')[],  // N-1 LINE segments (MOVE doesn't count)
segmentPointBase: Array.from({length: sides - 1}, (_, i) => i + 1),
hasQuad: false,
hasCubic: false,
```
Wait -- actually if `registerDynamicTopology` computes these, the block doesn't need to. Prefer computing in registry.

**`src/blocks/shape/procedural-star.ts`** -- Same pattern as polygon.

### Pattern to follow
PathVerb enum at `src/shapes/types.ts:112-123` defines MOVE=0, LINE=1, CUBIC=2, QUAD=3, CLOSE=4.

---

## WI-2: Bezier tangent computation

### Files to modify

**`src/runtime/ValueExprMaterializer.ts` -- new function after fillBufferTangent (line 741)**

Add `fillBufferTangentBezier()`:
```typescript
function fillBufferTangentBezier(
  out: Float32Array,
  input: Float32Array,
  count: number,
  topology: PathTopologyDef
): void {
  // Per-segment dispatch using topology.segmentKind[] and segmentPointBase[]
  // For each segment:
  //   'line': central difference (same as polygon)
  //   'cubic': B'(0) = 3(P1-P0) at start, B'(1) = 3(P3-P2) at end
  //   'quad': B'(0) = 2(P1-P0) at start, B'(1) = 2(P2-P1) at end
}
```

Input is vec2 (stride 2), output is vec3 (stride 3, z=0). Same convention as existing `fillBufferTangent`.

### Mathematical reference
- Cubic B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
- Cubic B'(t) = 3[(1-t)^2*(P1-P0) + 2(1-t)*t*(P2-P1) + t^2*(P3-P2)]
- Quad B(t) = (1-t)^2*P0 + 2(1-t)*t*P1 + t^2*P2
- Quad B'(t) = 2[(1-t)*(P1-P0) + t*(P2-P1)]

---

## WI-3: Bezier arc length computation

### Files to modify

**`src/runtime/ValueExprMaterializer.ts` -- new function after fillBufferArcLength (line 788)**

Add `fillBufferArcLengthBezier()`:
```typescript
function fillBufferArcLengthBezier(
  out: Float32Array,
  input: Float32Array,
  count: number,
  topology: PathTopologyDef
): void {
  // Cumulative arc length with per-segment method:
  //   'line': Euclidean distance
  //   'cubic': Gauss-Legendre 5-point quadrature of ||B'(t)||
  //   'quad': Gauss-Legendre 5-point quadrature of ||B'(t)||
}
```

### Gauss-Legendre 5-point constants
```typescript
// Nodes (mapped from [-1,1] to [0,1]): t_i = (x_i + 1) / 2
const GL5_NODES = [0.04691, 0.23076, 0.5, 0.76923, 0.95308];
const GL5_WEIGHTS = [0.11846, 0.23931, 0.28444, 0.23931, 0.11846];
// arc_length = (1/2) * sum(w_i * ||B'(t_i)||)  [factor of 1/2 from interval mapping]
```

---

## WI-4: Materializer dispatch

### Files to modify

**`src/runtime/ValueExprMaterializer.ts` lines 525-537**
Replace pathDerivative case:
```typescript
case 'pathDerivative': {
  const input = materializeValueExpr(expr.field, table, instanceId, count, state, program, pool) as Float32Array;
  const topology = getTopology(expr.topologyId) as PathTopologyDef;

  if (expr.op === 'tangent') {
    if (topology.hasCubic || topology.hasQuad) {
      fillBufferTangentBezier(buf, input, count, topology);
    } else {
      fillBufferTangent(buf, input, count);
    }
  } else if (expr.op === 'arcLength') {
    if (topology.hasCubic || topology.hasQuad) {
      fillBufferArcLengthBezier(buf, input, count, topology);
    } else {
      fillBufferArcLength(buf, input, count);
    }
  }
  break;
}
```

Need import: topology lookup from `src/shapes/registry.ts`. Check what function is exported for topology lookup by ID.

---

## WI-5: ProceduralBezier block

### Files to create

**`src/blocks/shape/procedural-bezier.ts`** -- New file.
Follow pattern of `src/blocks/shape/procedural-polygon.ts`.

Key differences:
- Topology includes CUBIC verbs (MOVE, CUBIC, CUBIC, ..., CLOSE or no CLOSE for open)
- Control points include off-curve points (3 per cubic segment)
- User inputs: number of segments, curvature parameter, or explicit control point positions

### Registry update
**`src/blocks/registry.ts`** -- Import and register new block (follow pattern of other shape blocks).

### Open path support
**`src/runtime/ValueExprMaterializer.ts` -- fillBufferTangent (lines 710-741)**
Current code always wraps (closed path assumption). For open paths:
- Point 0: forward difference tangent[0] = point[1] - point[0]
- Point N-1: backward difference tangent[N-1] = point[N-1] - point[N-2]
- Interior: central difference (unchanged)

The `closed` flag comes from `PathTopologyDef.closed`, available via topology lookup.
