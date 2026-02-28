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

The Compiler counts the number of Render blocks in the graph. Let's say there are **N** renderers (e.g., a Background, a Main Character, and a Particle System).

- **Dispatch:** dispatchWorkgroups(ceil(N / 64))

- **Workgroup Size:** 64 threads.

- **Active Threads:** Exactly N.

### 2.2 The Thread Responsibility

- **Thread ID (global_id.x):** Corresponds to the **Draw Call Index**.

- **Input:** The "Render Manifest" (a uniform array or hardcoded constants in the shader).

- **Output:** The IndirectCommandBuffer at index global_id.x.

## 3. The Shader Logic (draw_prep.wgsl)

The compiler generates this shader dynamically based on the graph topology. It contains a switch statement or a lookup table to handle the different logic for each draw call.

Code snippet

struct DrawIndexedIndirectArgs {\
vertex_count: u32,\
instance_count: u32,\
first_index: u32,\
base_vertex: i32,\
first_instance: u32,\
}\
\
@group(0) @binding(0) var\<storage, read_write\> indirect_args: array\<DrawIndexedIndirectArgs\>;\
@group(0) @binding(1) var\<storage, read\> shape_bank: array\<u32\>;\
@group(0) @binding(2) var\<storage, read\> arena_counters: array\<atomic\<u32\>\>; // or plain u32\
\
@compute @workgroup_size(64)\
fn main(@builtin(global_invocation_id) global_id: vec3\<u32\>) {\
let draw_id = global_id.x;\
\
// 1. Guard against overshoot\
if (draw_id \>= TOTAL_DRAW_CALLS) { return; }\
\
// 2. Fetch the Configuration for this Draw Call\
// (In v3.0, the compiler often hardcodes these constants into a switch for speed)\
var shape_id: u32;\
var counter_index: u32;\
var base_instance: u32;\
\
switch (draw_id) {\
case 0u: { // Render Block "Background"\
shape_id = 1u; // Square\
counter_index = 0u; // Always 1 instance\
base_instance = 0u;\
}\
case 1u: { // Render Block "Particles"\
shape_id = 5u; // Circle\
counter_index = 1u; // Read dynamic count from Arena\
base_instance = 0u;\
}\
default: { return; }\
}\
\
// 3. Resolve Topology (Read from Shape Bank)\
// We need to know how many indices a "Circle" has.\
let shape_header_offset = shape_id \* 8u;\
let index_count = shape_bank\[shape_header_offset + 1u\];\
let first_index = shape_bank\[shape_header_offset + 2u\];\
\
// 4. Resolve Instance Count (The Dynamic Part)\
// This value was written by the Physics Kernel via atomicAdd\
// OR it is a fixed value (like 1000) if no culling is active.\
let instance_count = atomicLoad(&arena_counters\[counter_index\]);\
\
// 5. Construct the Draw Command\
let cmd = DrawIndexedIndirectArgs(\
index_count,\
instance_count,\
first_index,\
0, // base_vertex (usually 0 for 2D)\
base_instance // offset into the Arena for instance data\
);\
\
// 6. Write to Buffer\
indirect_args\[draw_id\] = cmd;\
}

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

2.  **Generate draw_prep.wgsl:**

    - Write the switch statement generation logic in the Compiler.

    - Ensure constants (Shape IDs) are baked in.

3.  **Update RuntimeExecutor:**

    - Add the DrawPrep pipeline creation.

    - Add the DrawPrep dispatch call (dispatch(ceil(render_count / 64))) *after* the main physics dispatch.

4.  **Allocate Buffers:** Ensure Arena has a dedicated region for Counters (Atomics).

This step transforms the GPU from a generic calculator into an autonomous rendering engine. It bridges the gap between "Simulating the Universe" and "Drawing the Picture."
