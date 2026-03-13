# P3-2: GPU Compute Dispatch - TO-REVIEW Items

## Item 1: Bind Group Layout Differs from Spec
**Spec says**: Single Layout Group 0 with 5 bindings: (0) Arena_Read storage read, (1) Arena_Write storage read_write, (2) Shape_Bank storage read, (3) Textures texture_2d, (4) Sampler.
**Implementation**: Compiler simulation layout has 5 bindings at group 0: (0) arena_read storage read, (1) arena_write storage read_write, (2) state_read storage read, (3) state_write storage read_write, (4) global_uniforms uniform. No texture or sampler bindings. The state buffers are separate from arena buffers.
**Gap**: The implementation uses a richer layout that separates state from arena, adds a dedicated uniform buffer, and omits texture/sampler bindings. This is a deliberate architecture decision: the implementation has separate "compiler arena" buffers (for graph-lowered signal data) and "state" buffers (for stateful block continuity), which provides cleaner separation of concerns. Textures/samplers are future work.
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:379-435` (compiler simulation layout)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:37-55` (DEFAULT_SIMULATION_WGSL bindings)

## Item 2: Multi-Pass Simulation Architecture
**Spec says**: A single main compute dispatch for simulation. One primary `dispatchWorkgroups(...)` call.
**Implementation**: Supports multi-pass simulation chains. `simulation_pipelines: Vec<CompiledComputePassPipeline>` stores multiple pipeline objects, each dispatched in sequence with ping-pong buffer alternation between passes (`compute.rs:466-506`). Each pass reads from the previous pass's output. This is for the compiler-emitted "fluid pass" architecture.
**Gap**: The implementation is a superset of the spec. Multiple simulation passes can execute in sequence. This is a feature the spec does not anticipate but is architecturally sound (each pass is a separate compute pass with pass-boundary synchronization).
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:466-506`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:96-117` (simulation pipeline vec)

## Item 3: Shader Phases Differ from Spec's 3-Phase Model
**Spec says**: Single shader with 3 phases: (1) Scalar evaluation by all threads, scalar write guarded by `if (lane == 0)`, (2) Tail guard `if (lane >= MAX_INSTANCES) return`, (3) Field evaluation (SoA read/compute/write).
**Implementation**: The default simulation shader (`engine.rs:37-55`) is a placeholder. The real simulation shaders are compiler-generated and installed via `rebuild_gpu_pipelines()`. The default simply does `state_write[index] = base + dt_bits + 1u`. The compiler-generated shaders (from the Naga IR emitter) should follow the 3-phase model, but this depends on the compiler output.
**Gap**: The spec describes a specific shader phase structure. The implementation uses compiler-generated shaders whose structure is determined by the compilation pipeline. The default shader is a test placeholder. Whether the compiler-generated shaders follow the spec's 3-phase model depends on the Naga emitter (which is in a separate audit scope).
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:37-55` (default shader)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:833-842` (rebuild GPU pipelines)
