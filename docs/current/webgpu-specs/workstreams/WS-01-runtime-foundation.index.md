# Workstream 01: Runtime Foundation

// [LAW:one-source-of-truth] This workstream owns foundational runtime contracts; dependent workstreams reference, not redefine.

## Purpose

Define canonical runtime memory and data contracts that all other workstreams build on.

## Scope (Owned Docs)

- `docs/current/webgpu-specs/P0-0__Overview_-_GPU-Native_Visual_Instrument_Architecture.md`
- `docs/current/webgpu-specs/P0-1__SoA_Mandate__Memory_Layout_Refactor.md`
- `docs/current/webgpu-specs/P0-2__Phase-Locking_for_Infinite_Runtime.md`
- `docs/current/webgpu-specs/P0-3__Refactoring_to_Handle-Based_Architecture.md`
- `docs/current/webgpu-specs/P1-1__Unified_GPU_Buffer_Strategy_Explained.md`
- `docs/current/webgpu-specs/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/current/webgpu-specs/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`

## Contracts Produced

1. Canonical Arena SoA layout and address ownership.
2. Canonical handle model and shape metadata ownership (`ShapeHeaderV1`).
3. Canonical indirect command ABI (indexed + non-indexed streams).
4. Canonical time/phase stability contract.

## Workstream Dependencies

- No upstream dependency within WebGPU-Complete.

## Downstream Consumers

- `docs/current/webgpu-specs/workstreams/WS-02-compiler-lowering.index.md`
- `docs/current/webgpu-specs/workstreams/WS-03-frame-execution.index.md`
- `docs/current/webgpu-specs/workstreams/WS-04-shape-taxonomy.index.md`
- `docs/current/webgpu-specs/workstreams/WS-05-platform-dx-policy.index.md`

## Primary Functional Slices

- `docs/current/webgpu-specs/workstreams/slices/S01-first-pixel.md`
- `docs/current/webgpu-specs/workstreams/slices/S02-first-type1-shape.md`

