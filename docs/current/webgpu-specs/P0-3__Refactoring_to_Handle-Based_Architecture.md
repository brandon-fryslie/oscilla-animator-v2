> Alignment Notice (2026-03-03)
> [LAW:one-source-of-truth] Canonical shape/storage contracts are owned by `docs/current/webgpu-specs/P1-2__Unified_GPU_Shape_Bank_Strategy.md`.
> [LAW:single-enforcer] Handle validity and decode semantics are enforced at compiler/runtime boundaries, not ad-hoc in blocks.
> [LAW:dataflow-not-control-flow] Handle propagation is value-driven through Arena channels; execution order remains fixed.

This document defines the canonical numeric-handle model used by runtime blocks and render assembly.

# Phase 0: Handle-Based Runtime Contract

## Objective

Eliminate object-shaped payloads from the runtime hot path and replace them with stable numeric handles that reference canonical storage banks.

## Related Contracts

- `docs/current/webgpu-specs/IMPLEMENTATION-INDEX.md`
- `docs/current/webgpu-specs/P0-1__SoA_Mandate__Memory_Layout_Refactor.md`
- `docs/current/webgpu-specs/P1-1__Unified_GPU_Buffer_Strategy_Explained.md`
- `docs/current/webgpu-specs/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/current/webgpu-specs/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`
- `docs/current/webgpu-specs/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`

## 1. Canonical Handle Model

1. A handle is a `u32` identity value for a persistent shape/topology record.
2. Runtime numeric channels carry handles as bit-cast values through Arena slots.
3. Blocks pass handles by value; no runtime object references are allowed in hot loops.

Example (forbidden -> canonical):

```ts
// Forbidden: object payload in hot path
return { type: "path", indices: [0, 1, 2] };

// Canonical: numeric handle
return shapeHandleU32;
```

## 2. Storage Ownership

### 2.1 Arena Ownership

Arena stores:

1. numeric state channels (`f32` contract)
2. handle channels (bit-cast payloads where required)
3. per-instance render params

Arena does **not** store shape topology schemas.

### 2.2 ShapeBank Ownership

ShapeBank stores:

1. canonical `ShapeHeaderV1` records (16 words / 64 bytes)
2. payload heap for indices, virtual-topology metadata, and parameter blocks

ShapeBank is the only canonical source for topology metadata.

## 3. Canonical Header Fields (Implementation Summary)

`ShapeHeaderV1` is canonical and includes at least:

1. `kind`
2. `topologyMode`
3. `materialClass`
4. indexed topology refs (`indexCount`, `firstIndex`, `baseVertex`)
5. non-indexed refs (`vertexCount`, `firstVertex`)
6. parameter block refs (`paramBlockOffset`, `paramBlockWords`)
7. packed bounds

Do not introduce alternate header schemas in block-local code.

## 4. Allocator Strategy

### 4.1 Immutable Region

Used for:

1. built-in primitives
2. imported static assets
3. long-lived shape records

### 4.2 Dynamic Region

Used for dynamic/dirty topology updates.

Rules:

1. update dirty slices only
2. update header references atomically with payload updates
3. do not treat full re-upload as default behavior

## 5. Block Responsibilities

### 5.1 Producers (Generators)

1. write numeric output channels to Arena
2. allocate/update shape payload in ShapeBank when topology changes
3. emit a handle channel pointing to canonical header index

### 5.2 Transformers (Deformers)

1. mutate numeric channels in Arena
2. forward handles unchanged unless topology class changes

### 5.3 Consumers (Draw Prep / Renderer)

1. read handle channels
2. resolve `ShapeHeaderV1`
3. emit indexed/non-indexed command records according to header + sink metadata

## 6. Multi-Shape and Batching Contract

1. A render sink may reference many shape handles.
2. Draw-prep must bucket commands into compatible records (topology mode, material/topology compatibility).
3. A single indirect record cannot mix incompatible topology ABI formats.
4. Runtime executes indexed and non-indexed streams separately.

## 7. Prohibited Patterns

1. object-returning geometry blocks in runtime hot paths
2. parallel shape schema definitions outside canonical header docs
3. fallback render paths that bypass handle decode contracts
4. direct per-block command emission that skips draw-prep metadata ownership

## 8. Verification Gates

1. Shape header decode and stride tests (`ShapeHeaderV1` schema + offsets).
2. Handle round-trip tests (write as float payload, decode as `u32` identity).
3. Draw-prep bucketing tests (indexed vs non-indexed record emission).
4. Forbidden-pattern tests blocking object payloads in execution hot paths.

This document defines the implementation contract for handle-based execution. New feature work should extend canonical metadata and tests instead of introducing alternate runtime representations.

