# Workstream 02: Compiler and Lowering Boundary

// [LAW:single-enforcer] Compiler semantics are enforced at one lowering/validation boundary.

## Purpose

Define how graph logic becomes validated shader artifacts without ad-hoc code paths.

## Scope (Owned Docs)

- `docs/WebGPU-Complete/P2-1_Async_Compiler_Service_Architecture.md`
- `docs/WebGPU-Complete/P2-2__Naga_Compiler_Lowering_Pipeline_Explained.md`
- `docs/WebGPU-Complete/P2-3__Naga_WASM_Compiler_Validation_Layer.md`
- `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`

## Contracts Produced

1. Canonical scoped IR lowering boundary.
2. Canonical validation/emission boundary (WASM/Naga).
3. Canonical async compile lifecycle and handoff contract.
4. Source-mapped error ownership for runtime/editor feedback.

## Workstream Dependencies

- `docs/WebGPU-Complete/workstreams/WS-01-runtime-foundation.index.md`

## Downstream Consumers

- `docs/WebGPU-Complete/workstreams/WS-03-frame-execution.index.md`
- `docs/WebGPU-Complete/workstreams/WS-04-shape-taxonomy.index.md`
- `docs/WebGPU-Complete/workstreams/WS-05-platform-dx-policy.index.md`

## Primary Functional Slices

- `docs/WebGPU-Complete/workstreams/slices/S01-first-pixel.md`
- `docs/WebGPU-Complete/workstreams/slices/S02-first-type1-shape.md`

