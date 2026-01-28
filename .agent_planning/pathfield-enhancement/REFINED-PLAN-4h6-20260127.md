# PathField Enhancement - Refined Implementation Plan (Task 4h6)

**Task ID**: oscilla-animator-v2-4h6  
**Title**: Enhance PathField with tangent and arc length properties  
**Status**: READY FOR IMPLEMENTATION  
**Created**: 2026-01-25  
**Refined**: 2026-01-27  
**Based on Investigation**: Task 2ub (INVESTIGATION-REPORT-20260127.md)

---

## Executive Summary

Add `tangent` and `arcLength` output fields to the PathField block using the **Field Expression Derivatives** architectural approach. This enables control point visualization with directional and cumulative distance information for **polygonal paths** (MVP scope). Bezier curve support is deferred to Phase 2 (future work).

**Key findings from investigation**: Topology information flows through the **shape signal path** (accessible at rendering) but NOT through the **field expression path** (where it would be needed at materialization). The MVP approach **accepts this limitation** and uses linear approximation, with a clear migration path to full topology support via Option A or C in Phase 2.

**Effort**: ~2.5 hours across 5 phases  
**Risk Level**: LOW (localized to 4 files, maintains architectural purity)

---

## Table of Contents

1. [Investigation Findings](#investigation-findings)
2. [Architecture Decision (Validated)](#architecture-decision-validated)
3. [MVP Scope & Limitations](#mvp-scope--limitations)
4. [Implementation Plan](#implementation-plan)
5. [Testing Strategy](#testing-strategy)
6. [Risk Analysis & Mitigations](#risk-analysis--mitigations)
7. [Future Work (Phase 2)](#future-work-phase-2)
8. [Critical Files for Implementation](#critical-files-for-implementation)

---

## Investigation Findings

### Finding 1: Topology Information Flow is Asymmetric

**Investigation ID**: Task 2ub, Section 2 (Topology Information Flow)

**Key Discovery**:
```
Block Definition (Compile-time)
    ↓
ProceduralPolygon.lower() creates PathTopologyDef
    ↓
Block Lowering captures topology in IR
    ↓
[DIVERGENCE POINT]
    ├─ Shape Signal Path (topologyId in SigExprShapeRef)
    │    ↓ ScheduleExecutor
    │    ↓ RenderAssembler → getTopology() ✅ ACCESSIBLE
    │
    └─ Field Expression Path (NO topology reference)
         ↓ Materializer → fillBuffer() ❌ TOPOLOGY LOST HERE
```

**Implication for Task 4h6**:
- **Cannot access topology in Materializer** during field materialization
- **Cannot distinguish bezier control points** (LINE vs CUBIC verbs)
- **Must use linear approximation** for MVP
- **Can still compute tangent/arcLength** for polygonal paths accurately

### Finding 2: Field Kernels Must Remain Pure

**Investigation ID**: Task 2ub, Section 3.4 (Field Kernel Purity)

**Design Principle**:
Field kernels are **stateless pure functions**. They receive:
- Output buffer
- Input buffers
- Kernel name
- Element count
- Type metadata

They do NOT receive:
- Topology information
- Instance metadata
- Domain information
- Registry access

**Implication for Task 4h6**:
- Cannot add topology access to `applyFieldKernel()`
- Must implement derivatives in **Materializer**, not in kernels
- This is the core rationale for **Field Expression Derivatives** approach

### Finding 3: FieldExpr Has No Topology Field

**Investigation ID**: Task 2ub, Section 3.1-3.2 (Field System Constraints)

**Current FieldExpr Union**:
```typescript
export type FieldExpr =
  | FieldExprConst
  | FieldExprIntrinsic
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprArray
  | FieldExprStateRead;
```

**Key Constraint**: None of these variants carry `topologyId` or `PathTopologyDef`.

**InstanceDecl Structure**:
```typescript
export interface InstanceDecl {
  readonly id: string;
  readonly domainType: string;
  readonly count: number | 'dynamic';
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
  readonly identityMode: 'stable' | 'none';
  // NO topologyId field
}
```

**Why This Matters**:
- Instances represent **element collections** (domain-agnostic)
- Topology represents **shape structure** (shape-specific)
- These are intentionally decoupled (reusability principle)
- **MVP approach respects this design** and doesn't force coupling

### Finding 4: MVP (Option B) Is Architecturally Sound

**Investigation ID**: Task 2ub, Section 5.2 (Option B: Field Expression Derivatives - MVP)

**Why Option B Works for Polygonal Paths**:

For a **closed polygonal path** (N vertices connected by straight lines):
```
Control points: [P0, P1, P2, ..., PN-1] (closed: PN wraps to P0)

Tangent[i] = (P[i+1] - P[i-1]) / 2  ← Central difference
             This is EXACT for straight lines!

ArcLength[i] = sum of ||P[j] - P[j-1]|| for j = 0..i  ← Cumulative Euclidean distance
               This is EXACT for straight lines!
```

**Why Option B Fails for Bezier Curves**:

For a **bezier path** with CUBIC verbs:
```
Verb sequence: [MOVE, CUBIC, CUBIC, CLOSE]
Points: [P0, P1_control1, P1_control2, P2, P3_control1, P3_control2, P4, ...]

Tangent at point i requires knowing verb type:
- If LINE verb: tangent = (P[i+1] - P[i-1]) / 2  ← Option B works
- If CUBIC verb: tangent = 3 * (P[i+1] - P[i])  ← Needs topology!

Option B will use linear approximation (WRONG but won't crash).
```

**Decision**: MVP accepts polygonal-only scope. Phase 2 will upgrade via Option A or C.

### Finding 5: Three-Phase Roadmap Confirmed

**Investigation ID**: Task 2ub, Section 7 (Enhancement Roadmap)

```
Phase 1 (THIS TASK): MVP - Polygonal Path Support (Option B)
  Timeline: 2-3 hours
  Risk: LOW
  Capabilities: tangent/arcLength for polygons, foundation for Phase 2

Phase 2 (FUTURE): Bezier Curve Support (Option A or C)
  Timeline: 1-2 weeks
  Risk: MEDIUM-HIGH
  Decision: Thread topology through FieldExpr OR add kernel context parameter
  Prerequisites: Phase 1 complete, topology capture research done

Phase 3 (FUTURE): Advanced Path Features
  Timeline: 2-4 weeks
  Risk: MEDIUM
  Features: Cross-domain sampling, dynamic topology queries, path parameterization
  Prerequisites: Phase 2 complete
```

---

## Architecture Decision (Validated)

### Selected: Option B - Field Expression Derivatives (MVP)

**Status**: ✅ VALIDATED BY INVESTIGATION

**Rationale**:
1. **Respects kernel purity** - derivatives computed in Materializer, not kernels
2. **Maintains architectural intent** - doesn't force FieldExpr/Instance coupling
3. **MVP-ready** - works for current use cases (ProceduralPolygon, ProceduralStar)
4. **Future-proof** - extensible to Option A or C without breaking this phase
5. **Low risk** - changes isolated to 4 files

**vs Option A (Thread Topology)**:
- ❌ Would require: `topologyId` in FieldExpr, topology capture during lowering, Materializer registry access
- ❌ Higher coupling and risk
- ✅ But enables full bezier support (Phase 2 will reassess)

**vs Option C (Kernel Context)**:
- ❌ Would add context parameter to all kernel calls
- ❌ Complicates kernel system architecture
- ✅ But preserves kernel purity better than Option A

### Validation from Investigation

Investigation Section 5.2 confirms:
- ✅ "Minimal architectural impact" (3 files: types, IRBuilder, Materializer)
- ✅ "Maintains kernel purity"
- ✅ "MVP-ready"
- ✅ "No new coupling"
- ✅ "Easy to test and verify"
- ✅ "Extensible for Phase 2"

---

## MVP Scope & Limitations

### What This Task WILL Deliver

**Functionality**:
1. PathField block gains `tangent` output
   - Field<vec2> over DOMAIN_CONTROL
   - Computed as central difference: (P[i+1] - P[i-1]) / 2
   - Works correctly for polygonal paths

2. PathField block gains `arcLength` output
   - Field<float> over DOMAIN_CONTROL
   - Cumulative distance: [0, d1, d1+d2, d1+d2+d3, ...]
   - Works correctly for polygonal paths

3. Full integration with compilation pipeline
   - New IR kind: `FieldExprPathDerivative`
   - Materializer support for both operations
   - Block lowering generates proper IR
   - Tests verify correctness

**Blocks that benefit**:
- ProceduralPolygon (creates polygonal control points)
- ProceduralStar (creates star control points)
- Any future block producing polygonal paths

**User-facing change**:
```
PathField block now has outputs:
├─ position (existing)
├─ index (existing)
├─ tangent (NEW) - for visualization and direction info
└─ arcLength (NEW) - for normalized progress metrics
```

### What This Task Will NOT Deliver

**Deferred to Phase 2**:
1. **Bezier curve tangent** - will use linear approximation (acknowledged limitation)
2. **Accurate bezier arc length** - will use straight-line distances (approximation)
3. **Topology introspection** - cannot query verb types or closed flag at runtime
4. **Curvature computation** - requires second derivative (needs topology)

**Deferred to Phase 3**:
1. **Cross-domain path sampling** - placing instances along arbitrary paths
2. **Dynamic topology queries** - adaptive computation based on path structure
3. **Path parameterization** - uniform parameterization via arc length
4. **Offset paths** - generating parallel paths

### MVP Limitations Document

The PathField block docstring will explicitly state:

```
MVP LIMITATIONS:
- Tangent assumes straight-line segments (polygonal paths)
- Arc length computed as segment distances (not curve length)
- Assumes closed path (tangent at endpoints wraps around)
- Tangent magnitude varies with point spacing
- For bezier curves: outputs linear approximation (Phase 2 will fix)

USE CASES THIS SUPPORTS:
- Tangent visualization on ProceduralPolygon
- Tangent visualization on ProceduralStar
- Arc length for uniform speed along polygons
- Control point debugging via tangent vectors

DOES NOT SUPPORT (yet):
- Accurate tangent on bezier curves
- Curvature computation
- Open (non-closed) paths
- Dynamic topology access
```

---

## Implementation Plan

### Phase 1: Type System Updates

**File**: `src/compiler/ir/types.ts`

**Current State**:
```typescript
export type FieldExpr =
  | FieldExprConst
  | FieldExprIntrinsic
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprArray
  | FieldExprStateRead;
```

**Changes**:

1. Add new interface:
```typescript
export interface FieldExprPathDerivative {
  readonly kind: 'pathDerivative';
  readonly input: FieldExprId;
  readonly operation: 'tangent' | 'arcLength';
  readonly type: CanonicalType;
}
```

2. Update discriminated union:
```typescript
export type FieldExpr =
  | FieldExprConst
  | FieldExprIntrinsic
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprArray
  | FieldExprStateRead
  | FieldExprPathDerivative;  // NEW
```

**Verification**:
- TypeScript compilation succeeds
- No additional changes needed to other FieldExpr-dependent code (yet)
- discriminated union correctly types 'pathDerivative' as kind

**Estimated Effort**: 10 minutes

---

### Phase 2: IRBuilder Interface & Implementation

**File**: `src/compiler/ir/IRBuilder.ts` (interface)

**Add method**:
```typescript
fieldPathDerivative(
  input: FieldExprId,
  operation: 'tangent' | 'arcLength',
  type: CanonicalType
): FieldExprId;
```

**File**: `src/compiler/ir/IRBuilderImpl.ts` (implementation)

**Implementation**:
```typescript
fieldPathDerivative(
  input: FieldExprId,
  operation: 'tangent' | 'arcLength',
  type: CanonicalType
): FieldExprId {
  const id = this.allocFieldId();
  this.fieldExprs.push({
    kind: 'pathDerivative',
    input,
    operation,
    type,
  });
  return id;
}
```

**Update instance inference**:
```typescript
case 'pathDerivative':
  return this.inferFieldInstance(expr.input);  // Inherit from input
```

**Update type inference**:
```typescript
case 'pathDerivative':
  return expr.type;  // Type is already specified
```

**Verification**:
- Can call `builder.fieldPathDerivative(...)`
- Instance inference propagates from input field
- Type is correctly recorded
- Tests verify instance binding works

**Estimated Effort**: 15 minutes

---

### Phase 3: Materializer Implementation

**File**: `src/runtime/Materializer.ts`

**Add helper functions** (after existing materialize function):

```typescript
/**
 * Compute path derivatives: tangent direction and cumulative arc length
 * 
 * Assumes input is a vec2 field (control points).
 * For tangent: uses central difference (exact for straight lines, approximation for curves)
 * For arcLength: computes cumulative segment distances
 */
function fillBufferPathDerivative(
  out: ArrayBufferView,
  input: ArrayBufferView,
  operation: 'tangent' | 'arcLength',
  inputType: CanonicalType
): void {
  if (operation === 'tangent') {
    fillBufferTangent(out, input, inputType);
  } else if (operation === 'arcLength') {
    fillBufferArcLength(out, input, inputType);
  }
}

function fillBufferTangent(
  out: ArrayBufferView,
  input: ArrayBufferView,
  inputType: CanonicalType
): void {
  // Input: vec2 field (control points)
  // Output: vec2 field (tangent vectors)
  
  const N = inputType.cardinality === 'sig'
    ? 1
    : input.byteLength / (2 * 4);  // vec2 = 2 floats × 4 bytes
  
  const outArr = out as Float32Array;
  const inArr = input as Float32Array;

  if (N <= 1) {
    // Single point: no tangent
    if (N === 1) {
      outArr[0] = 0;
      outArr[1] = 0;
    }
    return;
  }

  // Central difference for each point
  // For closed path: [P0, P1, ..., PN-1] where PN = P0 (wraps)
  for (let i = 0; i < N; i++) {
    const prevIdx = (i - 1 + N) % N;  // Wrap around for closed path
    const nextIdx = (i + 1) % N;

    const prevX = inArr[prevIdx * 2];
    const prevY = inArr[prevIdx * 2 + 1];
    const nextX = inArr[nextIdx * 2];
    const nextY = inArr[nextIdx * 2 + 1];

    // Central difference: (next - prev) / 2
    outArr[i * 2] = (nextX - prevX) / 2;
    outArr[i * 2 + 1] = (nextY - prevY) / 2;
  }
}

function fillBufferArcLength(
  out: ArrayBufferView,
  input: ArrayBufferView,
  inputType: CanonicalType
): void {
  // Input: vec2 field (control points)
  // Output: float field (cumulative arc length)
  
  const N = inputType.cardinality === 'sig'
    ? 1
    : input.byteLength / (2 * 4);

  const outArr = out as Float32Array;
  const inArr = input as Float32Array;

  outArr[0] = 0;

  if (N <= 1) {
    return;
  }

  let totalDistance = 0;

  // Sum segment distances from point 0 to point i
  for (let i = 1; i < N; i++) {
    const prevX = inArr[(i - 1) * 2];
    const prevY = inArr[(i - 1) * 2 + 1];
    const currX = inArr[i * 2];
    const currY = inArr[i * 2 + 1];

    const dx = currX - prevX;
    const dy = currY - prevY;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    totalDistance += segmentLength;

    outArr[i] = totalDistance;
  }
}
```

**Update materialize function** (in the switch statement handling FieldExpr kinds):

```typescript
case 'pathDerivative': {
  const inputBuffer = materialize(expr.input, instanceId, fields, signals, instances, state, pool);
  const inputType = this.inferFieldType(expr.input);
  fillBufferPathDerivative(out, inputBuffer, expr.operation, inputType);
  break;
}
```

**Verification**:
- Materializer compiles with new case
- fillBufferTangent produces correct central-difference vectors
- fillBufferArcLength is monotonic and computes correct distances
- No crashes on edge cases (1 point, 2 points, large polygons)
- Wrapping for closed paths works correctly

**Test vectors** (to verify by hand):
```
Triangle: [(0,0), (1,0), (0.5,1)]
Tangent[0] = ((1,0) - (0.5,1)) / 2 = (0.25, -0.5)
Tangent[1] = ((0.5,1) - (0,0)) / 2 = (0.25, 0.5)
Tangent[2] = ((0,0) - (1,0)) / 2 = (-0.5, 0)

Arc length:
|P1 - P0| = sqrt(1) = 1.0
|P2 - P1| = sqrt(0.25 + 1) = sqrt(1.25) ≈ 1.118
ArcLength = [0, 1.0, 2.118]
```

**Estimated Effort**: 40 minutes (implementation + verification)

---

### Phase 4: PathField Block Enhancement

**File**: `src/blocks/path-operators-blocks.ts`

**Current state** (lines 14-103):
```typescript
registerBlock({
  type: 'PathField',
  // ...
  outputs: {
    position: { ... },
    index: { ... },
  },
  lower: ({ ctx, inputsById }) => {
    // Currently only creates position and index
  }
});
```

**Changes**:

1. Add `tangent` and `arcLength` to outputs:
```typescript
outputs: {
  position: { label: 'Position', type: signalTypeField(VEC2, 'control') },
  index: { label: 'Index', type: signalTypeField(INT, 'control') },
  tangent: { label: 'Tangent', type: signalTypeField(VEC2, 'control') },  // NEW
  arcLength: { label: 'Arc Length', type: signalTypeField(FLOAT, 'absolute') },  // NEW
},
```

2. Update lower function to create derivatives:
```typescript
lower: ({ ctx, inputsById }) => {
  const controlPointsInput = inputsById.controlPoints;
  if (!controlPointsInput || controlPointsInput.k !== 'field') {
    throw new Error('PathField requires a controlPoints field input');
  }

  const controlPointsFieldId = controlPointsInput.id as FieldExprId;

  // Get instance from control points field
  const instance = ctx.inferredInstance ?? ctx.instance;
  if (!instance) {
    throw new Error('PathField requires instance context from control points field');
  }

  // Position: pass-through
  const positionFieldId = controlPointsFieldId;

  // Index: intrinsic
  const indexField = ctx.b.fieldIntrinsic(
    instance,
    'index',
    signalTypeField(INT, 'control')
  );

  // Tangent: NEW - path derivative
  const tangentField = ctx.b.fieldPathDerivative(
    controlPointsFieldId,
    'tangent',
    signalTypeField(VEC2, 'control')
  );

  // Arc length: NEW - path derivative
  const arcLengthField = ctx.b.fieldPathDerivative(
    controlPointsFieldId,
    'arcLength',
    signalTypeField(FLOAT, 'absolute')
  );

  // Allocate output slots
  const posSlot = ctx.b.allocSlot();
  const idxSlot = ctx.b.allocSlot();
  const tanSlot = ctx.b.allocSlot();
  const arcSlot = ctx.b.allocSlot();

  const posType = ctx.outTypes[0];
  const idxType = ctx.outTypes[1];
  const tanType = ctx.outTypes[2];
  const arcType = ctx.outTypes[3];

  return {
    outputsById: {
      position: {
        k: 'field',
        id: positionFieldId,
        slot: posSlot,
        type: posType,
        stride: strideOf(posType.payload),
      },
      index: {
        k: 'field',
        id: indexField,
        slot: idxSlot,
        type: idxType,
        stride: strideOf(idxType.payload),
      },
      tangent: {
        k: 'field',
        id: tangentField,
        slot: tanSlot,
        type: tanType,
        stride: strideOf(tanType.payload),
      },
      arcLength: {
        k: 'field',
        id: arcLengthField,
        slot: arcSlot,
        type: arcType,
        stride: strideOf(arcType.payload),
      },
    },
  };
}
```

3. Update block documentation:
```typescript
description: 'Extract per-point properties from path control points (MVP: polygonal paths)',
// ... and in comments:
/**
 * PathField - Extract per-point properties from path control points
 *
 * INPUTS:
 * - controlPoints: Field<vec2> over DOMAIN_CONTROL - path vertices
 *
 * OUTPUTS:
 * - position: Field<vec2> - control point positions (pass-through)
 * - index: Field<int> - control point index (0, 1, 2, ...)
 * - tangent: Field<vec2> - tangent direction at each point (MVP: linear approximation)
 * - arcLength: Field<float> - cumulative distance from start
 *
 * MVP LIMITATIONS:
 * - Tangent assumes straight-line segments (works correctly for polygonal paths)
 * - Arc length computed as segment distances (not curve length)
 * - Assumes closed path (tangent at endpoints wraps around)
 * - For bezier curves: uses linear approximation (Phase 2 will add accurate support)
 *
 * Example usage:
 * ```
 * polygon = ProceduralPolygon(sides=5)
 * fields = PathField(controlPoints=polygon.controlPoints)
 * // fields.tangent contains tangent vectors for visualization
 * // fields.arcLength contains cumulative path distance
 * ```
 */
```

**Verification**:
- Block compiles without errors
- Can instantiate PathField in UI
- All four outputs are selectable
- Block lowers correctly
- IR is generated with proper FieldExprPathDerivative nodes

**Estimated Effort**: 20 minutes

---

### Phase 5: Testing

**File**: `src/blocks/__tests__/path-field.test.ts` (NEW)

**Test suite structure**:

```typescript
describe('PathField block', () => {
  describe('tangent output', () => {
    it('computes tangent as central difference of neighbors', () => {
      // Given: triangle [(0,0), (1,0), (0.5,1)]
      // When: materialize tangent field
      // Then: verify central difference formula
    });

    it('handles wrapping for closed path', () => {
      // Given: control points forming closed triangle
      // When: compute tangent at point 0
      // Then: uses point[N-1] and point[1], wraps correctly
    });

    it('handles single-point path without crash', () => {
      // Given: one control point
      // When: materialize tangent
      // Then: returns [0, 0], not NaN
    });

    it('handles two-point path correctly', () => {
      // Given: two control points [(0,0), (1,0)]
      // When: materialize tangent
      // Then: both points have tangent pointing along line
    });

    it('produces correct tangent for regular polygon', () => {
      // Given: pentagon vertices (computed via ProceduralPolygon)
      // When: materialize tangent
      // Then: tangent aligns with edge directions
    });

    it('indicates linear approximation for bezier (MVP limitation)', () => {
      // Given: cubic bezier control points
      // When: materialize tangent
      // Then: uses linear approximation (acceptable for MVP)
      // NOTE: Phase 2 will add accurate bezier tangent
    });
  });

  describe('arcLength output', () => {
    it('starts at 0 and increases monotonically', () => {
      // Given: square [(0,0), (1,0), (1,1), (0,1)]
      // When: materialize arcLength
      // Then: arcLength = [0, 1, 2, 3]
    });

    it('computes distance between consecutive points', () => {
      // Given: right triangle with known distances
      // When: materialize arcLength
      // Then: differences match segment lengths
    });

    it('handles single-point path without crash', () => {
      // Given: one control point
      // When: materialize arcLength
      // Then: returns [0], not NaN or error
    });

    it('computes cumulative distance correctly', () => {
      // Given: line segment [(0,0), (3,4)] - distance 5
      // Then: arcLength[1] = 5.0
    });

    it('uses linear approximation for curves (MVP limitation)', () => {
      // Given: points on a circle
      // When: materialize arcLength
      // Then: uses straight-line distances
      // NOTE: Phase 2 will add numerical integration for curves
    });
  });

  describe('instance binding', () => {
    it('maintains field instance binding through derivatives', () => {
      // Given: tangent field derived from controlPoints
      // When: compile
      // Then: both fields bound to same instance
      // Then: materialize uses correct element count
    });

    it('propagates instance from control points to all outputs', () => {
      // Given: controlPoints field bound to instance I
      // When: lower PathField
      // Then: position, tangent, arcLength all bound to I
    });
  });

  describe('integration', () => {
    it('compiles full patch with PathField → tangent → downstream', () => {
      // Patch: ProceduralPolygon → PathField → [tangent] → downstream
      // Verify: entire compile succeeds
      // Verify: tangent values in runtime state
    });

    it('works with ProceduralStar control points', () => {
      // Patch: ProceduralStar → PathField
      // Verify: tangent and arcLength computed correctly
    });

    it('produces correct derivatives in runtime state', () => {
      // Patch: PathField with known control points
      // When: executeFrame
      // Then: tangent and arcLength buffers populated correctly
      // Then: values match expected computation
    });
  });
});
```

**Test execution**:
```bash
npm run test -- src/blocks/__tests__/path-field.test.ts
```

**Acceptance Criteria**:
- All tests pass
- Edge cases handled (1-point, 2-point, large polygons)
- Integration test verifies full pipeline
- Docstring mentions MVP limitations
- Test includes note about Phase 2 upgrade

**Estimated Effort**: 50 minutes (implementation + validation)

---

## Testing Strategy

### Unit Tests (Phase 3 & 5)

**fillBufferTangent**:
- ✅ Closed polygon with N points
- ✅ Single point → [0, 0]
- ✅ Two points → tangent along line
- ✅ Wrapping at boundaries (N-1 → 0 → 1)
- ✅ Regular shapes (triangle, square, pentagon)
- ✅ Hand-computed test vectors match implementation

**fillBufferArcLength**:
- ✅ Starts with 0
- ✅ Monotonically increases
- ✅ Differences match segment lengths
- ✅ Single point → [0]
- ✅ Known distances verified (e.g., 3-4-5 triangle)

### Integration Tests (Phase 4 & 5)

**PathField block**:
- ✅ Block registers correctly
- ✅ Can create instances in UI
- ✅ All four outputs selectable
- ✅ Outputs have correct types (vec2, int, vec2, float)
- ✅ Block lowers without errors

**Full pipeline**:
- ✅ Compile: ProceduralPolygon → PathField → downstream
- ✅ Runtime: executeFrame populates tangent/arcLength buffers
- ✅ Values match expected computation
- ✅ Instance binding preserved through derivation

### Verification Checklist

After all phases complete:
- [ ] `npm run build` succeeds with no warnings
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all tests)
- [ ] `npm run test -- path-field` passes (PathField tests)
- [ ] Load patch with PathField in editor
- [ ] Verify tangent vectors visualize correctly
- [ ] Verify arcLength increases monotonically
- [ ] No TypeScript errors in IDE

---

## Risk Analysis & Mitigations

### Low-Risk Aspects

| Aspect | Why Low-Risk | Mitigation |
|--------|------------|-----------|
| **New IR kind** | Additive only, doesn't affect existing FieldExpr variants | Test that non-pathDerivative expressions still work |
| **Materializer changes** | Isolated in new switch case, no shared state | Test materialize function with existing FieldExpr kinds |
| **Kernel purity** | Not affected, no kernel changes | Verify applyFieldKernel unchanged |
| **Block lowering** | Following established pattern (like array-blocks) | Compare against existing block lowering code |
| **Type system** | Straightforward union extension | TypeScript compiler validates completeness |

### Potential Issues & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Tangent wrapping bug** | Medium | Comprehensive boundary tests, hand-verify for N=2,3,4 |
| **Arc length off-by-one** | Low | Tests verify monotonicity and specific distances |
| **Instance inference failure** | Low | Test that tangent field inherits instance from input |
| **Type inference failure** | Low | Verify CanonicalType propagates correctly |
| **Materializer crashes on invalid input** | Low | Test with N=1, N=2, empty buffers |
| **Performance regression** | Low | Materializer now does slightly more work, but still O(N) |

### Investigation-Based Risk Reduction

**Investigation found and confirmed**:
1. ✅ Kernel purity can be maintained (no kernel changes needed)
2. ✅ FieldExpr doesn't need topology (uses linear approximation)
3. ✅ MVP approach respects architectural intent
4. ✅ Clear migration path to Option A/C for Phase 2
5. ✅ No blocking architectural issues

**Risks eliminated by investigation**:
- ❌ ~~Confusion about topology availability~~ → Investigation clarified flow
- ❌ ~~Need to couple FieldExpr to shapes~~ → MVP avoids this
- ❌ ~~Bezier support required for MVP~~ → Investigation confirmed MVP scope

---

## Future Work (Phase 2)

### Phase 2 Prerequisites

**Before implementing Phase 2, must complete**:
1. Phase 1 implementation and testing ✅ (this task)
2. User feedback on MVP limitations (post-Phase 1)
3. Research on topology capture feasibility (2-3 hours focused work)

### Phase 2 Research Tasks

**Topology Capture Feasibility**:
- Can block lowering trace field expression back to source block?
- Example: PathField receives controlPoints field → trace to ProceduralPolygon → extract topologyId
- If YES: Option A (thread topology) is viable
- If NO: Option C (kernel context) is required

**Decision Matrix for Phase 2**:

| Decision | Option A | Option C |
|----------|----------|----------|
| **Approach** | Thread topologyId through FieldExpr | Add optional context parameter to kernels |
| **Impact** | Higher coupling, more invasive | Less invasive, preserves kernel purity |
| **Timeline** | 1-2 weeks | 1 week |
| **Risk** | High | Medium |
| **Future-proof** | ✅ Fully | ✅ Extensible |

**Phase 2 will be a separate task** with its own planning and investigation.

---

## Critical Files for Implementation

These are the files most essential for implementing Task 4h6. They are listed in dependency order (bottom-up).

### 1. `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/types.ts`
**Reason**: Add FieldExprPathDerivative interface and update FieldExpr union. This is foundational for all subsequent phases.  
**Changes**: ~10 lines added to existing file.  
**What to watch**: Ensure FieldExpr discriminated union includes new variant.

### 2. `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/IRBuilderImpl.ts`
**Reason**: Implement fieldPathDerivative() method. Required for Materializer to create path derivatives.  
**Changes**: ~15 lines for method implementation + instance/type inference cases.  
**What to watch**: Instance inference must propagate from input field correctly.

### 3. `/Users/bmf/code/oscilla-animator-v2/src/runtime/Materializer.ts`
**Reason**: Implement fillBufferPathDerivative, fillBufferTangent, fillBufferArcLength functions. This is the core computation logic.  
**Changes**: ~80 lines for three new functions + one switch case in materialize().  
**What to watch**: Wrapping logic for closed paths, handling edge cases (N=1, N=2), Float32Array buffer handling.

### 4. `/Users/bmf/code/oscilla-animator-v2/src/blocks/path-operators-blocks.ts`
**Reason**: Update PathField block to add tangent/arcLength outputs and call fieldPathDerivative in lower function.  
**Changes**: ~30 lines to add outputs and ~20 lines in lower() implementation.  
**What to watch**: Instance binding, output slot allocation, type correctness for vec2/float fields.

### 5. `/Users/bmf/code/oscilla-animator-v2/src/blocks/__tests__/path-field.test.ts`
**Reason**: Comprehensive test suite for tangent and arcLength computation, instance binding, integration.  
**Changes**: ~150 lines of test cases covering all scenarios.  
**What to watch**: Test vectors should be hand-verified, edge cases well-covered, integration test verifies full pipeline.

---

## Implementation Checklist

Use this as a step-by-step guide:

### Phase 1: Types (10 min)
- [ ] Open `src/compiler/ir/types.ts`
- [ ] Find FieldExpr union (line 180)
- [ ] Add FieldExprPathDerivative interface before union
- [ ] Add to union: `| FieldExprPathDerivative;`
- [ ] Verify TypeScript compiles

### Phase 2: IRBuilder (15 min)
- [ ] Open `src/compiler/ir/IRBuilder.ts`
- [ ] Add method signature: fieldPathDerivative(...)
- [ ] Open `src/compiler/ir/IRBuilderImpl.ts`
- [ ] Implement fieldPathDerivative method
- [ ] Add 'pathDerivative' case to inferFieldInstance
- [ ] Add 'pathDerivative' case to inferFieldType
- [ ] Verify TypeScript compiles

### Phase 3: Materializer (40 min)
- [ ] Open `src/runtime/Materializer.ts`
- [ ] Add fillBufferPathDerivative function
- [ ] Add fillBufferTangent with central difference logic
- [ ] Add fillBufferArcLength with cumulative distance logic
- [ ] Add 'pathDerivative' case to materialize switch
- [ ] Hand-verify test vectors (triangle example)
- [ ] Verify TypeScript compiles

### Phase 4: PathField Block (20 min)
- [ ] Open `src/blocks/path-operators-blocks.ts`
- [ ] Add `tangent` to outputs
- [ ] Add `arcLength` to outputs
- [ ] Update docstring with MVP limitations
- [ ] Update lower function to create tangent field
- [ ] Update lower function to create arcLength field
- [ ] Allocate output slots correctly
- [ ] Verify TypeScript compiles

### Phase 5: Testing (50 min)
- [ ] Create `src/blocks/__tests__/path-field.test.ts`
- [ ] Write tangent computation tests (with hand-verified values)
- [ ] Write arcLength computation tests (with known distances)
- [ ] Write edge case tests (1-point, 2-point paths)
- [ ] Write instance binding tests
- [ ] Write integration tests (full pipeline)
- [ ] Run `npm run test -- path-field`
- [ ] All tests pass
- [ ] Run `npm run build` - succeeds with no warnings

---

## Success Criteria

### Completion Definition

✅ **Type System** - FieldExprPathDerivative added to discriminated union  
✅ **IRBuilder** - fieldPathDerivative method exists with correct instance/type inference  
✅ **Materializer** - Tangent and arcLength computed correctly, edge cases handled  
✅ **PathField Block** - All four outputs present, block lowers without errors  
✅ **Testing** - All tests pass, edge cases covered, integration verified  
✅ **Documentation** - Block docstring explains outputs and MVP limitations clearly  

### How to Verify Completion

1. **Build**: `npm run build` succeeds with no warnings ✅
2. **Tests**: `npm run test -- path-field` - all pass ✅
3. **Type check**: `npm run typecheck` - no errors ✅
4. **Integration**: Load patch with PathField → show tangent/arcLength flowing ✅
5. **Visual**: Create polygon in editor, verify:
   - Tangent vectors point outward ✅
   - Arc length increases monotonically ✅
   - No crashes or NaN values ✅

---

## Known Differences from Original Plan

### Investigation Validated Original Plan

The original PLAN-20260125-tangent-arclen.md was solid. This refined plan:

1. **Adds investigation-based confidence** - Sections 2-4 explain why Option B works
2. **Clarifies MVP scope** - Explicit about polygonal paths, linear approximation
3. **Documents limitations clearly** - Phase 2 roadmap and research tasks defined
4. **References investigation findings** - Each major section cites specific investigation sections
5. **Consolidates file references** - Critical files list with specific line numbers

### No Major Changes to Implementation

- ✅ Same 5 phases as original plan
- ✅ Same estimated effort (2.5 hours)
- ✅ Same files modified (4 files + tests)
- ✅ Same risk level (LOW)
- ✅ Same test vectors and logic

### Additions for Clarity

- Investigation findings integrated (Sections 1-4)
- Architecture decision validated (Section 2)
- MVP scope explicitly documented (Section 3)
- Refined test strategy (Section 7)
- Phase 2 research tasks outlined (Section 8)

---

## References

### Investigation Report
- **Document**: `.agent_planning/pathfield-investigation/INVESTIGATION-REPORT-20260127.md`
- **Key sections**: 2 (Topology Info Flow), 3 (Field System Constraints), 5 (Architectural Options), 7 (Roadmap)

### Original Exploration & Plan
- **Exploration**: `.agent_planning/pathfield-enhancement/EXPLORATION-20260125.md`
- **Original Plan**: `.agent_planning/pathfield-enhancement/PLAN-20260125-tangent-arclen.md` (this refined version supersedes)

### Specification
- **Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` (field system)
- **Invariants**: `.claude/rules/spec/invariants.md`
- **Compilation**: `.claude/rules/compiler/compilation.md`
- **Intrinsics**: `.claude/rules/compiler/intrinsics.md`

### Codebase References

**Current PathField block**:
- File: `src/blocks/path-operators-blocks.ts` (lines 14-103)
- Comments: Future enhancements documented at lines 29-31

**Field System Architecture**:
- Types: `src/compiler/ir/types.ts` (FieldExpr union: line 180)
- Builder: `src/compiler/ir/IRBuilderImpl.ts`
- Materializer: `src/runtime/Materializer.ts`

**Similar Implementations**:
- Array blocks (intrinsics): `src/blocks/array-blocks.ts`
- Layout blocks (fieldZipSig): `src/blocks/layout-blocks.ts`

---

## Document Metadata

**Version**: 1.1 (Refined from original plan)  
**Status**: READY FOR IMPLEMENTATION  
**Task ID**: oscilla-animator-v2-4h6  
**Investigation Basis**: Task 2ub (INVESTIGATION-REPORT-20260127.md)  
**Total Estimated Effort**: 2.5 hours across 5 phases  
**Risk Level**: LOW  
**Confidence**: HIGH (investigation-validated approach)

---

**END OF REFINED PLAN**

This document is the definitive implementation guide for Task 4h6. It incorporates investigation findings, validates the Field Expression Derivatives approach, and provides clear step-by-step instructions for implementation.
