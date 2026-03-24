# Oscilla WebGPU v3.0: Reference Architecture

This is the **Reference Architecture for Oscilla WebGPU v3.0**. It treats the browser not as a document renderer, but as a high-performance compute host.

---

## Core Philosophy

The CPU is a compiler and scheduler. The GPU is the computer. Once the graph is compiled, data flow is entirely GPU-resident.

## 1. Memory Architecture: The SoA Arena

To maximize memory coalescing and SIMD throughput, we reject the traditional Array of Structures (AoS) in favor of a **Structure of Arrays (SoA)** layout.

### A. The Unified Numeric Arena (`f32`)

We allocate **two** identical storage buffers (`Arena_Ping`, `Arena_Pong`) to handle read/write safety during compute.

- Physical Layout: A single, massive `f32` array.
- Logical Layout:
  - Scalars: Packed at the front (Offset 0).
  - Fields (SoA): De-interleaved channel arrays.
    - Instead of: `[x0, y0, z0, x1, y1, z1...]`
    - We store: `[x0, x1... xN]`, `[y0, y1... yN]`, `[z0, z1... zN]`
- Addressing: The compiler emits hardcoded offsets (e.g., `OFFSET_POS_X`, `OFFSET_POS_Y`) into the shader.
- WGSL Binding:

```wgsl
@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
```

### B. The Topology Bank (`u32`)

A read-only storage buffer containing the structural definitions for geometry. This enables the dual representation (math on Arena, structure on Bank).

- Content: Packed integer data defining vertex counts, index offsets, and closed-loop flags.
- WGSL Binding: `@group(0) @binding(2) var<storage, read> shape_bank: array<u32>;`

### C. The Indirect Command Buffer (`u32`)

A `storage | indirect` buffer used to decouple the CPU from the draw call count.

- Content: A sequence of `DrawIndexedIndirectArgs` structs: `{ indexCount, instanceCount, firstIndex, baseVertex, firstInstance }`.
- Flow:
  1. Compute Shader calculates how many instances are active.
  2. Compute Shader writes the count to this buffer.
  3. Render Pass executes `drawIndexedIndirect(buffer)`.

---

## 2. The Compilation Pipeline

The compiler transforms the user's Node Graph into a specialized Compute Shader.

### Stage 1: SoA Layout and Address Generation

The compiler traverses the `NormalizedGraph`. For every `Field<vec3>` (size `N`), it allocates three disjoint blocks of length `N` in the `ArenaLayout`. It records the `OFFSET_X`, `OFFSET_Y`, and `OFFSET_Z`.

### Stage 2: Kernel Selection and AST Injection

The compiler walks the execution schedule. For each block:

1. Resolve Kernel: Maps `Block.kind` (e.g., `Spiral`) to a WGSL function template.
2. Resolve Addresses: Injects the specific SoA offsets into the template.
   - Template: `pos.x = cos(angle) * radius;`
   - Injected: `arena_out[OFFSET_POS_X + lane] = cos(angle) * radius;`
3. Inject State: If the block is stateful, it injects logic to read from `arena_in` and write to `arena_out`.

### Stage 3: Draw Prep Kernel Generation

The compiler generates a secondary, lightweight compute kernel responsible for populating the **Indirect Command Buffer**. It maps the `RenderInstances2D` blocks to write operations that fill the `instanceCount` and `firstInstance` fields.

---

## 3. Runtime Loop (Per Frame)

The CPU loop is extremely thin. It performs no math. It simply marshals the GPU command encoder.

### Step 1: Input Marshalling (CPU to GPU)

The `RuntimeService` writes current mouse coordinates, MIDI inputs, and strict delta-time (`dt`) into the Input Staging Buffer. This is copied to the `Arena_Ping` buffer.

### Step 2: Compute Dispatch (Physics Pass)

The CPU dispatches the generated **Main Compute Shader**.

- Workgroups: Dispatched based on the maximum `laneCount` in the arena.
- Execution:
  1. Gauge Apply: Reads `state_prev`, adds `gauge_offset`, writes `effective_val`.
  2. Scalar Math: Single-thread logic for LFOs and global params.
  3. Field Math: Massively parallel SoA math for geometry and layouts.
  4. State Update: Writes new state values to `arena_out`.

### Step 3: Draw Prep Dispatch

The CPU dispatches the **Draw Prep Kernel**.

- It reads the `instanceCount` from the Arena (if dynamic).
- It writes `DrawIndexedIndirectArgs` to the **Indirect Buffer**.

### Step 4: Render Pass (Sink)

The CPU begins a Render Pass.

- Bind: `Arena_Out` (as vertex buffer/instance data), `Shape_Bank` (logic), `Indirect_Buffer`.
- Execute: Issues one `drawIndexedIndirect` call per `RenderInstances2D` sink.
  - Vertex Shader: Reads `VertexID` (for shape) and `InstanceID` (for layout position from Arena).
  - Fragment Shader: Reads color from Arena and outputs pixels.

### Step 5: Ping-Pong Swap

The CPU swaps the bind group indices for `Arena_Ping` and `Arena_Pong`. Frame `N` output becomes frame `N+1` input.

---

## 4. Key Subsystems and Invariants

### Continuity and Gauge Invariance

- Invariant: No visual popping during graph edits.
- Mechanism: When a discontinuity (edit/hot-swap) occurs, the CPU calculates the delta between the old `EffectiveValue` and the new `BaseValue`. It uploads this delta to a reserved `Gauge` section in the Arena. The Compute Shader applies this offset and decays it over time.

### Stateful Primitives (Phase Wrapping)

- Invariant: Infinite runtime stability with `f32`.
- Mechanism: All time-based accumulators (Phasors) must wrap their state.
  - Bad: `state += dt;` (drifts to infinity, precision loss).
  - Good: `state = (state + dt) % 1.0;` (bounded precision).

### Observability (Async Readback)

- Invariant: UI does not stall the GPU.
- Mechanism: A Spy Compute Shader runs at 15Hz. It copies a user-selected slice of the Arena to a `MAP_READ` buffer. The CPU maps this buffer asynchronously to update UI sparklines.

---

## 5. Summary of Hard Rules

1. No `f64`: The entire engine is `f32`.
2. No objects: All data is flat numbers (`f32` or `u32`).
3. No CPU math: If it involves a coordinate, it happens on the GPU.
4. No dynamic branching: Control flow is data-driven (masks), not logic-driven (`if`/`else`).
5. Strict SoA: Memory is always channel-separated for coalesced access.

This architecture document represents the **final state** for Oscilla v3.0. It leverages the GPU for what it does best, parallel throughput, while keeping the CPU focused on what it does best, compilation and orchestration.
