# 01 - ShapeBank Canonical Contract

Spec target: `../WebGPU-Complete/P1-2__Unified_GPU_Shape_Bank_Strategy.md`, `../WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`

// [LAW:one-source-of-truth] ShapeBank must be the canonical geometry/topology source, not a staging format that gets expanded into a second CPU mesh representation.

## Where We Are

- `src/runtime/RuntimeState.ts:18-61` defines `ShapeHeaderV1` with fields such as `indexCount`, `firstIndex`, `baseVertex`, and `firstVertex`.
- `src/runtime/ValueExprMaterializer.ts:172-196` writes `ShapeHeaderV1` records into `RuntimeState.shapeBank`.
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:175-273` mutates shape headers during CPU realization by filling `firstVertex`, `firstIndex`, `baseVertex`, and a generated `indexCount`.
- `src/runtime/DrawPrepSinkTablePacker.ts:221-235` then reads those header fields back as if they were canonical draw data.
- `src/render/webgpu/WebGPUShapeBankManager.ts:23-55` exists as a GPU buffer owner for shape-bank words, but the Rust worker path still treats ShapeBank as input to CPU mesh generation rather than the final draw-time source.

## First Draft Proposal

- Freeze `ShapeHeaderV1` as declarative topology metadata plus parameter payload offsets. Do not let worker-side CPU code rewrite header fields during install.
- Any fields that only exist to support classic realized mesh buffers should stop being canonical. If still needed temporarily, derive them in GPU draw-prep or GPU topology lookup passes.
- Render and draw-prep shaders should read ShapeBank storage directly. That keeps one geometry source instead of `ShapeBank -> CPU mesh -> GPU mesh`.
- Keep CPU ownership only for immutable compile-time topology assets. Dynamic frame-volatile shape state should be authored in GPU-visible buffers by GPU work, not by worker-side CPU expansion.
