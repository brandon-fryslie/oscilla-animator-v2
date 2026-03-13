# P2-1: Async Compiler Service Architecture - TRIVIAL Items

## Item 1: CompilerService class name
**Spec says**: `class CompilerService` with `scheduleCompile(graph: NormalizedGraph): void` and `tryGetNewPipeline(): CompilationResult | null`
**Implementation**: `AsyncCompilerService` at `src/services/AsyncCompilerService.ts:29` with `scheduleCompile(request: CompileWorkerRunRequest): void` and `takeReadyArtifactsForSwap(): PrecomputedCompileArtifacts | null`
**Gap**: Different naming (`AsyncCompilerService` vs `CompilerService`, `takeReadyArtifactsForSwap` vs `tryGetNewPipeline`) but identical semantics.
**Classification**: TRIVIAL

## Item 2: CompilationResult shape
**Spec says**: `CompilationResult { program, pipelines: { compute, draw, render }, layout: GpuLayout }`
**Implementation**: `PrecomputedCompileArtifacts` at `src/services/CompileOrchestrator.ts:172-178` carries `frontendResult`, `backendResult`, `compiledGpuBundle`, `compileDurationMs`.
**Gap**: The spec was written before the actual architecture stabilized. Implementation carries richer structured data. Pipeline creation happens downstream in the Rust renderer, not in the compiler service. Same concept, different shape.
**Classification**: TRIVIAL

## Item 3: State signal uses listeners vs RxJS
**Spec says**: "Implement AsyncCompilerService using RxJS (Observables) or standard Promises/EventEmitters."
**Implementation**: `subscribe(listener: CompilerStateListener)` at `src/services/AsyncCompilerService.ts:58-63` uses a plain `Set<listener>` pattern.
**Gap**: Uses simple listener pattern instead of RxJS or EventEmitter. Functionally equivalent and simpler.
**Classification**: TRIVIAL
