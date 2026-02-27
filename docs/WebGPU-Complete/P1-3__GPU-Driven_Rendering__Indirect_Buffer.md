> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Unified Buffer Strategy: The "Indirect Command" Buffer**.

This document defines the architecture for **GPU-Driven Rendering**. It describes the mechanism that allows the GPU to determine *how much* to draw without CPU intervention, enabling features like particle culling and dynamic topology generation at zero CPU cost.

# The Unified Buffer Strategy: The "Indirect Command" Buffer

**Objective:** Decouple the CPU from the draw call parameters.

**Invariant:** The CPU never writes to instanceCount or vertexCount during the frame loop.

**Mechanism:** A storage \| indirect buffer populated by a dedicated Compute Pass ("Draw Prep") and consumed by the Render Pass.

## 1. The Philosophy: The GPU as the Pilot

In a traditional (Direct) render loop, the CPU must know exactly how many items to draw:

draw(vertexCount: 6, instanceCount: 1000)

This fails in a generative system where logic happens on the GPU.

- **Scenario:** A "Life" simulation where cells die.

- **Problem:** The CPU doesn't know which cells died. To find out, it would have to read back the entire state (slow).

- **Solution:** The GPU counts the living cells itself and writes that number into a buffer. The Render Pass reads that buffer to execute the draw.

## 2. The Memory Layout (Strict Struct)

The Indirect Command Buffer is a standard GPUBuffer containing a sequence of tightly packed DrawIndexedIndirectArgs structs. The layout is hardware-defined and non-negotiable.

### 2.1 The Struct Definition

Every draw command occupies exactly **20 bytes** (5 x u32).

| **Offset** | **Field Name** | **Type** | **Description** |
|----|----|----|----|
| **0** | indexCount | u32 | Number of indices to draw (e.g., 6 for a Quad). |
| **1** | instanceCount | u32 | **The Dynamic Value.** How many items to draw. |
| **2** | firstIndex | u32 | Offset into the Index Buffer (Shape Bank). |
| **3** | baseVertex | i32 | Added to each index before reading vertex data. |
| **4** | firstInstance | u32 | Offset into the Instance Buffer (Arena). |

### 2.2 The Buffer Composition

The buffer acts as an array of these structs.

- **Command 0:** Draws the "Background" layer.

- **Command 1:** Draws the "Main Particle System."

- **Command 2:** Draws the "UI Overlay."

*Capacity:* Allocated once at startup. typically 1KB is enough for 50 distinct draw layers.

## 3. The "Draw Prep" Compute Shader

Since the CPU cannot touch this buffer efficiently, we introduce a micro-kernel whose sole job is to populate it.

### 3.1 The Input: Counters & Flags

This kernel reads from the **Arena** (which contains the simulation state) and the **Shape Bank** (which contains topology info).

- **Source 1: The Active Count**

  - In the Arena, we maintain an atomic\<u32\> counter or a field_length uniform.

  - *Logic:* If the "Life" simulation killed 50 particles, the counter reads 950.

- **Source 2: The Topology**

  - The kernel reads the ShapeID for this batch.

  - It queries the Shape Bank to get indexCount and firstIndex.

### 3.2 The Output: The Command

The kernel writes the DrawIndexedIndirectArgs struct to the Indirect Buffer at the index corresponding to the current Draw Call ID.

**Logic Flow (Pseudo-Code):**

1.  **Read Visibility:** count = atomicLoad(Arena.Counters\[BatchID\])

2.  **Read Topology:** shape = ShapeBank\[BatchID\]

3.  **Construct Args:**

    - indexCount = shape.indexCount

    - instanceCount = count (Dynamic!)

    - firstIndex = shape.indexStart

    - baseVertex = 0

    - firstInstance = 0

4.  **Write:** IndirectBuffer\[BatchID\] = Args

## 4. The Culling Engine (Frustum & Logic)

The Indirect Buffer is the enabler for **GPU Culling**. We stop drawing things that are off-screen or invisible.

### 4.1 The Culling Compute Pass

Before the "Draw Prep" kernel runs, a "Culling" kernel runs over the Field.

1.  **Check:** Is Position\[i\] inside the screen bounds?

2.  **Check:** Is Opacity\[i\] \> 0.001?

3.  **Action:**

    - If **Visible**: Append InstanceID to a simplified "Visible Instances" list (Index Buffer compaction) and atomic increment the VisibleCount.

    - If **Invisible**: Do nothing.

### 4.2 The Benefit

- **Without Indirect:** The GPU vertex shader runs for 10,000 particles, discards 9,000 of them. Waste of vertex processing power.

- **With Indirect:** The "Draw Prep" kernel writes instanceCount = 1000. The vertex shader only runs 1,000 times. Massive performance gain for complex scenes.

## 5. Handling Multi-Draw (The "Render Graph")

Oscilla allows multiple independent "Sinks" (e.g., a Background layer and a Foreground layer).

### 5.1 The Command List

The Compiler assigns a **Draw ID** to every Render block in the graph.

- Render_Background \$\rightarrow\$ Command Index 0

- Render_Foreground \$\rightarrow\$ Command Index 1

### 5.2 The Execution Loop

The CPU Render Pass becomes a simple loop over these IDs.

**CPU Logic:**

1.  **Bind:** Indirect Buffer.

2.  **Loop:** for (i = 0; i \< ActiveSinkCount; i++)

    - drawIndexedIndirect(IndirectBuffer, offset = i \* 20)

*Note on WebGPU vNext:* Future versions may support multiDrawIndexedIndirect, allowing this entire loop to become a single API call. For v3.0, we loop on the CPU, but the heavy lifting (arg generation) is still GPU-side.

## 6. Synchronization & Barriers

Because one shader writes to the buffer and another reads it *within the same frame*, synchronization is key.

- **Hazard:** The "Draw Prep" compute shader must finish writing *before* the Render Pass begins reading.

- **Solution (WebGPU):** Implicit synchronization via Pass encoding.

  - End ComputePassEncoder (This issues a memory barrier).

  - Begin RenderPassEncoder.

  - Use IndirectBuffer.

  - *Result:* The driver guarantees the write is visible to the read.

## 7. Summary of Requirements

1.  **Allocation:** Create a persistent GPUBuffer with usage INDIRECT \| STORAGE \| COPY_DST.

2.  **Shader Generation:** The Compiler must generate a "Draw Prep" compute shader for every frame that maps ShapeIDs and ArenaCounters to DrawIndexedIndirectArgs.

3.  **Runtime Integration:** The RenderAssembler must stop using CPU-side instanceCount logic and switch to binding this buffer.

4.  **Debug View:** Create a specialized inspector that reads this buffer back to CPU (async) so you can see "Active Instance Counts" in the debug panel.

This component completes the "GPU-Driven" architecture. The CPU starts the engine (Dispatch), but the GPU decides how fast to drive (Draw Count).
