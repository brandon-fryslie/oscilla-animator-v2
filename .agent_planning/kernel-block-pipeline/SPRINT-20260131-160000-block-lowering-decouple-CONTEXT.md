# Implementation Context: block-lowering-decouple
Generated: 2026-01-31-160000

## Key Files

### Must Read
- `src/compiler/backend/lower-blocks.ts` — pass6 block lowering (~2000 LOC)
- `src/compiler/ir/IRBuilder.ts` — Current builder used by pass6
- `src/compiler/ir/lowerToValueExprs.ts` — The 1:1 translation pass
- `src/compiler/ir/value-expr.ts` — Target IR
- `src/compiler/ir/types.ts` — Legacy IR (SigExpr, FieldExpr, EventExpr)

### Potentially Create
- `src/compiler/ir/ValueExprBuilder.ts` (if WI-2)

## lowerToValueExprs Translation Map

The current lowering is mechanical. Each legacy node type maps 1:1:

| Legacy | ValueExpr | Notes |
|--------|-----------|-------|
| SigExprConst | ValueExpr const (extent=one) | |
| SigExprSlotRead | ValueExpr slotRead | |
| SigExprTime | ValueExpr time | |
| SigExprExternalInput | ValueExpr external | |
| SigExprKernelMap | ValueExpr kernel (kernelKind=map) | |
| SigExprKernelZip | ValueExpr kernel (kernelKind=zip) | |
| SigExprStateRead | ValueExpr state | |
| SigExprReduceField | ValueExpr kernel (kernelKind=reduce) | |
| SigExprShapeRef | ValueExpr shapeRef | |
| SigExprEventRead | ValueExpr eventRead | |
| FieldExprConst | ValueExpr const (extent=many) | |
| FieldExprIntrinsic | ValueExpr intrinsic | |
| FieldExprKernelMap | ValueExpr kernel (kernelKind=map, extent=many) | |
| FieldExprKernelZip | ValueExpr kernel (kernelKind=zip, extent=many) | |
| FieldExprKernelZipSig | ValueExpr kernel (kernelKind=zipSig) | |
| FieldExprBroadcast | ValueExpr kernel (kernelKind=broadcast) | |
| FieldExprStateRead | ValueExpr state (extent=many) | |
| FieldExprPathDerivative | ValueExpr kernel (kernelKind=pathDerivative) | |
| EventExprConst | ValueExpr event (eventKind=const) | |
| EventExprPulse | ValueExpr event (eventKind=pulse) | |
| EventExprWrap | ValueExpr event (eventKind=wrap) | |
| EventExprCombine | ValueExpr event (eventKind=combine) | |
| EventExprNever | ValueExpr event (eventKind=never) | |

This is why the legacy IR is structurally redundant — it's the same information with different type names.

## IRBuilder API Surface (what pass6 uses)

Key methods called by block lowering:
- `emitSigConst()`, `emitSigKernelMap()`, `emitSigKernelZip()`
- `emitFieldConst()`, `emitFieldIntrinsic()`, `emitFieldKernelMap()`, `emitFieldKernelZip()`, `emitFieldKernelZipSig()`, `emitFieldBroadcast()`
- `emitEventConst()`, `emitEventPulse()`, `emitEventWrap()`, `emitEventCombine()`
- `emitEvalSigStep()`, `emitMaterializeStep()`, `emitRenderStep()`
- Reference system: ValueRefPacked (discriminated signal|field|event + index)

A ValueExprBuilder would unify these into:
- `emitConst()`, `emitKernel()`, `emitIntrinsic()`, `emitEvent()`, etc.
- Reference system: ValueExprId (single namespace)

The reduction in API surface is significant (~20 methods → ~10 methods).
