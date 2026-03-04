> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Runtime Loop: The Draw Prep Dispatch (The "Logistics")**.

This document defines the intermediate step between Physics Simulation and Rasterization. Draw Prep converts simulation counters and topology metadata into hardware-valid indirect draw commands.

# The Runtime Loop: The Draw Prep Dispatch

## Related Contracts

- `docs/WebGPU-Complete/IMPLEMENTATION-INDEX.md`
- `docs/WebGPU-Complete/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/WebGPU-Complete/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`
- `docs/WebGPU-Complete/P3-2_GPU_Compute_Dispatch_Explained.md`
- `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`

**Objective:** Translate simulation state into valid WebGPU indirect commands.

**Invariant:** The indirect buffer must be fully populated before Render Pass begins.

**Mechanism:** Canonical static draw-prep compute kernel + compiler-emitted metadata records.

## 1. Architectural Necessity

Why not write indirect args in the physics kernel?

- Physics threads map to particles.
- Indirect records map to draw sinks.
- Mixed ownership causes contention/races.

So we decouple:

1. Physics/Culling computes visibility counts.
2. Draw Prep emits one command per sink record.

## 2. Dispatch Geometry and Ownership

### 2.1 Canonical Dispatch Shape

Draw Prep executes per sink record:

- `dispatchWorkgroups(1)` per record
- `workgroup_size = 1`
- one active invocation writes one command

`recordIndex` identifies destination slot.

### 2.2 Canonical Shader Ownership

Draw Prep kernel is static and immutable.

- Compiler emits metadata only (`drawPrepProgram.sinks`).
- Runtime does not accept draw-prep WGSL source overrides.
- `drawPrepShaderWgsl`-style payloads are rejected.

### 2.3 Output Streams

Draw Prep writes to two non-overlapping regions in one physical indirect buffer:

- indexed region: 20-byte `DrawIndexedIndirectArgs`
- non-indexed region: 16-byte `DrawIndirectArgs`

## 3. Canonical Kernel Contract (WGSL)

```wgsl
struct DrawPrepParams {
  // v0 = [drawMode, countOrIndexCount, firstOrFirstIndex, baseVertexBits]
  v0: vec4<u32>,
  // v1 = [instanceCount, firstInstance, recordIndex, _reserved]
  v1: vec4<u32>,
  // v2 = [indexedRegionBaseWords, nonIndexedRegionBaseWords, indexedStrideWords, nonIndexedStrideWords]
  v2: vec4<u32>,
};

@group(0) @binding(0) var<storage, read_write> indirectWords: array<u32>;
@group(0) @binding(1) var<uniform> drawPrepParams: DrawPrepParams;

@compute @workgroup_size(1)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x > 0u) { return; }

  let drawMode = drawPrepParams.v0.x; // 0 = indexed, 1 = non-indexed
  let instanceCount = drawPrepParams.v1.x;
  let firstInstance = drawPrepParams.v1.y;
  let recordIndex = drawPrepParams.v1.z;

  if (drawMode == 0u) {
    // indexed: [indexCount, instanceCount, firstIndex, baseVertex, firstInstance]
    let base = drawPrepParams.v2.x + recordIndex * drawPrepParams.v2.z;
    indirectWords[base + 0u] = drawPrepParams.v0.y;
    indirectWords[base + 1u] = instanceCount;
    indirectWords[base + 2u] = drawPrepParams.v0.z;
    indirectWords[base + 3u] = drawPrepParams.v0.w;
    indirectWords[base + 4u] = firstInstance;
  } else {
    // non-indexed: [vertexCount, instanceCount, firstVertex, firstInstance]
    let base = drawPrepParams.v2.y + recordIndex * drawPrepParams.v2.w;
    indirectWords[base + 0u] = drawPrepParams.v0.y;
    indirectWords[base + 1u] = instanceCount;
    indirectWords[base + 2u] = drawPrepParams.v0.z;
    indirectWords[base + 3u] = firstInstance;
  }
}
```

Note: actual uniform packing/fields are runtime-defined, but ABI of emitted indirect commands is fixed.

## 4. Visibility and Culling Integration

### 4.1 Counter Reset

Before physics dispatch, counters are reset.

### 4.2 Physics Role

Physics/Culling updates visibility and compaction structures.

### 4.3 Draw Prep Role

Draw Prep reads final counters and writes ABI-correct commands for each sink record.

## 5. Multi-Layer Ordering

Layer order stays deterministic via sink ordering.

- Draw record 0: background
- Draw record 1: mid
- Draw record 2: foreground

Runtime executes records in this order for stable blending.

## 6. Ribbon Special Case

Ribbons are topology-generated trails and use the **non-indexed** stream.

- Input: history count `N`
- Output command:
  - `vertexCount = (N - 1) * 2`
  - `instanceCount = 1`
  - `firstVertex = 0`
  - `firstInstance = trailInstanceBase`

No indexed command is emitted for ribbon virtual topology.

## 7. Synchronization

Required ordering:

1. Physics/Culling writes counters.
2. Draw Prep reads counters and writes indirect regions.
3. Render reads indirect regions.

Use separate compute/render passes; WebGPU pass boundaries provide visibility guarantees.

## 8. Summary of Implementation

1. Update `CompiledProgramIR` to emit draw-prep sink metadata (draw mode, topology refs, region index).
2. Keep one canonical static draw-prep shader module.
3. Runtime dispatches draw prep once per record via `dispatchWorkgroups(1)`.
4. Runtime executes indexed and non-indexed indirect loops from separate regions.
5. Keep counters/compaction buffers in arena/state layout with deterministic ownership.

This keeps draw command generation GPU-owned while matching strict WebGPU indirect ABI constraints.
