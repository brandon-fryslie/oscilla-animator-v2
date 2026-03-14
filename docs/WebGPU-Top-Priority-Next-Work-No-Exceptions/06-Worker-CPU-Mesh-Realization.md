# 06 - Worker CPU Mesh Realization

Spec target: `../WebGPU-Complete/P1-2__Unified_GPU_Shape_Bank_Strategy.md`, `../WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`

// [LAW:one-source-of-truth] A realized mesh buffer derived on the worker is a second geometry source. This is the highest-priority replacement seam.

## Where We Are

- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:175-273` walks `ShapeBank` words on the CPU and emits `Vec<f32>` vertex payload and `Vec<u32>` index payload.
- The same function triangulates closed paths with a CPU triangle fan and writes generated counts back into the shape header.
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:796-820` copies shared shape-bank words into a CPU vector, runs mesh realization, uploads vertex/index payload through `write_geometry_payload(...)`, and only then writes the shape-bank words into GPU storage.
- This is the strongest direct evidence that geometry realization is not yet GPU-owned.

## First Draft Proposal

- Delete the worker-side `ShapeBank -> Vec<f32>/Vec<u32>` realization path.
- Replace it with GPU-native geometry consumption:
- Vertex-pulling render path for shape classes whose topology can be interpreted directly from ShapeBank and arena data.
- GPU materialization pass for cases where a temporary expanded topology buffer is still needed, but the expansion itself happens on the GPU.
- Do not let CPU code triangulate paths or populate realized mesh buffers after install.
