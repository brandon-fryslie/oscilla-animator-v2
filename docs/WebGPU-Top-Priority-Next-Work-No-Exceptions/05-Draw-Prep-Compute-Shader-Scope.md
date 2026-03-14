# 05 - Draw Prep Compute Shader Scope

Spec target: `../WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`, `../WebGPU-Complete/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`

// [LAW:one-source-of-truth] The indirect buffer should be derived from canonical GPU-resident program state, not from a CPU-prepared command stream that the GPU merely copies.

## Where We Are

- `src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:3-85` defines draw-prep WGSL that mainly copies `count`, `instanceCount`, `first`, `baseVertex`, and `firstInstance` from `sinkTableWords` into `indirectWords`.
- The shader does not derive those fields from arena state, ShapeBank records, or GPU-owned instance counts.
- The CPU therefore still owns most of the logic that the spec describes as draw-prep.

## First Draft Proposal

- Expand draw-prep compute so it reads canonical ShapeBank and arena bindings directly.
- Draw-prep should own runtime command derivation: visible record count, draw counts, base offsets, `firstInstance`, and any shape-class-specific command shaping.
- Keep the indirect buffer as the single output artifact of draw-prep. Remove the need for CPU-prepared command records except for immutable compile-time metadata, if any.
- The practical milestone is not "GPU writes indirect args". It is "GPU decides what the indirect args are from canonical state".
