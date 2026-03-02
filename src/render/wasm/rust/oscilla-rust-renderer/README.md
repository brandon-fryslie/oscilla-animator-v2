# oscilla-rust-renderer

Rust/WASM worker renderer engine for the hot-path migration.

- `init_engine(...)`: creates the canonical engine state and starts worker-owned RAF.
- `attach_shared_input(...)`: binds the main-thread shared input plane.
- `rebuild_pipeline(...)`: compiles replacement simulation/assembly WGSL into compute pipelines outside hot path.
- `rebuild_pipeline(...)` also recompiles the uber render pipeline WGSL outside hot path.
- `resize_surface(...)`: reconfigures surface + depth target outside hot path.
- `pause_engine(...)` / `resume_engine(...)`: lifecycle control for rebuild windows.
- `take_runtime_event_code(...)`: out-of-band runtime events (e.g. device lost).
- `take_runtime_status(...)`: heartbeat status (state, frame count, last error).
- `take_frame_pacing_packet(...)`: 60-frame mean/std-dev telemetry snapshots.
- `allocator.rs`: global strict allocator that panics on any hot-path allocation.
- `memory.rs`: Stage 1 preallocated arena + aligned render data contracts.
- `compute.rs`: Stage 2 compute dispatcher and immutable pass ordering.
- `render.rs`: Stage 3 indirect instanced render dispatcher + frame target management.
- `engine.rs`: Stage 4 strict worker tick, surface acquire/present, and gated debug readback.
