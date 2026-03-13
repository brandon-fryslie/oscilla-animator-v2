# Context: P1-3 - Indirect Args Inspector Is Dead Code

## Target State
Debug async readback for indirect command buffer: inspector reads back indirect args from GPU, decodes them, and exposes command counts and region occupancy data for debugging.

## Current State
- `WebGPUIndirectArgsInspector.ts` is a fully implemented class:
  - Creates MAP_READ staging buffer (`line 120-128`)
  - Copies from indirect buffer via command encoder (`line 84-86`)
  - Maps async and decodes 5-word records (`line 96-109`)
  - Returns `IndirectArgsReadbackSnapshot` with record data
- However, `WebGPURenderer.readIndirectArgsDebugView()` at `RustWasmWebGPURenderer.ts:768-774` returns an EMPTY snapshot:
  ```typescript
  async readIndirectArgsDebugView(maxRecords: number = 0): Promise<IndirectArgsReadbackSnapshot> {
    return {
      capturedAtMs: performance.now(),
      recordCount: Math.max(0, Math.floor(maxRecords)),
      records: [],
    };
  }
  ```
- The inspector class is never instantiated by the Rust renderer.
- The Rust engine's debug readback (`engine.rs:1302-1345`) reads the INSTANCE buffer, not the INDIRECT buffer.

## Files Involved
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/WebGPUIndirectArgsInspector.ts` (complete but unused)
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/RustWasmWebGPURenderer.ts` (returns empty snapshot)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (debug readback reads instance buffer)

## Suggested Approach
1. Add an indirect buffer readback path in the Rust engine (parallel to existing instance buffer readback).
2. Expose via a worker outbound message (`DEBUG_INDIRECT_READBACK_PACKET`).
3. In `WebGPURenderer`, implement `readIndirectArgsDebugView()` to request this readback from the worker.
4. Alternatively, use the existing `WebGPUIndirectArgsInspector` if the renderer moves back to JS-side GPU control.

## Risks
- Readback from INDIRECT buffer requires COPY_SRC usage flag -- already present (`memory.rs:581`).
- Async readback adds latency; should only be triggered on debug cadence, not every frame.
- Current debug readback already serves instance buffer data; adding indirect readback doubles debug overhead.
