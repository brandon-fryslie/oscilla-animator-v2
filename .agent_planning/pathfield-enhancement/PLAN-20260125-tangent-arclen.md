# PathField Enhancement Implementation Plan

**Task ID**: oscilla-animator-v2-4h6
**Title**: Enhance PathField with tangent and arc length properties
**Status**: PLANNING
**Created**: 2026-01-25
**Last Updated**: 2026-01-25

---

## Executive Summary

Add `tangent` and `arcLength` output fields to the PathField block, enabling control point visualization with directional and cumulative distance information. Uses a new **Field Expression Derivative** IR kind that materializes these properties from control point buffers at runtime.

**Architectural approach**: Maintains pure kernels by implementing derivatives in the Materializer, not in field kernels.

---

## Problem Statement

### Current State
The PathField block (MVP, commit b22c38e) provides:
- **Inputs**: `controlPoints` (Field<vec2> over DOMAIN_CONTROL)
- **Outputs**:
  - `position` (pass-through of control points)
  - `index` (intrinsic field 0, 1, 2, ...)

### Missing Features
- `tangent`: Tangent direction at each control point
- `arcLength`: Cumulative arc length from start of path (0 to total distance)

### Why This Matters
- Artists need tangent information for control point visualization
- Arc length enables normalized progress metrics along paths
- Essential for animating along paths with uniform speed

### Why It's Non-Trivial

1. **Tangent requires neighbor access**: `tangent[i] = (point[i+1] - point[i-1]) / 2`
   - Current field intrinsics only access element index `i`
   - Current kernels only see buffers and element count

2. **Arc length requires cumulative state**: Must sum distances along path
   - Intrinsics can't maintain running totals
   - Kernels have no ordering guarantee

3. **Topology structure isn't available at runtime**: PathTopologyDef (verb sequences, bezier curves) is compile-time information that doesn't flow to Materializer

---

## Proposed Solution: Field Expression Derivatives

### Architecture Decision

Add a new field expression kind for **path-derived properties**:

```typescript
// In src/compiler/ir/types.ts
export interface FieldExprPathDerivative {
  readonly kind: 'pathDerivative';
  readonly input: FieldExprId;  // The control points field
  readonly operation: 'tangent' | 'arcLength';
  readonly type: CanonicalType;
}
```

This keeps field kernels pure while enabling Materializer to compute derivatives from buffered inputs.

### Why This Approach

| Criterion | This Approach | Kernel w/Topology | Intrinsic | Baked Data |
|-----------|---|---|---|---|
| **Maintains kernel purity** | ✅ | ❌ | ✅ | ✅ |
| **Extensible** | ✅ | ✅ | ❌ | ❌ |
| **Supports dynamic paths** | ✅ | ✅ | ❌ | ❌ |
| **MVP-ready** | ✅ | ⚠️ | ❌ | ✅ |
| **No architectural coupling** | ✅ | ❌ | ✅ | ✅ |
| **Easy to test** | ✅ | ❌ | ✅ | ✅ |

**Selected because**: Minimal coupling, maintains architectural purity, extensible to bezier curves later.

---

## Implementation Plan

### Phase 1: Type System Updates

**File**: `src/compiler/ir/types.ts`

1. Add FieldExprPathDerivative interface:
   ```typescript
   export interface FieldExprPathDerivative {
     readonly kind: 'pathDerivative';
     readonly input: FieldExprId;
     readonly operation: 'tangent' | 'arcLength';
     readonly type: CanonicalType;
   }
   ```

2. Update FieldExpr discriminated union:
   ```typescript
   export type FieldExpr =
     | FieldExprConst
     | FieldExprSource
     | FieldExprIntrinsic
     | FieldExprArray
     | FieldExprLayout
     | FieldExprMap
     | FieldExprZip
     | FieldExprZipSig
     | FieldExprPathDerivative;  // NEW
   ```

3. Update `FieldExprId` union (if maintained separately):
   - Add `FieldExprPathDerivativeId` variant if using branded IDs

**Acceptance Criteria**:
- TypeScript compilation passes
- FieldExpr discriminated union accepts 'pathDerivative' kind
- No other code changes needed yet

**Estimated Effort**: 5-10 minutes

---

### Phase 2: IRBuilder Interface

**File**: `src/compiler/ir/IRBuilder.ts` (interface)

