# P3-3: GPU Draw Prep - TRIVIAL Items

## Item 1: Workgroup Size = 1 Per Record
**Spec says**: Draw Prep dispatches per sink record with `dispatchWorkgroups(1)` per record and `workgroup_size = 1`.
**Implementation**: Draw prep shader has `@workgroup_size(1)` (`compute.rs:29`). Dispatch count is `draw_prep_record_count.max(1)` (`compute.rs:522`), meaning all records are dispatched in a single `dispatchWorkgroups(N)` call where each invocation handles one record via `gid.x`.
**Gap**: Slightly different dispatch model: spec says dispatch once per record (`dispatchWorkgroups(1)` N times), implementation dispatches once for all records (`dispatchWorkgroups(N)` once). Functionally equivalent since each invocation only processes its `gid.x` record.
**Classification**: TRIVIAL

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:29,508-524`

## Item 2: Draw Prep Shader Is Static and Immutable
**Spec says**: Draw Prep kernel is static and immutable. Compiler emits metadata only. Runtime does not accept draw-prep WGSL source overrides.
**Implementation**: Draw prep shader is a const string `DEFAULT_DRAW_PREP_WGSL` compiled once at `ComputeDispatcher::new()`. No API exists to override or replace it. `rebuild_gpu_pipelines_with_compiler_wgsl()` only rebuilds simulation pipelines, not draw prep.
**Gap**: None. Implementation matches spec requirement exactly.
**Classification**: TRIVIAL (confirmed match)

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:3-93` (DEFAULT_DRAW_PREP_WGSL)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:437-449` (rebuild only touches simulation)

## Item 3: Two Output Streams (Indexed and Non-Indexed)
**Spec says**: Draw Prep writes to two non-overlapping regions: indexed (20-byte DrawIndexedIndirectArgs) and non-indexed (16-byte DrawIndirectArgs).
**Implementation**: Draw prep shader handles both indexed (5 words = 20 bytes) and non-indexed (4 words = 16 bytes) modes via `drawMode` discriminant (`compute.rs:64-91`). Region offsets are read from sink table header. `INDIRECT_INDEXED_STRIDE_WORDS = 5`, `INDIRECT_NON_INDEXED_STRIDE_WORDS = 4` (`memory.rs:9-10`).
**Gap**: None. Implementation matches spec byte sizes and region separation.
**Classification**: TRIVIAL (confirmed match)

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:64-91`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:9-10`
