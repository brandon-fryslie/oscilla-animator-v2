# Context: Shapes 2.1 - How-To (Render Materialization Pipeline)

## Target State
The render materialization pipeline should:
1. Resolve shape references to topology bank entries and Arena control point channels
2. Support both Type 1 (rigid, control points in shape bank) and Type 2 (parametric, control points in Arena SoA)
3. Emit StepRender with parameterBaseSlot for GPU-side parametric evaluation
4. Use typed field references (not `as any` casts)

## Current State
`src/compiler/backend/render-materialization-pipeline.ts`:
- Correctly resolves shape references via expression tree walk (lines 189-220)
- Resolves `parameterBaseField` from shapeRef expression (lines 175-177) but uses `(shapeRefExpr as any)` casts
- The `shapeRef` value-expr type (`src/compiler/ir/value-expr.ts:251-260`) declares `controlPointField?: ValueExprId` but the pipeline checks for both `parameterBaseField` and `controlPointField` (transition aliases)
- StepRender includes `parameterBaseSlot` in output (line 698)
- Shape field resolution goes through `resolveShapeOutputs()` (lines 536-580)

## Files Involved
- `src/compiler/backend/render-materialization-pipeline.ts` - Main pipeline (needs `as any` cleanup)
- `src/compiler/ir/value-expr.ts:251-260` - shapeRef expr type (needs `parameterBaseField` formalization)
- `src/compiler/ir/types.ts` - StepRender type (has parameterBaseSlot)

## Suggested Approach
1. Add `parameterBaseField?: ValueExprId` to the `shapeRef` ValueExpr type definition formally
2. Remove `as any` casts in render-materialization-pipeline.ts
3. Remove the `controlPointField` fallback alias (or document the transition)

## Risks
- Minor refactoring risk. No behavioral change expected.
