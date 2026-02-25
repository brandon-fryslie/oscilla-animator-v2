This is the **Oscilla v3.0 Master Architecture Document**.

It is the single source of truth for the migration to a WebGPU-native, WASM-validated, SoA-optimized visual instrument. It assumes no prior knowledge of the "old ways" other than what must be destroyed to build the new.

# Oscilla v3.0: The "Moonshot" Specification

**Target Platform:** WebGPU (Chrome/Edge/Safari latest).

**Core Invariant:** The CPU is a scheduler; the GPU is the computer.

**Compiler Backend:** Naga (Rust/WASM) for validation and emission.

**Memory Model:** Structure of Arrays (SoA), Ping-Pong Storage, Indirect Draw.

## Part I: The Pre-Flight Refactor (Phase 0)

*Before writing a single line of shader code, the CPU runtime must be mathematically aligned with the GPU target. These are strict prerequisites.*

### 1. The SoA Mandate (Structure of Arrays)

The current CPU memory layout (Array of Structures, e.g., x,y,z) must be eradicated.

- **The New Standard:** All Field data is stored in channel-separated contiguous arrays.

- **Compiler Change:** ArenaLayout generation must allocate OFFSET_X, OFFSET_Y, OFFSET_Z as independent blocks, not interleaved strides.

- **Alignment Rule:** Every channel block must be padded to 4-byte alignment (WebGPU f32 requirement).

- **Verification:** The CPU runtime must successfully render the current application using this split-channel memory model before migration proceeds.

### 2. The f32 Phase-Lock

The Float64 safety net is gone. All time-based state must effectively run forever on f32 without jitter.

- **Phase Wrapping:** All oscillators and phasors must effectively implement phase = (phase + delta) % 1.0. Unbounded accumulation of time (t += dt) is strictly forbidden in the new block contract.

- **Delta Time (\$dt\$):** The runtime must switch from passing absolute time (\$t\$) to passing delta time (\$dt\$) and "previous state" to the kernels.

### 3. The Object Purge (Numeric Handles)

JavaScript objects ({ type: 'circle', radius: 10 }) are illegal in the hot path.

- **The Handle System:** Every geometry, asset, or complex structure must be serialized into a u32 ID that points to a row in a GPU Buffer.

- **The Bank:** A unified ShapeBank (Uint32Array) must be created to store topology data (vertex counts, index offsets). The runtime passes the ShapeID (integer), not the object reference.

## Part II: The Data Architecture (The "Physics Engine")

*The application state exists permanently on the GPU. The CPU holds only a "Shadow Copy" for debugging and initial upload.*

### 1. The Unified Buffer Strategy

We allocate three distinct classes of GPU memory.

**A. The "Arena" (Ping-Pong Storage)**

Two identical buffers (Arena_A, Arena_B) of type storage \| copy_dst \| copy_src.

- **Role:** Holds all Scalars, Fields, and State.

- **Cycle:** Frame \$N\$ reads A and writes B. Frame \$N+1\$ reads B and writes A.

- **Layout:**

  - **Header (Uniforms):** Time, DeltaTime, Mouse, Resolution (First 256 bytes).

  - **Scalars:** Packed f32 values.

  - **Fields (SoA):** Massive contiguous blocks for Field\<f32\> (X channel), Field\<f32\> (Y channel), etc.

  - **Gauge:** Reserved space for continuity offsets.

**B. The "Shape Bank" (Read-Only Storage)**

A single buffer of type storage \| copy_dst.

- **Role:** Static definitions of geometry topology.

- **Update Frequency:** Only when the user loads a patch or changes an SVG.

- **Structure:** Packed u32 structs defining { index_start, index_count, vertex_start, flags }.

**C. The "Indirect Command" Buffer**

A buffer of type indirect \| storage.

- **Role:** Stores the DrawIndexedIndirectArgs structs.

- **Invariants:** The CPU **never** writes to this during the frame loop. It is populated exclusively by the "Draw Prep" Compute Shader.

## Part III: The Compiler Architecture (The "Brain")

*The Compiler is an asynchronous service that lowers the user's Graph into a validated Naga IR module.*

### 1. The Async Compiler Service

Because Naga is WASM, compilation is asynchronous.

- **Interface:** compile(graph: NormalizedGraph) -\> Promise\<ShaderArtifacts\>

- **State Machine:**

  - **Idle:** Ready for edits.

  - **Dirty:** User made a change; debounce timer running.

  - **Compiling:** Graph locked; lowering to Naga IR.

  - **Linking:** WebGPU Pipeline creation in progress.

  - **Ready:** Hot-swap trigger armed.

### 2. The Lowering Pipeline (TS **\$\to\$** Naga)

We do not generate WGSL strings directly. We generate a **Structured Intermediate Representation** that Naga understands.

- **Step 1: Schedule Walk:** The compiler traverses the execution schedule.

