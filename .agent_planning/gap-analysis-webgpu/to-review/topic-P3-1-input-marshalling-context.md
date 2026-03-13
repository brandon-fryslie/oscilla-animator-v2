# Context: P3-1 - CPU to GPU Input Marshalling

## Target State
Spec requires a 256-byte input header serialized into the Arena's header zone via queue.writeBuffer, with inputs written to the current Arena_Read buffer before compute dispatch. Input ownership is runtime-scoped (not process-global).

## Current State
Implementation uses SharedArrayBuffer + Atomics for CPU-to-worker transfer, then writes a separate GlobalUniforms struct to a dedicated uniform buffer (not inside the arena). This is more efficient than the spec's model:
- SharedArrayBuffer avoids PostMessage serialization overhead
- Dedicated uniform buffer gets optimized GPU hardware paths
- Atomics fence provides ordering guarantee

Key files:
- `src/render/rust/runtime-input-layout.ts:1-31` - Shared input ABI
- `src/render/webgpu/RustWasmWebGPURenderer.ts:899-1024` - Main-thread input writes
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:1193-1299` - Rust input marshal
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:46-53,417-419` - Uniform buffer

## Files Involved
- `src/render/rust/runtime-input-layout.ts`
- `src/render/webgpu/RustWasmWebGPURenderer.ts`
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs`

## Suggested Approach
The implementation is architecturally superior to the spec for this requirement. The spec should be updated to reflect the SharedArrayBuffer + dedicated uniform buffer approach rather than changing the implementation. Consider documenting the decision rationale.

## Risks
- None for correctness. The SharedArrayBuffer + uniform buffer approach is more performant.
- Spec drift if the spec is used as source-of-truth for other implementations.
