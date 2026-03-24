# Workstream 02: Compiler and Lowering Boundary

// [LAW:single-enforcer] Compiler semantics are enforced at one lowering/validation boundary.

## Purpose

Define how graph logic becomes validated shader artifacts without ad-hoc code paths.

## Scope (Owned Docs)

- `docs/current/webgpu-specs/P2-1_Async_Compiler_Service_Architecture.md`
- `docs/current/webgpu-specs/P2-2__Naga_Compiler_Lowering_Pipeline_Explained.md`
- `docs/current/webgpu-specs/P2-3__Naga_WASM_Compiler_Validation_Layer.md`
- `docs/current/webgpu-specs/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`

## Contracts Produced

1. Canonical scoped IR lowering boundary.
2. Canonical validation/emission boundary (WASM/Naga).
3. Canonical async compile lifecycle and handoff contract.
4. Source-mapped error ownership for runtime/editor feedback.

## Workstream Dependencies

- `docs/current/webgpu-specs/workstreams/WS-01-runtime-foundation.index.md`

## Downstream Consumers

- `docs/current/webgpu-specs/workstreams/WS-03-frame-execution.index.md`
- `docs/current/webgpu-specs/workstreams/WS-04-shape-taxonomy.index.md`
- `docs/current/webgpu-specs/workstreams/WS-05-platform-dx-policy.index.md`

## Primary Functional Slices

- `docs/current/webgpu-specs/workstreams/slices/S01-first-pixel.md`
- `docs/current/webgpu-specs/workstreams/slices/S02-first-type1-shape.md`

