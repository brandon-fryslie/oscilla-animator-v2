# Context: P3-2 - GPU Compute Dispatch

## Target State
Spec requires a single compute dispatch with 5 bindings (arena_read, arena_write, shape_bank, textures, sampler) and a shader with 3 execution phases (scalar, tail guard, field).

## Current State
Implementation has:
- 5 bindings but different layout (arena_read, arena_write, state_read, state_write, uniforms)
- Multi-pass simulation support (for compiler-emitted fluid passes)
- Compiler-generated shaders via Naga IR emitter
- Separate instance assembly pass after simulation

Key files:
- `src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:96-527`
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:37-55,833-842,896-934`
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:326-380` (simulation bind groups)

## Files Involved
- `src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs`
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs`

## Suggested Approach
The implementation's multi-pass and separate-state architecture is more capable than the spec's model. Consider updating the spec to reflect the actual architecture (arena+state separation, multi-pass chains, compiler-generated shaders).

## Risks
- Compiler-generated shader phase structure needs separate audit (P2 scope)
- Multi-pass ping-pong has correct pass-boundary synchronization via compute pass boundaries
