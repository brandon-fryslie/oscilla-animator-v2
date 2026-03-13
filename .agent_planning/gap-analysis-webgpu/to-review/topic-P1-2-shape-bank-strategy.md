# P1-2: Unified GPU Shape Bank Strategy - TO-REVIEW Items

## Item 1: Shape Bank Buffer is u32 Storage (Matches Spec)
**Spec says**: "The Shape Bank is a single storage buffer of type array<u32>." (Section 2)
**Implementation**: `memory.rs:556-563` creates topology_buffer with STORAGE usage. `engine.rs:319` binds it as `var<storage, read> topologyBank: array<u32>`. The JS-side `WebGPUShapeBankManager.ts:30-33` also creates it as STORAGE|COPY_DST. RuntimeState exports `SHAPE_BANK_HEADER_WORDS = 16`.
**Gap**: Exact match on buffer type. The buffer IS `array<u32>` bound at `@group(2) @binding(0)` in the uber shader.
**Classification**: DONE

## Item 2: Header Stride is 16 Words / 64 Bytes (Matches Spec)
**Spec says**: "Stride: 16 words (64 bytes) per shape (ShapeHeaderV1)." (Section 2.1)
**Implementation**: `memory.rs:5` defines `pub const SHAPE_BANK_HEADER_WORDS: usize = 16`. The JS-side `RuntimeState.ts:23` also defines `SHAPE_BANK_HEADER_WORDS = 16`. Engine at `engine.rs:487-496` defines individual word offsets matching spec: kind@0, flags@2, index_count@4, first_index@5, base_vertex@6, vertex_count@7, first_vertex@8, param_block_offset@9, param_block_words@10.
**Gap**: Header stride matches spec. Word offsets are almost identical with minor field ordering differences (see TO-REVIEW item below).
**Classification**: DONE

## Item 3: Header Field Ordering Differs From Spec
**Spec says**: Header table (Section 2.1): kind@0, topologyMode@1, flags@2, materialClass@3, indexCount@4, firstIndex@5, baseVertex@6, vertexCount@7, firstVertex@8, paramBlockOffset@9, paramBlockWords@10, reserved@11-15.
**Implementation**: `engine.rs:487-496`: kind@0, flags@2, index_count@4, first_index@5, base_vertex@6, vertex_count@7, first_vertex@8, param_block_offset@9, param_block_words@10. Note: topologyMode@1 and materialClass@3 are NOT present as named constants. Word 1 and 3 are implicitly unused/zero.
**Gap**: The implementation does not use `topologyMode` (word 1) or `materialClass` (word 3). These fields are zeroed. The current draw-prep shader determines indexed vs non-indexed from the sink table's `drawModeCode`, not from the shape header's `topologyMode`. This means ShapeHeaderV1 is partially populated.
**Classification**: TO-REVIEW

**Rationale**: The implementation routes topology mode through the sink table rather than the shape header, which is a different data flow than spec. This is workable but means the shape bank header is not self-describing for topology mode.

## Item 4: Payload Heap Region B
**Spec says**: Section 2.2: "The rest of the buffer acts as a heap for topology/parameter payload slices." Content includes indexed payloads, virtual-topology metadata, and shape parameter blocks.
**Implementation**: `engine.rs:500-598` (`realize_shape_bank_geometry()`) reads control-point data from the param block region of shape bank headers and generates vertex/index geometry. The param block offset and size are stored in ShapeHeaderV1 words 9-10. Generated vertices go into a SEPARATE vertex buffer and indices into a SEPARATE index buffer -- they do NOT remain in the shape bank payload heap.
**Gap**: Spec says payload heap is within the shape bank buffer itself. Implementation extracts geometry FROM the shape bank and uploads it to separate GPU buffers (`vertex_buffer`, `index_buffer`). The shape bank on GPU only contains headers, not rendered geometry. Geometry is extracted CPU-side and uploaded to dedicated GPU buffers.
**Classification**: TO-REVIEW

**Rationale**: Using dedicated vertex/index buffers is more efficient for rendering (vertex fetch from VERTEX-usage buffer is faster than from STORAGE buffer on most GPUs). This is arguably better than the spec's monolithic approach.
