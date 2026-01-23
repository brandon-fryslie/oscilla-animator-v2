---
topic: 17
name: Layout System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/17-layout-system.md
audited: 2026-01-23T00:00:00Z
has_gaps: true
counts: { done: 14, partial: 3, wrong: 2, missing: 1, na: 0 }
---

# Topic 17: Layout System

## DONE

- Layout is Field<vec2>: Layout blocks produce Field<vec2> positions via field kernels — src/blocks/instance-blocks.ts:55-56
- Single layout engine (field expressions + kernels): All layouts use FieldExprZipSig with kernel functions, no alternative mechanisms — src/blocks/instance-blocks.ts:84-89
- No FieldExprLayout node type: Removed from FieldExpr union (confirmed grep: no matches) — src/compiler/ir/types.ts:167-175
- No position/radius intrinsics: IntrinsicPropertyName is exactly {index, normalizedIndex, randomId} — src/compiler/ir/types.ts:162-165
- No InstanceDecl.layout: InstanceDecl has no layout property (confirmed: only in .bak file) — src/compiler/ir/types.ts:357-365
- circleLayout kernel exists: Implemented with correct formula center + radius * (cos,sin) in world [0,1] — src/runtime/FieldKernels.ts:453-480
- lineLayout kernel exists: Implements lerp from (x0,y0) to (x1,y1) with clamped t — src/runtime/FieldKernels.ts:563-590
- gridLayout kernel exists: Implements col/row computation with normalized [0,1] output — src/runtime/FieldKernels.ts:591-625
- Intrinsic index: Lane index i for i in [0, N-1] — src/runtime/Materializer.ts:394-401
- Intrinsic randomId: Deterministic PRNG from seed — src/runtime/Materializer.ts:413-419
- circleLayout block (graph level): CircularLayout in geometry-blocks.ts uses fieldZipSig + circleLayout kernel — src/blocks/geometry-blocks.ts:71-129
- GridLayout block (graph level): Uses fieldZipSig + gridLayout kernel with instance context — src/blocks/instance-blocks.ts:31-99
- LineLayout block (graph level): Uses fieldZipSig + lineLayout kernel — src/blocks/instance-blocks.ts:108-186, 267-353
- CircleLayout block (graph level): Uses fieldZipSig + circleLayout kernel — src/blocks/instance-blocks.ts:188-264
- Layout blocks compile to FieldExprZipSig: All layout blocks emit fieldZipSig with kernel name — src/blocks/instance-blocks.ts:85-89

## PARTIAL

- Kernel resolution (name-based registry): Kernels are dispatched by name string in FieldKernels.ts applyFieldKernelZipSig, but there's no formal "kernel registry" object — src/runtime/FieldKernels.ts:36-37
- StepRender contract: Has positionSlot, colorSlot, instanceId. Missing explicit type checking that positionSlot is Field<vec2> over instanceId. No field-backed shape/controlPoints matching checks — src/compiler/ir/types.ts:444-459
- Validation rules at compile time: Layout fields are checked for field cardinality in blocks, but no formal validation that type.payload='vec2' and temporality='continuous' is enforced — src/blocks/instance-blocks.ts:60-61

## WRONG

- normalizedIndex for N=1: Spec says "0.5 for N = 1" but implementation returns 0 — src/runtime/Materializer.ts:408 (`arr[i] = N > 1 ? i / (N - 1) : 0;`)
- circleLayout phase unit: Spec says phase is in radians (`theta_i = phase + 2pi * t_i`) but implementation treats phase as normalized [0,1] (`angle = 2pi * (index + phase)`). A phase of 1.0 is one full rotation in impl, but spec expects radians where 2pi is one full rotation — src/runtime/FieldKernels.ts:477

## MISSING

- circleLayout clamp on t: Spec requires `t_i = clamp(t[i], 0, 1)` but implementation uses `indexArr[i]` directly without clamping. lineLayout and gridLayout do clamp their inputs — src/runtime/FieldKernels.ts:477

## N/A

(none — all requirements in this topic are T1)
