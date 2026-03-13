# Context: P2-1 - Hot-Swap Frame Alignment

## Target State
Spec requires that pipeline hot-swap occurs at the top of a frame boundary (before dispatch) to prevent tearing or stutter. The runtime loop should poll `tryGetNewPipeline()` at frame start.

## Current State
`RuntimeService` at `src/services/RuntimeService.ts` processes swap via `AsyncCompilerService.takeReadyArtifactsForSwap()`. The `compileAndSwap()` at `src/services/CompileOrchestrator.ts:238` is an async function that runs independently of the animation loop. The Rust renderer (`oscilla-rust-renderer`) receives pipeline updates via `REBUILD_PIPELINE` worker messages.

The WebGPU renderer worker likely handles frame-aligned transitions internally (it has its own tick loop), but this needs verification.

## Files Involved
- `src/services/RuntimeService.ts` - Runtime lifecycle
- `src/services/AsyncCompilerService.ts` - Artifact polling
- `src/services/CompileOrchestrator.ts` - Swap execution
- `src/render/wasm/rust/oscilla-rust-renderer/` - GPU pipeline lifecycle

## Suggested Approach
Verify that the Rust renderer's `REBUILD_PIPELINE` handler:
1. Queues pipeline recreation for the next tick boundary
2. Does not apply mid-frame
If the Rust renderer already handles this, the requirement is satisfied at a different layer.

## Risks
- If the Rust renderer applies pipeline changes immediately upon receiving the message, there could be frame tearing.
- The JS-side `compileAndSwap` mutates `RuntimeState` asynchronously; need to ensure the animation loop doesn't read partially-migrated state.
