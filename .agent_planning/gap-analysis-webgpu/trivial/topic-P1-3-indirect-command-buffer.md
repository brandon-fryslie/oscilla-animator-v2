# P1-3: GPU-Driven Rendering (Indirect Command Buffer) - TRIVIAL Items

## Item 1: Draw Prep Uses atomicStore + atomicAdd Instead of Direct Write
**Spec says**: Section 3.2: Draw prep "emits" commands (no specific instruction type required).
**Implementation**: `compute.rs:72-77` uses `atomicStore` for most fields and `atomicAdd` for `instanceCount`. The `atomicAdd` on instanceCount is designed to support future multi-sink accumulation where multiple sinks contribute to the same record.
**Gap**: Using atomics where plain stores would suffice adds minor overhead. However, `atomicAdd` on instanceCount is forward-looking and enables future multi-sink compositing. The correctness is preserved.
**Classification**: TRIVIAL

## Item 2: Pass Boundary Synchronization
**Spec says**: Section 6: "EndComputePass -> BeginRenderPass ensures Draw Prep writes are visible to render reads."
**Implementation**: `engine.rs:896-934`: The flow is `begin_compute_pass` (simulation) -> `end` -> `begin_compute_pass` (assembly) -> `end` -> `clear_buffer` (indirect) -> `begin_compute_pass` (draw prep) -> `end` -> `begin_render_pass` -> `end`. Each pass boundary provides the required synchronization guarantees per WebGPU spec.
**Gap**: Correct. WebGPU pass boundaries enforce visibility. The implementation respects this ordering.
**Classification**: DONE (listed for completeness)
