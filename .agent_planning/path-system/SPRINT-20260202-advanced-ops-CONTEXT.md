# Implementation Context: advanced-ops
Generated: 2026-02-02
Status: RESEARCH REQUIRED
Plan: SPRINT-20260202-advanced-ops-PLAN.md
Source: EVALUATION-20260202.md

## WI-1: Normal vectors

### Files to modify

**`src/compiler/ir/value-expr.ts` line 198**
Extend op union:
```typescript
readonly op: 'tangent' | 'arcLength' | 'normal';
```

**`src/compiler/ir/IRBuilder.ts` line 90** and **`src/compiler/ir/IRBuilderImpl.ts` line 208**
Update op type in pathDerivative signature.

**`src/runtime/ValueExprMaterializer.ts` lines 525-537**
Add `'normal'` case in pathDerivative dispatch. Implementation:
```typescript
// Option A: compute tangent first, then rotate
fillBufferTangent(tempBuf, input, count); // or bezier variant
for (let i = 0; i < count; i++) {
  out[i*3]   = -tempBuf[i*3+1]; // -tangent.y
  out[i*3+1] =  tempBuf[i*3];   // tangent.x
  out[i*3+2] = 0;
}
```
Needs a temporary buffer from the pool for the intermediate tangent.

**`src/blocks/shape/path-field.ts`**
Add optional `normal` output port (same type as tangent: vec3 field).

### Pattern to follow
Existing tangent/arcLength pattern in PathField lowering (lines 118-129).

---

## WI-2: Curvature

### Files to modify

Same files as WI-1 (extend op union, IRBuilder, materializer, PathField).

**Materializer curvature algorithm:**
```typescript
// For parametric curve (x(t), y(t)):
// kappa = |x'*y'' - y'*x''| / (x'^2 + y'^2)^(3/2)
//
// For polygons (finite difference):
// Use tangent[i+1] - tangent[i-1] as second derivative approximation
// kappa[i] ≈ |cross(tangent_diff, tangent)| / |tangent|^3
```

### Mathematical reference
- Cubic B''(t) = 6[(1-t)(P2-2P1+P0) + t(P3-2P2+P1)]
- Quad B''(t) = 2(P2-2P1+P0) (constant)

---

## WI-3: Uniform parameterization

### Files to modify

**Option A: New pathDerivative op 'uniformT'**
Add to materializer. Algorithm:
1. Compute cumulative arc lengths (reuse fillBufferArcLength)
2. Normalize: t[i] = arcLength[i] / arcLength[N-1]

This is the simple version -- just normalizing existing arc length output.

**Option B: Separate block (ReparameterizePath)**
Takes arcLength field input, outputs normalized t field.
More composable but adds a block.

### Key decision
Option A is simpler. Option B follows "one type per behavior" better. Recommend starting with Option A and refactoring to Option B if needed.

---

## WI-4: Offset paths

### Files to create

**`src/blocks/shape/offset-path.ts`** -- New block.
Inputs: path (shapeRef or controlPoints), distance (signal float).
Outputs: offset controlPoints (field vec2).

### Algorithm
```typescript
// Per control point:
// 1. Compute unit normal at point i
// 2. offset[i] = point[i] + distance * unitNormal[i]
```
Needs tangent computation first, then 90-degree rotation, then normalization, then offset.

### Files to modify
**`src/runtime/ValueExprMaterializer.ts`** -- If implemented as a kernel op.
Or: could be a pure field expression composed from existing primitives (tangent -> rotate -> normalize -> scale -> add). The second approach is more composable and doesn't require new kernel ops.
