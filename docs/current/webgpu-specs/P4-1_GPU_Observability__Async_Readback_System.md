> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/current/webgpu-specs/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Observability System (The "Spy"): The Async Readback**.

This document defines the subsystem responsible for extracting live data from the GPU without interrupting the high-performance render loop. It solves the "Observer Effect" problem, where measuring the performance of a system usually degrades it, by utilizing asynchronous memory transfers and a "fire-and-forget" copy architecture.

# The Observability System: The Async Readback

## Related Contracts

- `docs/current/webgpu-specs/IMPLEMENTATION-INDEX.md`
- `docs/current/webgpu-specs/P1-1__Unified_GPU_Buffer_Strategy_Explained.md`
- `docs/current/webgpu-specs/P3-5__Runtime_Loop__The_Swap_Explained.md`
- `docs/current/webgpu-specs/P5-3__Phased_Rollout__Engine_Migration_Strategy.md`

**Objective:** Visualize internal GPU state (signals, positions, counters) in the UI at 60fps.

**Invariant:** Reading data must **never** cause a GPU pipeline stall or block the main JS thread.

**Mechanism:** A Double-Buffered MAP_READ staging system that copies a "Surgical Slice" of the Arena every few frames.

## 1. The Performance Paradox (The Stall)

In a naive implementation, if you want to see the value of a sine wave LFO:

1.  JavaScript calls buffer.mapAsync().

2.  **STALL:** The CPU halts execution and waits for the GPU to finish *all* pending work (rendering, compute).

3.  **STALL:** The GPU flushes its caches and copies memory to system RAM.

4.  **Result:** Your 144Hz physics engine drops to 15Hz because you forced a synchronization point.

**The Solution:** We never read from the active simulation buffer. We issue a command to *copy* the data to a secondary buffer, and we read that secondary buffer *later*, when the GPU is idle.

## 2. The "Spyglass" Architecture (Double Buffering)

To read data continuously without stopping the simulation, we need **two** dedicated readback buffers.

- **Readback_A**: Currently mapped (CPU is reading it).

- **Readback_B**: Currently bound (GPU is writing to it).

### 2.1 The Buffer Specification

These are standard GPUBuffer resources.

- **Usage:** COPY_DST \| MAP_READ.

- **Size:** **Small.** We do not mirror the entire 200MB Arena. We allocate a fixed "Inspector Window" (e.g., 64KB).

- **Lifecycle:** Permanent. Allocated at startup.

### 2.2 The "Surgical Slice" Strategy

We cannot read everything. The bandwidth cost is too high.

- **The Window:** The InspectorService maintains a list of **Active Probes** (nodes currently visible on screen or expanded in the editor).

- **The Packing:**

  - The Compiler generates a ProbeTable.

  - *Example:* If the user is looking at "LFO 1" (Offset 1024) and "Particle 5" (Offset 5000):

    - We issue **two** copyBufferToBuffer commands.

    - Command 1: Copy 4 bytes from Arena(1024) \$\to\$ Readback(0).

    - Command 2: Copy 12 bytes from Arena(5000) \$\to\$ Readback(4).

## 3. The Command Loop (GPU Side)

This happens inside the RuntimeExecutor loop, *after* the Physics Dispatch but *before* the Swap.

### 3.1 The Copy Encoder

TypeScript

// RuntimeExecutor.ts\
\
// 1. Identify Target\
// We cycle between buffer A and B every read request.\
const targetBuffer = (readbackIndex % 2 === 0) ? readbackA : readbackB;\
\
// 2. Check Availability\
// CRITICAL: We cannot write to a buffer if it is currently MAPPED.\
if (targetBuffer.mapState !== 'unmapped') {\
// Skip this frame. The CPU hasn't finished reading the previous data.\
// This is "Throttling" - better to skip a read than crash the driver.\
return;\
}\
\
// 3. Issue Copy Commands (The "Spying")\
const commandEncoder = device.createCommandEncoder();\
\
// We iterate over the list of active probes\
for (const probe of activeProbes) {\
commandEncoder.copyBufferToBuffer(\
arenaBuffer, // Source: The active simulation state\
probe.sourceOffset,\
targetBuffer, // Destination: The Spyglass\
probe.destOffset,\
probe.size // 4 bytes for float, 12 for vec3\
);\
}\
\
device.queue.submit(\[commandEncoder.finish()\]);

