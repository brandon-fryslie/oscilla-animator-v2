# P3-1: CPU to GPU Input Marshalling - UNIMPLEMENTED Items

## Item 1: MIDI Ring Buffer (Event Queue)
**Spec says**: Reserve a u32 ring buffer in the Arena (offset 256 to 512) for MIDI events. Protocol: [EventCount, Note, Velocity, Note, Velocity...]. CPU drops oldest events on overflow. A "Voice Allocator" compute block reads these events.
**Implementation**: No MIDI event queue exists anywhere in the codebase. Grep for "MIDI", "midi", "ring buffer", "event queue" returns no results in the render directory.
**Gap**: The entire MIDI event system is unimplemented. No ring buffer, no event queue, no voice allocator.
**Classification**: UNIMPLEMENTED

## Item 2: Click-to-Photon Latency Verification Test
**Spec says**: Build an integration fixture where Mouse.X drives a thresholded full-screen color output. Inject timestamped markers at frame boundary N and assert that frame N (not N+1) reflects the new marker.
**Implementation**: No such latency verification test exists. The test infrastructure includes Playwright E2E tests and WebGPU matrix tests, but no click-to-photon latency verification.
**Gap**: The spec's recommended verification test is not implemented. Input latency correctness is assumed but not mechanically verified.
**Classification**: UNIMPLEMENTED

## Item 3: DeltaTime Computed from Real Frame Timing
**Spec says**: DeltaTime (offset 0x04) is the physics step size (dt), derived from real frame timing.
**Implementation**: DeltaTime is hardcoded to `1.0 / 60.0` in `engine.rs:1205`: `uniforms.delta_time_seconds = (1.0 / 60.0) as f32;`
**Gap**: The implementation always uses a fixed 60fps dt regardless of actual frame timing. This means physics will not adapt to variable frame rates. The spec requires dt to be the actual inter-frame interval.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:1205`
