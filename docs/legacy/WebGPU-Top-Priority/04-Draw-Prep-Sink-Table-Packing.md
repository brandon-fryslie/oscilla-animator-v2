# 04 - Draw Prep Sink Table Packing

Spec target: `../WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`, `../WebGPU-Complete/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`

// [LAW:single-enforcer] Draw-prep ownership should sit in one GPU boundary. The CPU should not duplicate command derivation logic that draw-prep compute is supposed to own.

## Where We Are

- `src/runtime/DrawPrepSinkTablePacker.ts:79-96` resolves arena addresses on the CPU.
- `src/runtime/DrawPrepSinkTablePacker.ts:112-151` reads shape handles from the CPU arena and enforces homogeneous handles per sink on the CPU.
- `src/runtime/DrawPrepSinkTablePacker.ts:165-193` resolves sink instance counts on the CPU, including dynamic count lookup from `RuntimeState.cache`.
- `src/runtime/DrawPrepSinkTablePacker.ts:216-235` reads ShapeBank headers on the CPU to derive draw counts and offsets.
- `src/runtime/DrawPrepSinkTablePacker.ts:238-363` computes record ordering, `firstInstance` prefix sums, descriptor addresses, and writes the full sink-table word stream on the CPU.

## First Draft Proposal

- Narrow the CPU contribution to compile-time sink metadata only: stable sink ordering, slot identity, and any immutable per-sink descriptors.
- Move runtime-dependent values to GPU draw-prep: shape-handle dereference, header reads, dynamic instance count resolution, and `firstInstance` prefix sums.
- Let the GPU derive indirect command fields directly from canonical arena and ShapeBank storage instead of from a CPU-packed mirror table.
- Keep one upload path for static draw-prep metadata if needed, but stop CPU-authoring the per-frame record payload.
