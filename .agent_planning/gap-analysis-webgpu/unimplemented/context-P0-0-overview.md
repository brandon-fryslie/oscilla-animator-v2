# Context: P0-0 - Overview - UNIMPLEMENTED Items

## Target State
1. **Gauge Apply in GPU compute**: Continuity gauge offsets applied as step 1 of GPU compute dispatch, not on CPU.
2. **GPU-side Scalar/Field Eval**: All LFO/param/geometry evaluation runs in the GPU compute shader, not in TS CPU evaluator.
3. **Naga Error -> Node ID Mapping**: Naga validation errors carry source-map provenance back to specific blocks in the user's graph, enabling red-border UI highlighting.

## Current State

### Gauge Apply (CPU-side)
- `src/runtime/ContinuityApply.ts` - Applies continuity offsets on CPU
- `src/runtime/RuntimeState.ts:278-279` - Frame segments `phase1-continuity-map`, `phase1-continuity-apply` run on CPU
- `src/runtime/ContinuityState.ts` - Gauge state management on CPU
- Gauge zone exists in arena (`src/compiler/ir/storage-class.ts:306-333`) but is accessed by CPU code

### Scalar/Field Eval (CPU-side)
- `src/runtime/ValueExprScalarEvaluator.ts` - CPU scalar evaluation
- `src/runtime/ValueExprMaterializer.ts` - CPU field materialization
- `src/runtime/OpcodeInterpreter.ts` - CPU opcode execution
- `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` - Naga IR generation exists (GPU shader authoring path)
- `src/compiler/naga-bridge.ts` - Naga validation/WGSL emission works
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:37-55` - Default compute shader exists but is a placeholder

### Naga Error Mapping
- `src/compiler/naga-bridge.ts:20-28` - NagaValidationError captures error messages
- `src/compiler/ir/program.ts:691-705` - ExprProvenanceIR maps exprs to blocks
- No code connects Naga line/column errors to ExprProvenanceIR

## Files Involved
- `src/runtime/ContinuityApply.ts` - Would need GPU-lowered equivalent
- `src/runtime/ValueExprScalarEvaluator.ts` - CPU evaluator (would be replaced by GPU dispatch)
- `src/runtime/ValueExprMaterializer.ts` - CPU field evaluator (would be replaced)
- `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` - Naga lowering (needs full schedule coverage)
- `src/compiler/naga-bridge.ts` - Would need source-map integration for error mapping
- `src/compiler/ir/naga-emitter/ScopeEnvironment.ts` - Expression handle tracking for source maps

## Suggested Approach
1. **Gauge Apply**: Lower continuity apply into the Naga compute shader as a pre-pass before scalar/field eval. Requires gauge zone offsets in GPU bindings.
2. **GPU Eval**: Continue expanding Naga lowering coverage until the generated compute shader can replace CPU evaluation. The infrastructure exists; the gap is completeness of the lowering.
3. **Naga Error Mapping**: Build a source-map table during Naga lowering that maps Naga expression/statement handles to (BlockId, portName). When NagaValidationError is caught, look up the line/column in the WGSL output and trace back through the source map.

## Risks
- GPU gauge apply requires careful synchronization with CPU continuity state management
- Full GPU eval is the core architectural migration and is the largest work item
- Naga error mapping depends on Naga's error format stability (line/column may vary across versions)
