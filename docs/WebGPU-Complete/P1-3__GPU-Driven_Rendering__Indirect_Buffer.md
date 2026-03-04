> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Unified Buffer Strategy: The "Indirect Command" Buffer**.

This document defines the architecture for **GPU-Driven Rendering**. It describes the mechanism that allows the GPU to determine *how much* to draw without CPU intervention, enabling features like particle culling and dynamic topology generation at zero CPU cost.

# The Unified Buffer Strategy: The "Indirect Command" Buffer

**Objective:** Decouple the CPU from draw-call parameters.

**Invariant:** The CPU never writes dynamic draw counts (`instanceCount`, `vertexCount`, `indexCount`) during the frame loop.

**Mechanism:** A storage | indirect buffer populated by a dedicated Compute Pass ("Draw Prep") and consumed by the Render Pass.

## 1. The Philosophy: The GPU as the Pilot

In a traditional (direct) render loop, the CPU must know exactly how many items to draw:

`draw(vertexCount: 6, instanceCount: 1000)`

This fails in a generative system where visibility/topology are resolved on GPU.

- **Scenario:** A "Life" simulation where cells die.
- **Problem:** CPU does not know final visible count without expensive readback.
- **Solution:** GPU computes draw counts and writes hardware-native indirect commands.

## 2. The Memory Layout (Hardware-Native ABI)

WebGPU indirect APIs have strict byte layouts. We must respect these exactly.

### 2.1 Indexed Stream (`drawIndexedIndirect`)

Every indexed command occupies exactly **20 bytes** (5 words).

| **Offset** | **Field Name** | **Type** | **Description** |
|----|----|----|----|
| 0 | indexCount | u32 | Number of indices to draw. |
| 1 | instanceCount | u32 | Dynamic visible count. |
| 2 | firstIndex | u32 | Offset into index payload. |
| 3 | baseVertex | i32 | Added to each index before vertex fetch. |
| 4 | firstInstance | u32 | Offset into instance stream. |

### 2.2 Non-Indexed Stream (`drawIndirect`)

Every non-indexed command occupies exactly **16 bytes** (4 words).

| **Offset** | **Field Name** | **Type** | **Description** |
|----|----|----|----|
| 0 | vertexCount | u32 | Number of vertices to draw. |
| 1 | instanceCount | u32 | Dynamic visible count. |
| 2 | firstVertex | u32 | Offset into virtual/non-indexed stream. |
| 3 | firstInstance | u32 | Offset into instance stream. |

### 2.3 One Physical Buffer, Two Non-Overlapping Regions

We use one physical indirect GPU buffer with fixed regions:

- **Region A:** indexed records (`stride = 20`).
- **Region B:** non-indexed records (`stride = 16`).

Draw Prep writes both regions. Runtime uses region base offsets when issuing draw calls.

## 3. The Draw Prep Compute Shader

Since CPU cannot own dynamic draw counts efficiently, Draw Prep owns command emission.

### 3.1 Inputs

Draw Prep consumes:

- Arena counters/visibility results.
- Shape/header metadata.
- Compiler-emitted draw-prep sink metadata:
  - `drawMode` (indexed/non-indexed)
  - topology references (`indexCount`, `firstIndex`, `baseVertex`) when indexed
  - non-indexed references (`vertexCount`, `firstVertex`) when non-indexed
  - `firstInstance`, record index, and region info

### 3.2 Output

For each sink record:

1. Read visibility count.
2. Resolve topology fields from shape/sink metadata.
3. Emit either:
   - 20-byte indexed command into Region A, or
   - 16-byte non-indexed command into Region B.

No mixed-format stream is allowed.

## 4. Culling Integration

Indirect command generation enables cheap GPU culling.

### 4.1 Culling Pass

Before Draw Prep:

1. Check bounds/visibility.
2. Compact visible instance IDs.
3. Atomically increment visible counters.

### 4.2 Benefit

- Without indirect: vertex stage runs on invisible instances.
- With indirect: Draw Prep writes reduced counts; vertex stage runs only for visible work.

## 5. Handling Multi-Sink Rendering

Oscilla supports multiple render sinks/layers. Compiler assigns stable record indices.

### 5.1 Record Mapping

- `Render_Background -> indexed or non-indexed record`
- `Render_Foreground -> indexed or non-indexed record`

### 5.2 Runtime Execution

1. Bind indirect buffer once.
2. Indexed loop:
   - `drawIndexedIndirect(indirectBuffer, indexedRegionBase + i * 20)`
3. Non-indexed loop:
   - `drawIndirect(indirectBuffer, nonIndexedRegionBase + j * 16)`

## 6. Synchronization & Barriers

Required ordering within a frame:

1. Physics/Culling writes counters.
2. Draw Prep reads counters and writes indirect records.
3. Render pass reads indirect records.

WebGPU pass boundaries provide required visibility guarantees:

- EndComputePass -> BeginRenderPass ensures Draw Prep writes are visible to render reads.

## 7. Canonical Requirements

1. **Allocation:** Create one persistent indirect GPU buffer (`INDIRECT | STORAGE | COPY_DST`) with fixed indexed/non-indexed regions.
2. **Draw Prep Ownership:** Use one canonical static draw-prep kernel; compiler emits structured metadata only.
3. **Runtime Integration:** RenderAssembler executes two indirect streams (indexed + non-indexed) from the shared buffer.
4. **Debug View:** Add async inspector readback for command counts and region occupancy.

This completes the GPU-driven command path while staying ABI-correct for WebGPU hardware.