- **Step 2: Address Resolution:** It queries the SoA Layout map to resolve abstract Slot IDs into concrete byte offsets (OFFSET_X, OFFSET_Y).

- **Step 3: Kernel Injection:** It selects the appropriate WGSL logic for each block (e.g., snoise, mix).

- **Step 4: Module Assembly:** It constructs a Virtual Module (JSON or Struct) containing:

  - **Entry Point:** main (Compute).

  - **Bindings:** The Arena (Group 0, Binding 0/1).

  - **Code Body:** The sequence of function calls and assignments.

### 3. The Naga Validation Layer (WASM)

The generated module is passed to the Naga WASM binary.

- **Validation:** Naga checks types, bounds, and logic consistency.

- **Sanitization:** If valid, Naga emits the final, optimized WGSL string.

- **Error Handling:** If invalid, Naga returns a Rust-style error report which we map back to the specific Node ID in the UI (red border effect).

## Part IV: The Runtime Loop (The Frame)

*The CPU loop does almost nothing. It is a command encoder.*

### 1. Input Marshalling (CPU **\$\to\$** GPU)

- **Action:** The CPU writes the current "Input State" (Mouse \$X/Y\$, MIDI values, \$dt\$) into a staging buffer.

- **Transfer:** This buffer is copied into the **Header** section of the current Arena_Read buffer.

### 2. The Compute Dispatch (The "Physics")

- **Pipeline:** ComputePipeline (Naga-generated).

- **Bindings:** Arena_Read (Input), Arena_Write (Output), Shape_Bank (Ref).

- **Dispatch:** dispatchWorkgroups(ceil(max_lane_count / 64))

- **Logic:**

  1.  **Gauge Apply:** Apply continuity offsets to state.

  2.  **Scalar Eval:** Compute LFOs and global params.

  3.  **Field Eval:** Compute geometry and layouts in parallel (SoA).

  4.  **State Update:** Write new state to Arena_Write.

### 3. The Draw Prep Dispatch (The "Logistics")

- **Pipeline:** DrawPrepPipeline (Static, generic).

- **Bindings:** Arena_Write (Source), Indirect_Buffer (Destination).

- **Action:**

  - Reads the active_instance_count from the Arena.

  - Writes instance_count, vertex_count, etc., to the Indirect Buffer.

### 4. The Render Pass (The "Sink")

- **Pipeline:** RenderPipeline (Generic Vertex/Fragment shader).

- **Bindings:** Arena_Write (as Instance Data), Shape_Bank (as Geometry Source).

- **Draw:** drawIndexedIndirect(Indirect_Buffer, offset).

- **Vertex Pulling:** The Vertex Shader generates geometry on the fly by reading VertexID and looking up the topology in the Shape_Bank.

### 5. The Swap

- The Arena_Read and Arena_Write bind groups are swapped for the next frame.

## Part V: The Observability System (The "Spy")

*The UI needs to see what's happening without stalling the GPU.*

### 1. The Async Readback

- **Frequency:** Throttled (e.g., 15Hz or 30Hz), decoupled from the 144Hz render loop.

- **Mechanism:** commandEncoder.copyBufferToBuffer copies a *slice* of the Arena_Write buffer (only the slots actively being visualized) to a MAP_READ buffer.

- **Retrieval:** buffer.mapAsync() is called. When the promise resolves, the CPU reads the Float32 data and updates the React state for Sparklines and Inspection panels.

## Part VI: The Developer Experience & Migration Strategy

### 1. The "WASM Boot"

- **Loading:** The App Entry Point must immediately fetch naga.wasm.

- **Blocking:** The Graph Editor does not initialize until the WASM is instantiated. A "System Booting..." splash screen is required.

### 2. Error Propagation

- **Shader Errors:** If Naga reports a shader error (e.g., divide by zero or type mismatch during live edit), the Compiler Service **halts**.

- **UI Feedback:** The previous valid pipeline remains active (no visual crash). The UI highlights the offending node with the specific error message from Naga.

### 3. The Phased Rollout

1.  **Refactor Phase:** Implement SoA and Numeric Handles on the CPU engine. Verify parity.

2.  **Infrastructure Phase:** Set up the Naga WASM build pipeline and the Async Compiler Service shell.

3.  **Scalar Phase:** Port all "Scalar" blocks (Math, LFOs) to WGSL generation. Run hybrid engine (GPU scalars, CPU fields).

4.  **Field Phase:** Port "Generator" and "Deformer" blocks. Switch to full GPU compute.

5.  **Render Phase:** Implement the Indirect Draw buffer and kill the Canvas2D sink.

## Final Architect's Note

This architecture creates a **Hard Real-Time System** running inside a browser tab. By enforcing strict memory layouts (SoA) and validating logic via Rust (Naga), you eliminate the entire class of "JavaScript Jitter" bugs. The GPU becomes the metronome, and the CPU is merely the conductor.

**Proceed with the CPU Refactor (Phase 0). That is your Rubicon.**
