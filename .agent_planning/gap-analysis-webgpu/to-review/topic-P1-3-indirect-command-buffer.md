# P1-3: GPU-Driven Rendering (Indirect Command Buffer) - TO-REVIEW Items

## Item 1: Indexed Stream Layout (20 Bytes, 5 Words) Matches Spec
**Spec says**: Section 2.1: "Every indexed command occupies exactly 20 bytes (5 words): indexCount, instanceCount, firstIndex, baseVertex, firstInstance."
**Implementation**: `memory.rs:3` defines `pub const INDIRECT_WORDS_PER_RECORD: usize = 5` and `pub const INDIRECT_INDEXED_STRIDE_WORDS: usize = 5`. The draw-prep shader (`compute.rs:72-77`) writes exactly 5 words: `count@base+0`, `instanceCount@base+1`, `first@base+2`, `baseVertex@base+3`, `firstInstance@base+4`. The `IndirectArgsRecord` type in `WebGPUIndirectArgsInspector.ts:13-19` has the correct 5 fields. Compiler IR at `program.ts:392` specifies `indirectStrideBytes: 20 | 16`.
**Gap**: Exact match for indexed stream. WebGPU ABI is correctly respected.
**Classification**: DONE

## Item 2: Non-Indexed Stream Layout (16 Bytes, 4 Words)
**Spec says**: Section 2.2: "Every non-indexed command occupies exactly 16 bytes (4 words): vertexCount, instanceCount, firstVertex, firstInstance."
**Implementation**: `memory.rs:10` defines `pub const INDIRECT_NON_INDEXED_STRIDE_WORDS: usize = 4`. The draw-prep shader (`compute.rs:83-91`) writes 4 words for non-indexed: `count@base+0`, `instanceCount@base+1`, `first@base+2`, `firstInstance@base+3`. The render pass at `render.rs:215-219` calls `draw_indirect()` for non-indexed records with correct byte offset calculation.
**Gap**: Exact match for non-indexed stream.
**Classification**: DONE

## Item 3: Two-Region Buffer Layout
**Spec says**: Section 2.3: "One physical indirect GPU buffer with fixed regions: Region A (indexed, stride=20), Region B (non-indexed, stride=16)."
**Implementation**: `IndirectRegionPlan` in `render.rs:53-62` carries `indexed_region_base_words`, `non_indexed_region_base_words`, `indexed_stride_words`, `non_indexed_stride_words`, `indexed_record_count`, `non_indexed_record_count`. The engine at `engine.rs:1138-1148` reads these from the sink table header (words 2-7). One physical `indirect_buffer` in `memory.rs:72` is shared for both.
**Gap**: Matches spec. One buffer, two non-overlapping regions with separate base offsets and strides.
**Classification**: DONE

## Item 4: Draw Prep Is a Compute Shader, Not CPU-Side
**Spec says**: Section 3: "Draw Prep" is a compute shader that reads sink metadata and writes indirect commands.
**Implementation**: `DEFAULT_DRAW_PREP_WGSL` in `compute.rs:3-93` is a compute shader dispatched with `@workgroup_size(1)`. It reads from `sinkTableWords` (binding 0, read) and writes to `indirectWords` (binding 2, read_write). The dispatch at `compute.rs:508-524` is `dispatch_workgroups(draw_prep_record_count, 1, 1)` -- one workgroup per record.
**Gap**: Draw prep IS a compute shader as spec requires. The dispatch uses workgroup_size(1) which means each record is processed by exactly one thread. This is inefficient for large record counts but correct.
**Classification**: TO-REVIEW

**Rationale**: Using workgroup_size(1) means no parallelism within a workgroup. For small record counts this is fine. For larger counts, a wider workgroup with thread-per-record would be more efficient.

## Item 5: Indirect Buffer Usage Flags
**Spec says**: Section 7, Requirement 1: "Create one persistent indirect GPU buffer (INDIRECT | STORAGE | COPY_DST)."
**Implementation**: `memory.rs:574-585` creates the indirect buffer with `STORAGE | INDIRECT | COPY_DST | COPY_SRC`. The extra `COPY_SRC` flag enables debug readback but is not in the spec.
**Gap**: Has COPY_SRC beyond what spec requires. This is harmless and enables debug features.
**Classification**: DONE (extra flag is additive, not violating)

## Item 6: Runtime Renders Two Indirect Streams
**Spec says**: Section 7, Requirement 3: "RenderAssembler executes two indirect streams (indexed + non-indexed) from the shared buffer."
**Implementation**: `render.rs:207-221` iterates indexed records with `draw_indexed_indirect()` and non-indexed records with `draw_indirect()`, both from `arena.indirect_buffer` with correct byte offsets. This matches the spec requirement of two independent loops reading from the same buffer.
**Gap**: Exact match. Two loops, one buffer, correct byte offsets per-record.
**Classification**: DONE
