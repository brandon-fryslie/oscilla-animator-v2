# Context: P3-3 - GPU Draw Prep

## Target State
Spec describes a canonical draw-prep kernel that reads per-dispatch uniform params and writes indirect draw commands. Three-pass pipeline: physics -> draw prep -> render.

## Current State
Implementation has a four-pass pipeline: simulation -> instance assembly -> draw prep -> render. The draw prep shader reads directly from the sink table storage buffer rather than per-dispatch uniform params. Instance assembly is an additional compute pass that converts SoA arena channels to AoS instance data.

Key files:
- `src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:3-527`
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:57-300,896-934`

## Files Involved
- `src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs`
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`

## Suggested Approach
The implementation's approach (sink-table-driven draw prep + instance assembly) is architecturally cleaner than the spec's per-dispatch uniform model. Update the spec to document:
1. The instance assembly intermediate pass
2. The table-driven draw prep approach
3. The atomicAdd for instance count accumulation

## Risks
- Instance assembly is a bottleneck candidate for very large instance counts
- The extra compute pass adds latency but enables cleaner data flow
