# P1-1: Unified GPU Buffer Strategy (Arena) - TO-REVIEW Items

## Item 1: Arena Is Not a Single Contiguous GPU Buffer
**Spec says**: "The Arena is a single contiguous f32 array (effectively a ByteAddressBuffer). However, it is rigorously partitioned into functional zones." (Section 2). One buffer, 5 zones: Header, Scalar, Field, State, Gauge.
**Implementation**: The Rust renderer (`memory.rs:64-96`) uses SEPARATE GPU buffers instead of a single contiguous arena: `state_buffers[2]`, `compiler_arena_buffers[2]`, `instance_buffer`, `topology_buffer`, `sink_table_buffer`, `indirect_buffer`, `vertex_buffer`, `index_buffer`, plus `uniform_buffer`.
**Gap**: The spec envisions a single flat `array<f32>` with compiler-hardcoded zone offsets. The implementation uses many independent buffers with separate bind groups. The zone concept IS implemented in the compiler (`storage-class.ts:126-129` via `ArenaZonePlan`) which tracks header/scalar/field/state/gauge zones, but these zones map to the JS-side CPU arena (`ArenaValueStore`), not a monolithic GPU buffer.
**Classification**: TO-REVIEW

**Rationale**: The multi-buffer approach may be architecturally better. Advantages: (1) Each buffer gets correct usage flags without wasteful STORAGE|UNIFORM on the whole arena. (2) Bind group layout is cleaner. (3) Buffer resizing is per-resource, not global. However, this diverges significantly from the "one arena, compiler-hardcoded offsets" model. The compiler already emits zone plans with offsets, but the Rust renderer does not consume them as GPU buffer sub-regions.

## Item 2: Ping-Pong Implementation Uses Buffer Pairs, Not Binding Swaps
**Spec says**: "We allocate two identical buffers: Arena_A (Buffer ID: 0) and Arena_B (Buffer ID: 1). ... FrameIndex % 2 determines which is read-only vs write-only." (Section 1). Kernels see @group(0) @binding(0) as input, @group(0) @binding(1) as output.
**Implementation**: `memory.rs:89-96` has `state_buffers: [wgpu::Buffer; 2]` and `compiler_arena_buffers: [wgpu::Buffer; 2]`, with `ping_pong_index: usize`. Bind groups are pre-created as pairs (`state_bind_groups[2]`, `compiler_simulation_bind_groups[2]`). The swap is done by selecting different pre-built bind groups (`memory.rs:422-477`).
**Gap**: The mechanism achieves the same effect but uses pre-built bind group pairs rather than swapping buffer bindings at @group(0)@binding(0/1). This is CORRECT for WebGPU (you can't rebind buffer references inside existing bind groups), but the bind group layout differs from spec. Spec says `@group(0) @binding(0)` read, `@group(0) @binding(1)` write. Implementation uses `compiler_simulation_bind_groups[ping_pong_index]` which has 5 bindings (arena_read @0, arena_write @1, state_read @2, state_write @3, uniforms @4).
**Classification**: TO-REVIEW

**Rationale**: The implementation is arguably better than the spec because it pre-creates both bind group configurations and simply selects the right one. The key spec invariant ("no copy between frames, kernels move data naturally") is preserved. The 5-binding layout is richer than spec's 2-binding because the implementation separates state from arena.

## Item 3: Global Header Zone Layout Differs
**Spec says**: Zone 1 is 256 bytes at offset 0x00-0xFF, containing time, dt, resolution, mouse, buttons, and reserved space. Layout is: time @0x00, dt @0x04, resolution @0x08, mouse @0x10, buttons @0x18, reserved @0x20-0xFF.
**Implementation**: The implementation uses `GlobalUniforms` struct in `memory.rs:48-53`: `view_proj: [[f32; 4]; 4]` (64 bytes), `resolution: [f32; 2]` (8 bytes), `time_seconds: f32`, `delta_time_seconds: f32`. This is 80 bytes in a separate UNIFORM buffer, NOT embedded in the arena at offset 0. On the JS side, `WEBGPU_RENDER_CONTRACT` in `shaders.ts:31-43` defines 256-byte `inputHeaderBytes` with specific byte offsets that partially match spec. The Rust side also receives viewport/time via shared input (`runtime-input-layout.ts:1-25`) which is a SharedArrayBuffer, not a GPU buffer zone.
**Gap**: Header data is delivered to the GPU via: (1) a separate uniform buffer (`GlobalUniforms`), and (2) a SharedArrayBuffer for runtime input. The spec says header should be in-arena at offset 0x00. Additionally, the `GlobalUniforms` struct uses `view_proj` (4x4 matrix, 64 bytes) which is NOT in the spec header.
**Classification**: TO-REVIEW

**Rationale**: Using a separate UNIFORM buffer for per-frame constants is standard WebGPU practice and likely better than embedding them in a STORAGE buffer. Uniform buffers have faster access patterns on most GPUs.
