# P0-0: Overview - GPU-Native Visual Instrument Architecture - UNIMPLEMENTED Items

## Item 1: Gauge Apply Step in Compute Dispatch
**Spec says**: Compute dispatch logic step 1 is "Gauge Apply: Apply continuity offsets to state."
**Implementation**: Continuity is handled in the TS runtime frame loop (`src/runtime/RuntimeState.ts:278-279` segments `phase1-continuity-map` and `phase1-continuity-apply`) via `src/runtime/ContinuityApply.ts`. This runs on the CPU, not in the GPU compute shader.
**Gap**: The spec envisions gauge/continuity application as part of the GPU compute dispatch. Currently, continuity offset application runs on the CPU in the TS runtime. For a fully GPU-native architecture, gauge application would need to be lowered into the generated compute shader.
**Classification**: UNIMPLEMENTED

## Item 2: GPU-Side Scalar Eval and Field Eval in Compute Dispatch
**Spec says**: Compute dispatch steps 2-3: "Scalar Eval: Compute LFOs and global params" and "Field Eval: Compute geometry and layouts in parallel (SoA)."
**Implementation**: The compiler generates WGSL via Naga lowering (`src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts`) and the Rust renderer dispatches it. However, the TS runtime still evaluates scalars and fields on the CPU via `src/runtime/ValueExprScalarEvaluator.ts` and `src/runtime/ValueExprMaterializer.ts`. The GPU compute shader receives pre-computed arena data.
**Gap**: The spec envisions all scalar and field evaluation happening in the GPU compute dispatch. Currently, the TS runtime performs value evaluation on the CPU and the GPU receives pre-computed results via arena upload. Full GPU-side evaluation is not yet implemented -- the Naga-generated compute shader exists but runtime execution still uses the CPU evaluator as the primary execution path.
**Classification**: UNIMPLEMENTED

## Item 3: Naga Error Mapping to Node ID
**Spec says**: "If invalid, Naga returns a Rust-style error report which we map back to the specific Node ID in the UI (red border effect)."
**Implementation**: `src/compiler/naga-bridge.ts:20-28` creates `NagaValidationError` with error messages from Naga. The errors are surfaced to the diagnostics system. However, mapping Naga errors back to specific graph node IDs for red-border UI highlighting is not implemented.
**Gap**: Naga errors are surfaced as text but lack source-map provenance linking back to the originating block/node in the user's graph. The Naga lowering does carry `exprProvenance` in `DebugIndexIR` (`src/compiler/ir/program.ts:691-705`) but this mapping is not connected to Naga validation error line/column output.
**Classification**: UNIMPLEMENTED
