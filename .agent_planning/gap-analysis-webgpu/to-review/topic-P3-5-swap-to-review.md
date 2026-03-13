# P3-5: Runtime Loop: The Swap - TO-REVIEW Items

## Item 1: Ping-Pong Index Driven by Pass Count, Not Frame Count
**Spec says**: Current State (Read) = frameIndex % 2. The frame index determines which arena is read vs written. Simple even/odd alternation per frame.
**Implementation**: The ping-pong index is driven by simulation pass count, not by frame count. In `encode_simulation_and_assembly()` (`compute.rs:466-506`), `read_index` starts at `arena.ping_pong_index()` and increments by 1 for each simulation pass. After N passes, the final read_index becomes the new ping_pong_index. With 1 pass, it alternates per frame (matching spec). With 2 passes, it stays the same per frame. With 3 passes, it alternates. The pattern depends on pass count parity.
**Gap**: This is a correct generalization of the spec's model for multi-pass simulation. The spec assumes single-pass, where frameIndex % 2 and pass-driven alternation produce identical results. With multi-pass, the implementation is correct because each pass reads the previous pass's output. The AnimationLoop even tracks expected parity: `expectedPingPongIndexFromParity = (schedulerFrameCount * simulationPassCount) & 1` (`AnimationLoop.ts:270`).
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:472-505`
- `/Users/bmf/code/oscilla-animator-v2/src/services/AnimationLoop.ts:270`

## Item 2: Bind Group Cleanup on Resource Resize
**Spec says**: If the Arena or bind-layout resources resize/change, recreate all precomputed groups.
**Implementation**: When topology, sink table, or indirect buffers resize due to capacity growth, the affected bind groups are rebuilt via `rebuild_*_bind_group()` methods (`memory.rs:684-745`). However, for state/arena buffers, resize only happens at `rebuild_pipeline()` time (`engine.rs:790-831`) which creates an entirely new `GpuMemoryArena`. During normal operation, state/arena buffers are fixed-size.
**Gap**: Bind group recreation is handled correctly for dynamically-sized buffers. State/arena buffers are only resized at pipeline rebuild time, which creates a fresh arena (so bind groups are naturally recreated). This is sufficient but means that if arena buffers need to grow at runtime (not currently possible), bind groups would not be updated.
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:605-745`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:790-831`
