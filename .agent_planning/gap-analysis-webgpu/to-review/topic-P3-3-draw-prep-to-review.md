# P3-3: GPU Draw Prep - TO-REVIEW Items

## Item 1: Draw Prep Shader ABI Differs from Spec Canonical Kernel
**Spec says**: Canonical kernel uses `DrawPrepParams` uniform with vec4<u32> packing: `v0=[drawMode, countOrIndexCount, firstOrFirstIndex, baseVertexBits]`, `v1=[instanceCount, firstInstance, recordIndex, maxRecords]`, `v2=[indexedRegionBaseWords, nonIndexedRegionBaseWords, indexedStrideWords, nonIndexedStrideWords]`. Shader reads uniform params and writes to indirect buffer.
**Implementation**: Draw prep shader reads directly from `sinkTableWords` storage buffer (binding 0) rather than uniform params. It indexes into the sink table header and records to extract all metadata. No per-dispatch uniform buffer exists for draw prep params. The shader also reads `instanceWords` (binding 3) to clamp instance counts against buffer capacity.
**Gap**: The implementation is data-driven through the sink table rather than parameterized via uniform dispatch. This is arguably better: one dispatch handles all records via table lookup rather than requiring per-record uniform writes. However, the ABI is fundamentally different from the spec's canonical kernel.
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:3-93`
- Spec canonical kernel: `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md:69-110`

## Item 2: Indirect Buffer Reset Strategy
**Spec says**: Counter reset happens before physics dispatch (Section 4.1).
**Implementation**: The indirect buffer is cleared via `encoder.clear_buffer(&self.arena.indirect_buffer, 0, None)` (`engine.rs:919`) AFTER simulation+assembly but BEFORE draw prep. This is between the assembly pass and the draw prep pass, not before physics.
**Gap**: Timing of indirect buffer reset differs. Spec says reset before physics; implementation resets between assembly and draw prep. Since draw prep is the only writer to the indirect buffer, this is functionally equivalent. The draw prep shader uses `atomicAdd` for instance count, so clearing to zero first is essential and correctly done.
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:917-921`

## Item 3: Instance Assembly as Intermediate Pass
**Spec says**: Spec describes physics compute -> draw prep -> render as three passes. No "instance assembly" intermediate pass is mentioned.
**Implementation**: There is an explicit "instance assembly" compute pass between simulation and draw prep (`compute.rs:488-504`). This pass reads simulation output and sink table data, then writes per-instance transform/color data to the `instance_buffer` (12 floats per instance: pos, scale, rotation, scale2, shapeOffset, color). This is the `DEFAULT_ASSEMBLY_WGSL` shader.
**Gap**: The instance assembly pass is an additional compute stage not in the spec. It bridges simulation output (arena/state channels) to per-instance render data. This is the mechanism that converts the SoA arena layout to the AoS instance buffer layout that the vertex shader expects. It is a necessary bridge given the current architecture.
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:488-504`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:57-300` (DEFAULT_ASSEMBLY_WGSL)
