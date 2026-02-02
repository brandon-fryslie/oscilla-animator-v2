# Implementation Context: phase1-fix
Generated: 2026-02-02
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260202-phase1-fix-PLAN.md
Source: EVALUATION-20260202.md

## WI-1: Add topologyId to pathDerivative kernel

### Files to modify

**`src/compiler/ir/value-expr.ts` lines 193-199**
Current:
```typescript
| {
    readonly kind: 'kernel';
    readonly type: CanonicalType;
    readonly kernelKind: 'pathDerivative';
    readonly field: ValueExprId;
    readonly op: 'tangent' | 'arcLength';
  }
```
Add `readonly topologyId: TopologyId;` after `op`. The `TopologyId` import already exists at line 22.

**`src/compiler/ir/IRBuilder.ts` line 90**
Current:
```typescript
pathDerivative(input: ValueExprId, op: 'tangent' | 'arcLength', type: CanonicalType): ValueExprId;
```
Change to:
```typescript
pathDerivative(input: ValueExprId, op: 'tangent' | 'arcLength', topologyId: TopologyId, type: CanonicalType): ValueExprId;
```
`TopologyId` import needed from `../../shapes/types`.

**`src/compiler/ir/IRBuilderImpl.ts` lines 208-209**
Current:
```typescript
pathDerivative(input: ValueExprId, op: 'tangent' | 'arcLength', type: CanonicalType): ValueExprId {
  return this.pushExpr({ kind: 'kernel', kernelKind: 'pathDerivative', field: input, op, type });
}
```
Change to accept and pass `topologyId: TopologyId`.

**`src/compiler/ir/__tests__/value-expr-invariants.test.ts` line 170**
Current mock expression:
```typescript
{ kind: 'kernel', type: mockType, kernelKind: 'pathDerivative', field: 0 as any, op: 'tangent' },
```
Add `topologyId: 100` (or any valid number) to the mock.

Also line 254-261: update the `pathDerivative kernel has op field` test to include topologyId.

### Pattern to follow
See `ValueExprShapeRef` at `src/compiler/ir/value-expr.ts:228-239` which already carries `topologyId: TopologyId` -- same pattern.

---

## WI-2: Update PathField block lowering

### Files to modify

**`src/blocks/shape/path-field.ts` lines 118-129**
Current pathDerivative calls:
```typescript
const tangentField = ctx.b.pathDerivative(
  controlPointsFieldId,
  'tangent',
  tanType
);
const arcLengthField = ctx.b.pathDerivative(
  controlPointsFieldId,
  'arcLength',
  arcType
);
```
Need to add topologyId argument between op and type.

**TopologyId resolution approach:**
Option A (preferred): The lowering context `ctx` may provide access to the IR expression table. If so, trace backward from `controlPointsFieldId` to find the `shapeRef` expression that references it via `controlPointField`, then read `shapeRef.topologyId`.

Check `ctx` type definition. The `ctx` object comes from the block lowering system. Look at:
- `src/compiler/passes-v2/pass6-block-lowering.ts` for the lowering context type
- `src/compiler/ir/IRBuilderImpl.ts` for what the builder exposes

Option B (fallback): Add explicit `topologyId` to PathField config. The graph normalization pass or edge resolution would populate it. This requires changes to:
- `src/blocks/shape/path-field.ts` (read from config)
- Graph normalization or lowering orchestration (set config)

Option C (simplest): Add a second input port `shape` of type shape/signal to PathField. Then in lowering, extract topologyId from the shape input's shapeRef expression. This is the most principled approach but changes the block interface.

### Adjacent code pattern
ProceduralPolygon at `src/blocks/shape/procedural-polygon.ts:214-219` shows how topologyId is passed to `ctx.b.shapeRef()`. The inverse operation (reading topologyId from a shapeRef) needs a similar pattern.

---

## WI-3: Polygon/Star verification

### Files to inspect (no changes expected)

**`src/blocks/shape/procedural-polygon.ts` line 132, 214-219**
```typescript
const topologyId = registerDynamicTopology(topology, `polygon-${sides}`);
// ...
const shapeRefSig = ctx.b.shapeRef(topologyId, [], canonicalType(FLOAT), computedPositions);
```
Verify topologyId flows through.

**`src/blocks/shape/procedural-star.ts` line 138, 251**
Same pattern. Verify.

---

## WI-4: Update materializer

### Files to modify

**`src/runtime/ValueExprMaterializer.ts` lines 525-537**
Current:
```typescript
case 'pathDerivative': {
  const input = materializeValueExpr(expr.field, table, instanceId, count, state, program, pool) as Float32Array;
  if (expr.op === 'tangent') {
    fillBufferTangent(buf, input, count);
  } else if (expr.op === 'arcLength') {
    fillBufferArcLength(buf, input, count);
  } else {
    const _exhaustive: never = expr.op;
    throw new Error(`Unknown pathDerivative op: ${_exhaustive}`);
  }
  break;
}
```
Add `expr.topologyId` access. For Phase 1, no dispatch change. Optionally look up topology:
```typescript
case 'pathDerivative': {
  const topologyId = expr.topologyId;
  // Future: const topology = lookupTopology(topologyId) as PathTopologyDef;
  // Future: dispatch based on topology.verbs containing CUBIC/QUAD
  const input = materializeValueExpr(expr.field, table, instanceId, count, state, program, pool) as Float32Array;
  // ... rest unchanged
}
```

The topology registry import: `import { getTopology } from '../../shapes/registry';` (or equivalent lookup function). Check `src/shapes/registry.ts` for the exported lookup API.

---

## WI-5: Integration tests

### Files to modify

**`src/blocks/__tests__/path-field.test.ts`** - Delete all content (lines 1-289) and rewrite.

### Test structure pattern
Follow patterns from `src/compiler/__tests__/compile.test.ts` for building test patches and compiling them. Key steps:

1. Build a `Patch` with ProceduralPolygon + PathField blocks, connected via edges
2. Call `compile(patch)` from `src/compiler/compile.ts`
3. Create `RuntimeState` from compilation result
4. Execute one frame or directly call materializer
5. Read output buffers and verify values

### Key imports needed
```typescript
import { compile } from '@/compiler/compile';
import { createPatch, addBlock, addEdge } from '@/graph/Patch';
// Or whatever the Patch construction API is
```

### Known expected values for unit square (4 vertices)
Points: (0,0), (1,0), (1,1), (0,1) -- but ProceduralPolygon generates points on an ellipse, so use `sides=4, radiusX=1, radiusY=1` which gives:
- Point 0: (0, -1) [top, angle = -pi/2]
- Point 1: (1, 0) [right]
- Point 2: (0, 1) [bottom]
- Point 3: (-1, 0) [left]

Tangent (central difference):
- tangent[0] = (point[1] - point[3]) / 2 = ((1,0) - (-1,0)) / 2 = (1, 0, 0)
- tangent[1] = (point[2] - point[0]) / 2 = ((0,1) - (0,-1)) / 2 = (0, 1, 0)
- etc.

ArcLength (cumulative Euclidean):
- arcLength[0] = 0
- arcLength[1] = sqrt(2) ~ 1.414
- arcLength[2] = 2*sqrt(2) ~ 2.828
- arcLength[3] = 3*sqrt(2) ~ 4.243

### Topology registry note
`registerDynamicTopology` is called during block lowering (compile time). Tests must ensure the topology registry is in a clean state or handle re-registration.
