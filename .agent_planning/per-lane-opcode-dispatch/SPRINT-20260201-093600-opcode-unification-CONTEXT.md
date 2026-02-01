# Implementation Context: Per-Lane Opcode Dispatch

## Key Files

### Block Lowering (WI-1 changes)
- `src/blocks/math-blocks.ts` — Add (line 44), Subtract (line 136), Multiply (line 228), Divide (line 320), Modulo (line 412)
- `src/blocks/field-operations-blocks.ts` — FieldSin (line ~85), FieldCos (line ~150)

### Runtime (already correct, no changes needed)
- `src/runtime/ValueExprMaterializer.ts` — `applyMap()`, `applyZip()`, `applyZipSig()` already have working per-lane opcode loops
- `src/runtime/OpcodeInterpreter.ts` — single enforcer for scalar math
- `src/runtime/FieldKernels.ts` — structural/domain kernels only (makeVec2, hsvToRgb, layouts)

### IR Types (reference only)
- `src/compiler/ir/types.ts` — `PureFn` type: `{ kind: 'opcode', opcode: string } | { kind: 'kernel', name: string } | ...`
- `src/compiler/ir/value-expr.ts` — `ValueExprKernel` with `kernelKind` discriminant
- `src/compiler/ir/IRBuilderImpl.ts` — `opcode()`, `kernel()`, `kernelZip()`, `broadcast()` methods

### Key Helpers
- `src/core/canonical-types.ts` — `requireInst()`, `payloadStride()`, `strideOf()`
- `src/compiler/ir/lowerTypes.ts` — `deriveKind()`, `ValueRefExpr`

## Architecture Context

### Per-Lane Dispatch Flow (target state)
```
Block lower() → ctx.b.opcode(OpCode.Add) → PureFn { kind: 'opcode', opcode: 'add' }
             → ctx.b.kernelZip([a, b], addFn, type) → ValueExpr { kind: 'kernel', kernelKind: 'zip', fn: { kind: 'opcode' }, ... }

Schedule → StepMaterialize { expr: veId }

ValueExprMaterializer.fillKernel() → case 'zip' → applyZip()
applyZip() → fn.kind === 'opcode' → per-lane loop calling applyOpcode()
```

### What Stays as Named Kernels
Structural/domain kernels are NOT arithmetic and cannot be per-lane opcodes:
- makeVec2, makeVec3, vec2ToVec3, fieldSetZ (stride-changing)
- hsvToRgb (multi-component correlated)
- polygonVertex, starVertex (geometry)
- circleLayoutUV, lineLayoutUV, gridLayoutUV (layout)

These stay as `fn.kind: 'kernel'` and route through `applyFieldKernel()`/`applyFieldKernelZipSig()`.

## ChatGPT Consultation Summary (2026-02-01)

Confirmed: Per-lane opcode dispatch is already implemented in the materializer. Remaining work is:
1. Make block lowering consistently emit opcodes for lane-wise math
2. Delete/ban field-arithmetic kernel names
3. (Optional) Pre-resolve opcode functions for hot loop performance

Structural/domain kernels should remain as specialized kernels — they are inherently non-opcode.