1. Add method declaration:
   ```typescript
   fieldPathDerivative(
     input: FieldExprId,
     operation: 'tangent' | 'arcLength',
     type: CanonicalType
   ): FieldExprId;
   ```

**File**: `src/compiler/ir/IRBuilderImpl.ts` (implementation)

1. Implement fieldPathDerivative:
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

2. Update `inferFieldInstance()` to handle pathDerivative:
   ```typescript
   case 'pathDerivative':
     return this.inferFieldInstance(expr.input);  // Inherit instance from input
   ```

3. Update `inferFieldType()` to handle pathDerivative:
   ```typescript
   case 'pathDerivative':
     return expr.type;  // Already specified in expr
   ```

**Acceptance Criteria**:
- IRBuilder compiles
- Can call `builder.fieldPathDerivative(...)`
- Instance and type inference works correctly
- Tests pass for instance binding

**Estimated Effort**: 10-15 minutes

---

### Phase 3: Materializer Implementation

**File**: `src/runtime/Materializer.ts`

1. Add fillBufferPathDerivative function (NEW):
   ```typescript
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
     // Assume input is Field<vec2> (control points)
     const N = inputType.cardinality === 'sig' ? 1 : input.byteLength / (2 * 4);
     const outArr = out as Float32Array;
     const inArr = input as Float32Array;

     if (N <= 1) {
       // Single point: tangent is zero
       outArr[0] = 0;
       outArr[1] = 0;
       return;
     }

     for (let i = 0; i < N; i++) {
       const prevIdx = i === 0 ? N - 1 : i - 1;
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
     // Assume input is Field<vec2> (control points)
     const N = inputType.cardinality === 'sig' ? 1 : input.byteLength / (2 * 4);
     const outArr = out as Float32Array;
     const inArr = input as Float32Array;

     outArr[0] = 0;
     let totalDistance = 0;

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

2. Update `fillBuffer()` switch statement:
   ```typescript
   case 'pathDerivative': {
     const inputBuffer = materialize(expr.input, ...);
     const inputType = this.inferFieldType(expr.input);
     fillBufferPathDerivative(out, inputBuffer, expr.operation, inputType);
     break;
   }
   ```

**Acceptance Criteria**:
- Materializer compiles
- fillBufferPathDerivative correctly computes tangents from vec2 buffers
- fillBufferPathDerivative correctly computes cumulative arc lengths
- Tests verify:
  - Tangent at polygon vertices aligns with edges
  - Arc length is monotonic
  - Single-point and two-point paths don't crash
  - Closed path wrapping works correctly

**Estimated Effort**: 30-45 minutes (implementation + testing)

---

### Phase 4: PathField Block Enhancement

**File**: `src/blocks/path-operators-blocks.ts`

1. Update PathField block definition:
   ```typescript
   export const PathField = defineBlock({
     name: 'PathField',
     summary: 'Path control point properties',
     inputs: {
       controlPoints: portInput(
         busInputType(fieldShapeType(
           { payload: 'vec2', unit: 'control' },
           DOMAIN_CONTROL
         ))
       ),
     },
     outputs: {
       position: portOutput(
         busOutputType(fieldShapeType(
           { payload: 'vec2', unit: 'control' },
           DOMAIN_CONTROL
         ))
       ),
       index: portOutput(
         busOutputType(fieldShapeType(
           { payload: 'int', unit: '#' },
           DOMAIN_CONTROL
         ))
       ),
       tangent: portOutput(
         busOutputType(fieldShapeType(
           { payload: 'vec2', unit: 'control' },
           DOMAIN_CONTROL
         ))
       ),
       arcLength: portOutput(
         busOutputType(fieldShapeType(
           { payload: 'float', unit: 'absolute' },
           DOMAIN_CONTROL
         ))
       ),
     },
     // ... metadata ...
   });
   ```

2. Update PathField lower function:
   ```typescript
   lower(ctx: LowerCtx, block: BlockInstance): void {
     const input = ctx.getInput(block, 'controlPoints');
     const controlPointsExpr = ctx.inputToBus(input);

     // Position: pass-through
     const positionExpr = controlPointsExpr;
     ctx.setOutput(block, 'position', positionExpr);

     // Index: intrinsic
     const instanceId = ctx.getFieldInstance(controlPointsExpr);
     const indexExpr = ctx.b.fieldIntrinsic(instanceId, 'index', {
       payload: 'int',
       unit: '#',
     });
     ctx.setOutput(block, 'index', indexExpr);

     // Tangent: NEW - path derivative
     const tangentExpr = ctx.b.fieldPathDerivative(
       controlPointsExpr,
       'tangent',
       { payload: 'vec2', unit: 'control' }
     );
     ctx.setOutput(block, 'tangent', tangentExpr);

     // Arc length: NEW - path derivative
     const arcLengthExpr = ctx.b.fieldPathDerivative(
       controlPointsExpr,
       'arcLength',
       { payload: 'float', unit: 'absolute' }
     );
     ctx.setOutput(block, 'arcLength', arcLengthExpr);
   }
   ```

3. Update block documentation:
   ```typescript
   docstring: `
     Exposes properties of path control points.

     **Outputs**:
     - position: Control point position (same as input)
     - index: Control point index (0, 1, 2, ...)
     - tangent: Tangent direction at each point (central difference)
     - arcLength: Cumulative distance from start of path

     **Notes**:
     - Assumes closed polygonal path (tangent at endpoints wraps around)
     - Tangent magnitude depends on point spacing
     - Arc length is cumulative segment distances (not normalized)
     - For bezier curves, tangent is linear approximation
   `,
   ```

**Acceptance Criteria**:
- PathField block compiles
- Can create instances of PathField in UI
- All four outputs are selectable
- Block lowers without errors
- Integration test shows tangent/arcLength values flowing to consumers

**Estimated Effort**: 15-20 minutes

---

### Phase 5: Testing

**File**: `src/blocks/__tests__/path-field.test.ts` (NEW)

1. Create comprehensive test suite:

```typescript
describe('PathField block', () => {
  describe('tangent output', () => {
    it('computes tangent as central difference of neighbors', () => {
      // Given: triangle control points [(0,0), (1,0), (0.5,1)]
      // When: materialize tangent field
      // Then: tangent[0] should point toward vertex 1
      //       tangent[1] should point toward vertex 2
      //       tangent[2] should point toward vertex 0
    });

    it('wraps around for closed path', () => {
      // Given: control points forming closed triangle
      // When: compute tangent at point 0
      // Then: uses point[N-1] and point[1], not out of bounds
    });

    it('handles single-point path', () => {
      // Given: one control point
      // When: materialize tangent
      // Then: returns [0, 0], not NaN or crash
    });

    it('handles two-point path', () => {
      // Given: two control points
      // When: materialize tangent
      // Then: both points have tangent pointing along line
    });
  });

  describe('arcLength output', () => {
    it('starts at 0 and increases monotonically', () => {
      // Given: square control points [(0,0), (1,0), (1,1), (0,1)]
      // When: materialize arcLength
      // Then: arcLength = [0, 1, 2, 3]
    });

    it('computes distance between consecutive points', () => {
      // Given: control points with known distances
      // When: materialize arcLength
      // Then: differences equal computed segment lengths
    });

    it('handles single-point path', () => {
      // Given: one control point
      // When: materialize arcLength
      // Then: returns [0], not NaN
    });

    it('accumulates bezier distances (linear approximation)', () => {
      // Given: points forming curved path
      // When: materialize arcLength
      // Then: uses linear segments, not actual curve length
      // (acceptable for MVP; bezier support is future work)
    });
  });

  describe('integration', () => {
    it('compiles full patch with PathField→tangent→downstream', () => {
      // Patch: ProceduralStar → PathField → [tangent] → downstream
      // Verify: entire compile pipeline succeeds
      // Verify: tangent values are present in runtime state
    });

    it('maintains field instance binding through derivatives', () => {
      // Given: tangent field derived from controlPoints field
      // When: compile
      // Then: both fields have same instance binding
      // Then: materialization uses correct element count
    });
  });
});
```

**Test Execution**:
```bash
npm run test -- src/blocks/__tests__/path-field.test.ts
```

**Acceptance Criteria**:
- All tests pass
- Coverage of tangent and arcLength computation
- Edge cases (single-point, two-point, large polygons) handled
- Integration test verifies full pipeline

**Estimated Effort**: 45-60 minutes

---

## Critical Dependencies & Prerequisites

### Must Be Complete Before Starting
1. ✅ Field expression IR system (src/compiler/ir/types.ts)
2. ✅ IRBuilder interface (src/compiler/ir/IRBuilder.ts)
3. ✅ Materializer framework (src/runtime/Materializer.ts)
4. ✅ PathField block exists (src/blocks/path-operators-blocks.ts)

All prerequisites are already implemented.

### No Blocking Issues
- No architecture changes required
- No new external dependencies
- No spec changes needed for MVP

---

## Risk Analysis

### Low Risk
- ✅ Changes localized to 3 files (types, IRBuilder, Materializer, PathField block)
- ✅ No shared mutable state involved
- ✅ New IR kind is additive (doesn't affect existing field expressions)
- ✅ Materializer changes are isolated to new function

### Potential Issues & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Tangent wrapping bug** | Comprehensive test cases for boundary conditions |
| **Arc length off-by-one** | Tests verify monotonicity and specific distances |
| **Type inference failure** | Test instance propagation through pathDerivative |
| **Materializer crashes on invalid input** | Add validation in fillBufferPathDerivative |
| **Performance regression** | Profile Materializer before/after (may need buffer pooling) |

---

## Success Criteria

### Completion Definition

1. **Type System** ✅
   - FieldExprPathDerivative added to discriminated union
   - TypeScript compilation succeeds

2. **IRBuilder** ✅
   - fieldPathDerivative method exists
   - Instance/type inference works correctly

3. **Materializer** ✅
   - Tangent computation produces correct central-difference vectors
   - Arc length computation is monotonic and correct
   - No crashes on edge cases

4. **PathField Block** ✅
   - Tangent output produces correct values
   - Arc length output produces correct values
   - Block lowers without errors
   - UI can display both outputs

5. **Testing** ✅
   - All test cases pass
   - Coverage includes edge cases
   - Integration test verifies full pipeline

6. **Documentation** ✅
   - Block docstring explains new outputs
   - Arc length is described as cumulative distance
   - Tangent is described as central difference
   - Assumptions documented (closed polygonal path, linear approximation)

### How to Verify Completion

1. **Build**: `npm run build` succeeds with no warnings
2. **Tests**: `npm run test -- path-field` passes all tests
3. **Integration**: Load patch with PathField → show tangent/arcLength flowing to downstream
4. **Visual**: Create polygon in editor, verify tangent vectors point outward, arc length increases

---

## Implementation Phases Summary

| Phase | File(s) | Effort | Status |
|-------|---------|--------|--------|
| 1. Types | ir/types.ts | 10 min | NOT STARTED |
| 2. IRBuilder | IRBuilder.ts, IRBuilderImpl.ts | 15 min | NOT STARTED |
| 3. Materializer | Materializer.ts | 45 min | NOT STARTED |
| 4. PathField | path-operators-blocks.ts | 20 min | NOT STARTED |
| 5. Testing | path-field.test.ts | 60 min | NOT STARTED |
| **TOTAL** | **5 files** | **~150 min** | **READY** |

---

## Next Steps

1. **Get approval** on this implementation plan
2. **Start Phase 1** - Type system updates
3. **Work through phases** in order (each builds on previous)
4. **Execute tests** after Phase 3 (Materializer)
5. **Integration test** after Phase 4 (PathField block)
6. **Final verification** after Phase 5 (Testing)

---

## Open Questions for User

1. **Arc length normalization**: Should `arcLength` output be:
   - Cumulative distance (current plan: `[0, 1, 2, 3]` for unit square)
   - Normalized to [0, 1] (divide by total path length)
   - Either (user selects via block parameter)

2. **Tangent magnitude**: Should tangent be:
   - Raw central difference (current plan: varies with point spacing)
   - Normalized to unit vector
   - Either (user selects)

3. **Open vs closed paths**: Current MVP assumes closed paths. Should we:
   - Document as closed-only (MVP)
   - Add mode parameter (closed/open)
   - Auto-detect from context

4. **Bezier support timeline**: Bezier curves would require Approach A (kernel topology access). Should this be:
   - Future work after MVP
   - In scope for this task
   - Deferred to separate task

---

## Related Work & References

- **Spec**: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md (field system)
- **Similar features**: Array block intrinsics (src/blocks/array-blocks.ts)
- **IR patterns**: FieldExprMap, FieldExprZip (existing field expressions)
- **Exploration report**: .agent_planning/pathfield-enhancement/EXPLORATION-20260125.md

---

**This plan is ready for execution pending user feedback on the open questions above.**
