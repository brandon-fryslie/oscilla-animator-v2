# P5-2: Error Propagation / Developer Experience - TO-REVIEW Items

## Item 1: SourceMap Implementation
**Spec says**: `SourceMap` class mapping Naga Expression ID (u32) -> Block ID (string) and Statement Index -> Block ID. Populated during lowering via `ctx.sourceMap.recordExpr(exprId, blockId)`.
**Implementation**: Two-layer source mapping exists:
1. **TS-side**: `exprToBlock: Map<ValueExprId, BlockId>` in `IRBuilderImpl.ts:73`. Populated automatically during block lowering via `setCurrentBlock()`/`clearCurrentBlock()` context tracking (`IRBuilderImpl.ts:111,820`). Tested in `src/compiler/__tests__/expr-to-block-mapping.test.ts`.
2. **Naga-side**: `NagaSourceMapEntryIR` in `ScheduleNagaLowering.ts:174`. `NagaBuilder.ts:104-107` maintains `expressionSourceMap` and `statementSourceMap` keyed by `NagaHandle`. The `makeSource()` function at line 369 bridges exprToBlock to Naga handles.

**Gap**: The implementation is more sophisticated than the spec's simple class -- it has two layers (TS IR -> BlockId, then Naga handle -> source entry). The spec's simple `SourceMap.recordExpr()` API is replaced by automatic context tracking. Functionally superior.
**Classification**: TO-REVIEW (implemented differently but better)

## Item 2: Naga Error Parsing and Block ID Resolution
**Spec says**: Parse Naga's nested `ValidationError` JSON, extract expression handle, look up in SourceMap, dispatch to error store with `blockId`.
**Implementation**: `src/compiler/naga-compile.ts:142-162` (`toCompileErrors` function) parses error entries, extracts handles via `parseSourceHandle()` (line 37-46), looks up in `sourceMap` sidecar data. Returns `CompileError` with `where: { blockId }` when found. Falls back to generic error without blockId.
**Gap**: The parsing is functional but the "humanizer" (translating Naga jargon to user-friendly text) is minimal. Errors are passed through with raw Naga messages plus location context. No regex dictionary of common patterns mapped to musician-friendly text.
**Classification**: TO-REVIEW

## Item 3: Runtime Error Store Architecture
**Spec says**: Runtime-scoped error store (`state.runtimeErrors[id]`). Block component subscribes selectively.
**Implementation**: `DiagnosticsStore.ts` and `DiagnosticHub.ts` manage diagnostics. Compile errors are surfaced via `CompileEndEvent` diagnostics. Runtime health errors via `RuntimeHealthSnapshotEvent`. GPU faults via `GpuFaultEvent` (`events/types.ts:577`). Block-level error display exists in the graph editor.
**Gap**: The error store is not directly keyed by block ID as `state.runtimeErrors[id]`. Instead, diagnostics carry `primaryTarget` with block references. The architecture is more general but serves the same purpose.
**Classification**: TO-REVIEW
