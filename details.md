#### Implementation Details (Where to write the code):
1.  **`src/compiler/backend/plan-stateful-storage.ts`:**
    *   Expand `planStatefulStorage` or the `MemoryManifest` object generated in `src/compiler/compile.ts` to request a double-buffered `ping-pong` topology instead of a single SSBO.

2.  **`src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs`:**
    *   Examine `state_bind_groups: [wgpu::BindGroup; 2]` inside `GpuMemoryArena` (around line 393).
    *   Examine the `swap_ping_pong()` method (around line 1003) and ensure it correctly swaps `Bind Group 0` (Read) and `Bind Group 1` (Write).

3.  **`src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`:**
    *   Ensure the main render loop or compute pass loop calls `swap_ping_pong` securely between sub-passes (e.g., between Spatial Hash counting and Fluid Advection).
