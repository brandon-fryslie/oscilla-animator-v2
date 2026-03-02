> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Runtime Loop: The Draw Prep Dispatch (The "Logistics")**.

This document defines the critical intermediate step between the Physics Simulation and the Rasterization. It details how the GPU self-organizes its own drawing commands, enabling features like occlusion culling, dynamic particle counts, and trail rendering without the CPU ever needing to know "how many" things exist.

# The Runtime Loop: The Draw Prep Dispatch

**Objective:** Translate the raw simulation state (Active Counts) into valid Draw Commands (DrawIndexedIndirectArgs).

**Invariant:** The IndirectCommandBuffer must be fully populated with valid draw arguments for every active render block *before* the Render Pass begins.

**Mechanism:** A dedicated Compute Pass with a 1:1 mapping between "Render Blocks" and "Workgroups".

## 1. The Architectural Necessity

Why do we need this step? Why can't the Main Physics Kernel just write the draw arguments?

**The "Scatter" Problem:**

- **Physics Kernel:** Threads map to *Particles* (10,000 threads).

- **Draw Arguments:** Map to *Draw Calls* (5 threads).

- **Conflict:** If 10,000 threads try to write to index 0 of the Indirect Buffer, you get a race condition. You would need atomic operations which serialize the pipeline.

**The Solution:**

We decouple "Simulation" from "Logistics."

1.  **Physics Kernel:** Updates positions and atomically increments an ActiveInstanceCount in the Arena.

2.  **Draw Prep Kernel:** Launches exactly **1 thread per Render Block**. It reads that final ActiveInstanceCount and writes the DrawArgs once.

## 2. The Kernel Geometry (1:1 Mapping)

This kernel is small but vital. It runs extremely fast.

### 2.1 The Dispatch Size

Draw-prep dispatch is per prepared indirect record, not one bulk dispatch over all render blocks.

- **Dispatch per record:** `dispatchWorkgroups(1)`
- **Workgroup size:** `drawPrepWorkgroupSize = 1`
- **Invocation count per dispatch:** exactly one active invocation (`gid.x == 0`)

The renderer executes this dispatch once for each prepared draw record so `drawPrepParams.v1.y` (`recordIndex`) identifies which indirect slot to update.

### 2.2 The Thread Responsibility

- **Thread ID:** `global_id.x` is only a local guard (`gid.x > 0u` returns immediately).
- **Input:** `DrawPrepParams` uniform payload for one record (`indexCount`, `instanceCount`, `firstInstance`, `recordIndex`, `maxRecords`).
- **Output:** `indirectArgs[recordIndex * 5 .. +4]`.

## 3. The Shader Logic (draw_prep.wgsl)

The draw-prep shader is a canonical static kernel. The compiler emits only draw-prep sink metadata (`sinkIndex`, `indirectRecordIndex`, `instanceCountMode`, `staticInstanceCount`) and the runtime resolves static-vs-dynamic instance counts before dispatch.

Runtime input does not accept draw-prep WGSL source overrides. Any legacy `drawPrepShaderWgsl` payload is rejected at the render boundary to preserve one canonical kernel contract.

Code snippet:

```wgsl
struct DrawPrepParams {
  // v0 = [indexCount, instanceCount, firstIndex, baseVertexBits]
  v0: vec4<u32>,
  // v1 = [firstInstance, recordIndex, maxRecords, _]
  v1: vec4<u32>,
};

@group(0) @binding(0) var<storage, read_write> indirectArgs: array<u32>;
@group(0) @binding(1) var<uniform> drawPrepParams: DrawPrepParams;

@compute @workgroup_size(1)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x > 0u) {
    return;
  }

  let recordIndex = drawPrepParams.v1.y;
  let maxRecords = drawPrepParams.v1.z;
  if (recordIndex >= maxRecords) {
    return;
  }

  let base = recordIndex * 5u;
  indirectArgs[base + 0u] = drawPrepParams.v0.x;
  indirectArgs[base + 1u] = drawPrepParams.v0.y;
  indirectArgs[base + 2u] = drawPrepParams.v0.z;
  indirectArgs[base + 3u] = drawPrepParams.v0.w;
  indirectArgs[base + 4u] = drawPrepParams.v1.x;
}
```

