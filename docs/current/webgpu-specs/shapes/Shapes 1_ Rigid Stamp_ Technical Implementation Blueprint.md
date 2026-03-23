This document defines implementation details for Type 1 (Rigid) shapes.

# Shape Taxonomy: Type 1 (Rigid Stamp)

## Related Contracts

- `docs/current/webgpu-specs/IMPLEMENTATION-INDEX.md`
- `docs/current/webgpu-specs/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/current/webgpu-specs/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`
- `docs/current/webgpu-specs/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/current/webgpu-specs/P3-4__WebGPU_Render_Pass_Deep_Dive.md`

## 1. Data Contract

### 1.1 Compile-Time Inputs

1. Triangulated local geometry (positions + optional normals/UVs).
2. Material class metadata.
3. Optional bounds override.

### 1.2 Runtime Inputs

1. `ShapeHeaderV1` record for each rigid shape.
2. Arena channels for per-instance transform/state:
   - `posX`, `posY`
   - `rot`
   - `scale` (or equivalent transform params)

### 1.3 Outputs

1. Rasterized fragments in render targets.
2. Indexed indirect records emitted by draw-prep for compatible rigid buckets.

## 2. Canonical ShapeBank Packing

Rigid shapes use canonical `ShapeHeaderV1` (16 words / 64 bytes). Relevant fields:

1. `kind = rigid`
2. `topologyMode = indexed`
3. `indexCount`, `firstIndex`, `baseVertex`
4. optional `paramBlockOffset`, `paramBlockWords`
5. packed bounds

Payload heap contains index/vertex-related payload referenced by header fields.

## 3. Hard Invariants

1. Rigid topology payload is immutable during frame loop.
2. Draw-prep must split incompatible rigid records (topology/material differences).
3. Vertex local origin conventions must be consistent with transform math and bounds.
4. Header schema must remain canonical (`ShapeHeaderV1`); no per-shape custom header format.

## 4. Common Pitfalls

1. Overly wide vertex payloads increase fetch and register pressure.
2. Bit-cast handling between `Float32Array` and `Uint32Array` must preserve exact bit patterns.
3. Extremely complex imported geometry should be simplified before upload to avoid oversized index ranges.

## 5. Machine-Verifiable Acceptance Criteria

### Phase 1: Packing and Metadata

1. **AC 1.1 (Header Stride):**
   - Test: allocate two rigid shapes.
   - Assert: second header starts exactly 16 words after first.
2. **AC 1.2 (Bit-Cast Integrity):**
   - Test: write representative float payload values through `Uint32Array` view.
   - Assert: round-trip decode is bit-exact.
3. **AC 1.3 (Bucket Split):**
   - Test: sink receives mixed rigid shape IDs.
   - Assert: draw-prep emits separate indexed records per compatible bucket.

### Phase 2: Shader and Render

1. **AC 2.1 (Transform Correctness):**
   - Test: controlled transform fixture (position/rotation/scale).
   - Assert: clip-space output matches expected world transform within epsilon.
2. **AC 2.2 (Bounds/Culling Consistency):**
   - Test: shape crosses frustum edge.
   - Assert: draw-prep visibility count and final rasterization agree.
3. **AC 2.3 (ABI Safety):**
   - Test: run indirect record decode in headless render.
   - Assert: all indexed calls consume 20-byte stride records only.

## 6. Implementation Checklist

1. Implement rigid shape allocator against canonical header schema.
2. Ensure compiler emits rigid sink metadata for draw-prep bucketing.
3. Keep tests for packing, bucketing, and ABI correctness in CI.

