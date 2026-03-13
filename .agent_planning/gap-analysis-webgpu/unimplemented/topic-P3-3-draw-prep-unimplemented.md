# P3-3: GPU Draw Prep - UNIMPLEMENTED Items

## Item 1: Ribbon/Virtual Topology Non-Indexed Stream
**Spec says**: Ribbons are topology-generated trails using the non-indexed stream. Input: history count N. Output command: vertexCount = (N-1)*2, instanceCount = 1, firstVertex = 0, firstInstance = trailInstanceBase.
**Implementation**: The draw prep shader handles non-indexed mode generically (`compute.rs:80-91`), but no ribbon-specific vertex count derivation exists. The shader reads count, instanceCount, first, firstInstance from the sink table record for non-indexed mode without ribbon-specific logic.
**Gap**: Ribbon virtual topology is not implemented as a special case. The non-indexed path exists but lacks ribbon-specific vertex count derivation from history count. This would need to be handled by the compiler/sink-table packer setting the correct vertex count.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:80-91`

## Item 2: Culling/Visibility Counter Integration
**Spec says**: Physics/Culling computes visibility counts. Counters are reset before physics dispatch. Draw Prep reads final counters.
**Implementation**: No culling or visibility counter system exists. Draw prep reads instance counts directly from the sink table records, which are set by the CPU-side compiler output. No GPU-side culling determines visibility.
**Gap**: GPU-driven culling is not implemented. Instance counts are statically determined by the compiler, not dynamically by GPU-side visibility tests.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:46-56` (reads instanceCount from sink table)