## 4. The Visibility Logic (Culling Integration)

This phase allows us to implement **Frustum Culling** cheaply.

### 4.1 The Counter Reset

Before the Physics Kernel runs, we must reset the ActiveInstanceCount to zero.

- **Mechanism:** device.queue.writeBuffer(arena_counters, 0, \[0, 0, 0...\]).

- **Timing:** Before the Compute Dispatch.

### 4.2 The Physics Kernel's Role

Inside the main simulation:

1.  **Update Position:** pos += vel \* dt.

2.  **Check Bounds:** if (pos.x \> screen.right \|\| pos.x \< screen.left) { return; }

3.  **Compaction:**

    - If visible, perform index = atomicAdd(&counter, 1u).

    - Write InstanceID to a VisibleIndices buffer at index.

    - *Note:* This effectively creates a "Compacted List" of visible particles.

### 4.3 The Draw Prep's Role

The Draw Prep kernel reads that final atomic counter value.

- If 500 particles were visible, instance_count becomes 500.

- The Renderer draws 500 instances.

- The Vertex Shader reads VisibleIndices\[InstanceID\] to know *which* particle to draw.

## 5. Handling "Multi-Layer" Rendering

Oscilla supports "Layers" (Background, Mid, Foreground). These are just sequential Draw Commands in the Indirect Buffer.

### 5.1 The Sort Order

The Compiler determines the order of the switch statement based on the Z-Index or connection order in the graph.

- **Draw ID 0:** Background (Z = -10)

- **Draw ID 1:** Mid (Z = 0)

- **Draw ID 2:** Foreground (Z = 10)

This ensures that when the CPU loops drawIndexedIndirect from 0 to N, the alpha blending works correctly.

## 6. The "Trail" Renderer Special Case

Rendering trails (ribbons) is complex because it involves **Topology Generation** inside the Draw Prep.

### 6.1 The Problem

A trail is not "Instances". It is a single long Triangle Strip.

- **Input:** 1000 history points in the Arena.

- **Output:** 1 Draw Call with VertexCount = 2000 (2 vertices per point for thickness).

### 6.2 The Logic

For a Trail Block, the Draw Prep kernel logic changes:

1.  **Read History Count:** N = 1000.

2.  **Calculate Vertex Count:** V = (N - 1) \* 2.

3.  **Write Command:**

    - vertex_count = V (Direct vertex drawing, no indices usually).

    - instance_count = 1.

    - first_vertex = 0.

This allows the trail length to grow and shrink dynamically based on the simulation state (e.g., "Fade out old segments").

## 7. Synchronization (Barriers)

This is the most common source of "flickering" bugs.

### 7.1 The Hazard

1.  **Physics Kernel:** Writes to Arena_Counters.

2.  **Draw Prep Kernel:** Reads Arena_Counters.

3.  **Render Pass:** Reads IndirectBuffer.

### 7.2 The Solution

We must ensure memory coherency.

- **Between Physics & Draw Prep:**

  - If they are in the *same* Compute Pass: Insert workgroupBarrier() or distinct dispatch calls.

  - **Recommendation:** Use **Two Separate Compute Passes**. The driver inserts an implicit memory barrier between EndComputePass and BeginComputePass. It is safer and the overhead is negligible (microseconds).

- **Between Draw Prep & Render:**

  - Implicit barrier exists between EndComputePass and BeginRenderPass.

## 8. Summary of Implementation

1.  **Update CompiledProgramIR:** Add a RenderBlockTable that maps BlockID \$\to\$ DrawIndex.

2.  **Use canonical draw_prep.wgsl:**

    - Keep one static shader module for draw-prep dispatch.

    - Consume compiler-emitted sink metadata to resolve instance-count policy per record.

3.  **Update RuntimeExecutor:**

    - Add the DrawPrep pipeline creation.

    - Add the DrawPrep dispatch call (dispatch(ceil(render_count / 64))) *after* the main physics dispatch.

4.  **Allocate Buffers:** Ensure Arena has a dedicated region for Counters (Atomics).

This step transforms the GPU from a generic calculator into an autonomous rendering engine. It bridges the gap between "Simulating the Universe" and "Drawing the Picture."
