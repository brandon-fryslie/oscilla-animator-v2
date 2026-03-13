# Shapes 2.1: Parametric Curve How-To - TO-REVIEW Items

Note: The "Shapes 2.1 How-To" file at the specified path contained the render materialization pipeline code (`src/compiler/backend/render-materialization-pipeline.ts`), not a separate how-to document. The content is the compiler pass that handles shape resolution for rendering. Analysis is based on the code content found.

## Item 1: Render Materialization Pipeline Shape Resolution
**Spec context**: The render materialization pipeline resolves shape references and parametric base fields for Type 2 shapes.
**Implementation**: `src/compiler/backend/render-materialization-pipeline.ts:161-187` resolves shapeRef expressions by walking the expression tree to find `kind: 'shapeRef'` nodes. Lines 175-177 check for `parameterBaseField` or `controlPointField` on the shapeRef expression to accommodate Type 2 parametric shapes. Lines 536-580 `resolveShapeOutputs()` materializes shape slots and parametric base slots.
**Gap**: The pipeline is well-structured but the `parameterBaseField` access at line 176 uses `(shapeRefExpr as any)` casts, indicating the value-expr type definition may not formally declare this field. The `shapeRef` ValueExpr type in `src/compiler/ir/value-expr.ts:251-260` declares `controlPointField?: ValueExprId` but not `parameterBaseField`.
**Classification**: TO-REVIEW - Functional but uses `as any` casts. The `controlPointField` on the value-expr type is the canonical field; `parameterBaseField` appears to be a transition alias. Should be cleaned up.

## Item 2: ParameterBaseSlot in StepRender
**Spec context**: Type 2 shapes need to pass parametric control point data to the GPU for per-instance curve evaluation.
**Implementation**: `src/compiler/backend/render-materialization-pipeline.ts:688-698` builds StepRender with `parameterBaseSlot` from shape output resolution. The StepRender type at `src/compiler/ir/types.ts` (not fully read but referenced) includes `parameterBaseSlot`.
**Gap**: The infrastructure for passing parametric data to the renderer is partially in place (parameterBaseSlot exists in StepRender and is resolved). However, the Rust renderer does not currently use this slot to read control points from Arena SoA channels for GPU-side evaluation.
**Classification**: TO-REVIEW - Compiler-side infrastructure exists but renderer-side consumption is not yet implemented for GPU-native parametric evaluation.
