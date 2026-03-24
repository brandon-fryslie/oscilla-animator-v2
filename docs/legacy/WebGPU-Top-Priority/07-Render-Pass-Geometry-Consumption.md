# 07 - Render Pass Geometry Consumption

Spec target: `../WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`, `../WebGPU-Complete/shapes/Shapes 0_ Shape Taxonomy_ A Rendering Overview.md`

// [LAW:one-source-of-truth] The render pass should consume canonical topology/shape data, not a CPU-expanded compatibility mesh.

## Where We Are

- `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:252-317` binds `arena.vertex_buffer` and `arena.index_buffer` before indirect draw calls.
- The render pipeline is therefore still a classic mesh pipeline whose geometry is already realized before draw time.
- The indirect args may be GPU-written, but the actual geometry source is still the worker-authored vertex/index buffers.

## First Draft Proposal

- Rework render bindings so geometry comes from ShapeBank/topology storage and arena payloads instead of dedicated realized mesh buffers.
- For Type 1 and Type 2, prefer vertex pulling from canonical storage.
- For Type 3 and Type 4, consume the shape-class-specific virtual or proxy topology model described by the spec instead of forcing everything through the same realized mesh path.
- Treat `vertex_buffer` and `index_buffer` as migration scaffolding to remove, not as the final architecture.
