# P1-3: GPU-Driven Rendering (Indirect Command Buffer) - UNIMPLEMENTED Items

## Item 1: GPU-Side Culling Pass
**Spec says**: Section 4: "Before Draw Prep: 1. Check bounds/visibility. 2. Compact visible instance IDs. 3. Atomically increment visible counters." And Section 4.2: "With indirect: Draw Prep writes reduced counts; vertex stage runs only for visible work."
**Implementation**: No culling pass exists. The draw-prep shader (`compute.rs:52-56`) clamps instance count against buffer capacity (`maxInstanceCount`) but does not check bounds or visibility. All instances are drawn regardless of screen visibility. There is no atomic counter for visible instances.
**Gap**: Full GPU culling pipeline is absent. All instances are drawn every frame regardless of visibility. For large particle counts, this wastes vertex processing on off-screen instances.
**Classification**: UNIMPLEMENTED

## Item 2: Debug View for Async Inspector Readback
**Spec says**: Section 7, Requirement 4: "Add async inspector readback for command counts and region occupancy."
**Implementation**: `WebGPUIndirectArgsInspector.ts` exists and provides `readIndirectArgs()` which creates a MAP_READ buffer, copies indirect args, and decodes records. However, the `WebGPURenderer.readIndirectArgsDebugView()` at `RustWasmWebGPURenderer.ts:768-774` returns an EMPTY snapshot -- it never actually calls the inspector. The Rust engine has no equivalent readback path for indirect args.
**Gap**: The inspector class EXISTS with full implementation, but it is NEVER connected to the actual renderer. The debug readback returns empty data. The Rust engine's debug readback (`trigger_debug_readback()` at `engine.rs:1302-1345`) reads the instance buffer, NOT the indirect buffer.
**Classification**: UNIMPLEMENTED (the inspector is dead code)

## Item 3: Draw Prep Reads from GPU Counters
**Spec says**: Section 3.1: "Draw Prep consumes: Arena counters/visibility results." The flow is: "Compute Shader increments the Counter" -> "Draw Prep reads that Counter" -> "Draw Prep writes that value into indirect records."
**Implementation**: Draw prep reads instance counts from the CPU-authored sink table (`sinkTableWords[recordBase + RECORD_WORD_INSTANCE_COUNT]`). These counts are set by the CPU before upload. There is no mechanism for GPU-side compute shaders to write counters that draw-prep then reads.
**Gap**: The entire "GPU computes draw counts" flow is missing. Counts come from CPU. This means the system cannot support GPU-driven instance count determination (e.g., particle death, culling, procedural geometry).
**Classification**: UNIMPLEMENTED

## Item 4: Compiler Emits Structured Draw-Prep Metadata
**Spec says**: Section 3.1: "Compiler-emitted draw-prep sink metadata: drawMode, topology references, firstInstance, record index, region info."
**Implementation**: The compiler IR at `program.ts:363-434` DOES emit `DrawPrepSinkIR` with `drawMode`, `indirectRegion`, `indirectStrideBytes`, `topologySource`, `firstInstanceSource`, `indexedFirstIndex`, `indexedBaseVertex`, `nonIndexedFirstVertex`. The runtime packs this into a sink table (`DrawPrepSinkTablePacker.ts`). However, the draw-prep shader reads a generic sink table with flat u32 words rather than consuming the compiler IR fields directly.
**Gap**: Compiler emits the metadata (DONE). The metadata is packed into a binary table (DONE). The draw-prep shader reads this table (DONE). The gap is that the spec envisions compiler metadata flowing directly to shader constants/uniforms, but the implementation uses a runtime-packed binary table instead. This IS working but adds a serialization layer.
**Classification**: TO-REVIEW (implemented differently, but working)