## 4. The Readback Loop (CPU Side)

This is an asynchronous loop running in parallel with the render loop. It does not run on requestAnimationFrame. It runs on promise.then().

### 4.1 The Async Map

After submitting the copy command, we immediately request access to the buffer.

TypeScript

// InspectorService.ts\
\
async function readData() {\
const buffer = (readbackIndex % 2 === 0) ? readbackA : readbackB;\
\
// 1. Request Map\
// This returns a Promise. It resolves ONLY when the GPU is done writing.\
await buffer.mapAsync(GPUMapMode.READ);\
\
// 2. Read Data\
// The buffer is now locked for CPU access. GPU cannot touch it.\
const range = buffer.getMappedRange();\
const dataView = new Float32Array(range);\
\
// 3. Dispatch to UI\
// Copy the values into JavaScript memory immediately.\
updateSparklines(dataView);\
\
// 4. Release\
// Unmap immediately so the GPU can use it again next cycle.\
buffer.unmap();\
\
// 5. Flip Buffer\
readbackIndex++;\
}

### 4.2 Handling Latency

- **Frame N:** GPU executes Physics.

- **Frame N:** GPU executes Copy to Readback A.

- **Frame N+1:** CPU calls mapAsync(A).

- **Frame N+2:** Promise resolves. UI updates.

- **Result:** The UI is typically **2-3 frames behind** the physics.

  - *Impact:* For visual debugging (sparklines), this is imperceptible. For audio sync, it is noticeable but acceptable.

## 5. The "Inspector" Service (UI Integration)

How does the React UI know what to display?

### 5.1 The Subscription Model

We do not broadcast every value to every component (React render cycle death).

- **Architecture:** Signals / Observables.

- **Registry:** Map\<NodeID, Subject\<number\>\>.

- **Logic:**

  1.  When a component mounts (e.g., \<NodeInspector id={5} /\>), it calls inspector.subscribe(5).

  2.  The Service adds Node 5's offset to the ActiveProbes list.

  3.  On the next readData() cycle, the value for Node 5 is extracted from the Float32Array.

  4.  The Service calls subject.next(value).

  5.  The React component updates directly (bypassing Virtual DOM diffing if using a ref).

### 5.2 Handling "Fields" (Visualizing Arrays)

Visualizing a single float is easy. Visualizing a 10,000-particle field is hard.

- **Strategy:** Downsampling.

- **GPU Side:** If the user wants to see a histogram of particle positions, we do *not* copy 10,000 floats. We dispatch a **Compute Shader** to build the histogram buckets in the Arena first.

- **Readback:** We only read back the 256-bucket histogram (1KB).

- **Invariant:** Never read back more than 64KB of data per frame.

## 6. The "NaN" Trap

Debugging shader math is notoriously hard because 0 / 0 fails silently.

### 6.1 The Detector

Since we are reading the raw bits, the Inspector Service acts as a **Crash Guard**.

- **Check:** if (Number.isNaN(value) \|\| !Number.isFinite(value))

- **Action:**

  1.  Flag the Node in the UI as "CRASHED" (Red skull icon).

  2.  **Auto-Pause:** Stop the engine immediately to prevent the NaN from propagating to the entire state (the "NaN Infection").

  3.  **Trace:** Show the value that caused it.

## 7. Summary of Implementation

1.  **Allocate Buffers:** Create readbackA and readbackB (SIZE = 64KB, COPY_DST \| MAP_READ).

2.  **Implement InspectorService:**

    - Maintain activeProbes list.

    - Implement the mapAsync / unmap toggle loop.

3.  **Update RuntimeExecutor:**

    - Inject the commandEncoder.copyBufferToBuffer block before the frame end.

    - Ensure it respects the unmapped state check.

4.  **UI Components:**

    - Create a \<Sparkline /\> component that consumes the raw data stream.

    - Add error handling for NaN values.

This system gives you "X-Ray Vision" into the GPU memory. It turns the "Black Box" of the compute shader into a transparent, observable instrument, essential for user trust and debugging.
