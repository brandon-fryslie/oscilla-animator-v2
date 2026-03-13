# P2-1: Async Compiler Service Architecture - TO-REVIEW Items

## Item 1: Pipeline Linking Stage Separated from Compilation
**Spec says**: Stage 3 "Driver Linking" calls `createComputePipelineAsync` and the state machine transitions COMPILING -> LINKING -> READY.
**Implementation**: `AsyncCompilerState` at `src/types/async-compiler-state.ts:1-7` includes `'linking'` state. The `takeReadyArtifactsForSwap()` at `src/services/AsyncCompilerService.ts:89-97` transitions to `'linking'` when artifacts are consumed. However, the GPU pipeline creation itself happens in the Rust renderer worker, not in this service. The `linking` state in AsyncCompilerService represents the *swap* phase (applying artifacts to runtime), not driver pipeline compilation.
**Gap**: The spec envisioned a JS-side `createComputePipelineAsync` call. The implementation delegates pipeline creation to the Rust renderer worker (`src/render/wasm/rust/oscilla-rust-renderer/`). The `linking` state exists but represents a different lifecycle phase (swap, not driver compile). This is arguably a better design since the Rust renderer owns its own pipeline lifecycle.
**Classification**: TO-REVIEW

## Item 2: Caching Strategy (Module Hash)
**Spec says**: "Key: Hash of the NagaModule JSON. Value: The generic GPUComputePipeline." Cache check after lowering to skip WASM validation and driver compilation.
**Implementation**: No pipeline or module caching is implemented anywhere in the compilation pipeline.
**Gap**: Undo/redo cache optimization is missing. Every edit triggers full recompilation. The spec explicitly calls this out as important for undo/redo and bypass toggling being instant.
**Classification**: TO-REVIEW

## Item 3: Hot-Swap occurs at top of frame
**Spec says**: "At the top of the frame (before dispatch), checks compiler.tryGetNewPipeline()."
**Implementation**: `RuntimeService` at `src/services/RuntimeService.ts` orchestrates the swap through `AsyncCompilerService.takeReadyArtifactsForSwap()` which is invoked asynchronously, not strictly at frame top. The `compileAndSwap()` call at `src/services/CompileOrchestrator.ts:238` is an async function. The animation loop is separate from swap timing.
**Gap**: The spec requires swap at the top of a frame boundary to prevent tearing. The implementation uses async swap which may not align with frame boundaries. Worth reviewing if the Rust renderer guarantees frame-aligned pipeline transitions internally.
**Classification**: TO-REVIEW
