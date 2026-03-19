> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Runtime Loop: The Swap**.

This document defines the critical "End of Frame" logic. It details how the engine transitions from Frame \$N\$ to Frame \$N+1\$ without copying massive amounts of memory, ensuring that the "Past" becomes the "Present" for the next simulation step.

# The Runtime Loop: The Swap

## Related Contracts

- `docs/WebGPU-Complete/IMPLEMENTATION-INDEX.md`
- `docs/WebGPU-Complete/P1-1__Unified_GPU_Buffer_Strategy_Explained.md`
- `docs/WebGPU-Complete/P3-2_GPU_Compute_Dispatch_Explained.md`
- `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`

**Objective:** Advance the simulation timeline by rotating buffer roles.

**Invariant:** The Arena_Write of Frame \$N\$ becomes the Arena_Read of Frame \$N+1\$.

**Mechanism:** A pointer swap of GPUBindGroup objects on the CPU.

## Scoped IR and Synchronization Implications

- [LAW:one-source-of-truth] Compute outputs consumed by draw-prep/render must flow through one canonical pass graph sequence.
- [LAW:single-enforcer] Resource visibility and usage transitions are enforced by render-graph ordering (compute before draw-prep before render) rather than scattered callsite guards.
- [LAW:dataflow-not-control-flow] Swap logic remains deterministic; only buffer role data (read/write identities) changes per frame.

## Compile Artifact Publication

- [LAW:one-source-of-truth] Hot-swap publishes one canonical compile artifact set from the compile worker: GPU pass shaders plus static install metadata for ShapeBank topology headers and draw-prep descriptors.
- [LAW:single-enforcer] Runtime services consume that compile-worker payload directly at swap time. They do not rebuild sink tables or ShapeBank install buffers from live runtime state.
- [LAW:dataflow-not-control-flow] First-frame install and later frames follow the same stage contract: input/header values vary, but the frame order remains `input -> compute -> draw-prep -> render -> swap`.

## 1. The Physics of the Swap

In a double-buffered system, data does not move. The *pointers* move.

- **Buffer A (Physical Address 0x1000):** Holds the state of the Universe at \$T=0\$.

- **Buffer B (Physical Address 0x2000):** Holds the state of the Universe at \$T=1\$.

When the frame finishes, we simply redefine "Universe Present" to be 0x2000 and "Universe Future" to be 0x1000.

### 1.1 The Frame Index

The runtime maintains a monotonically increasing integer: frameIndex.

- **Current State (Read):** frameIndex % 2

- **Next State (Write):** (frameIndex + 1) % 2

## 2. Canonical BindGroup Strategy

Bind groups are pre-allocated and reused. No per-frame bind-group creation in the hot path.

### 2.1 Pre-Allocated Groups

At minimum, maintain:

1. `physicsGroupA`: read `Arena_A`, write `Arena_B`
2. `physicsGroupB`: read `Arena_B`, write `Arena_A`
3. `readOnlyGroupA`: read `Arena_A` (+ shape/material/uniform bindings)
4. `readOnlyGroupB`: read `Arena_B` (+ shape/material/uniform bindings)

This keeps pass intent explicit:

- physics uses read+write group
- draw-prep/render use read-only group targeting the post-physics arena

### 2.2 Per-Frame Selection

```ts
const isEven = frameIndex % 2 === 0;

const physicsGroup = isEven ? physicsGroupA : physicsGroupB;
const postPhysicsReadGroup = isEven ? readOnlyGroupB : readOnlyGroupA;

// 1) Physics: read current, write next
computePass.setBindGroup(0, physicsGroup);
computePass.dispatchWorkgroups(...);

// 2) Draw Prep: read next (post-physics)
drawPrepPass.setBindGroup(0, postPhysicsReadGroup);
drawPrepPass.dispatchWorkgroups(...);

// 3) Render: read next (same target as draw-prep)
renderPass.setBindGroup(0, postPhysicsReadGroup);
```

## 3. Read-After-Write Contract

Pass ordering is canonical:

1. Physics writes `Arena_Next`.
2. Draw Prep reads `Arena_Next`.
3. Render reads `Arena_Next`.

WebGPU pass boundaries provide required visibility guarantees when encoded in this order.

## 4. The "History" Mechanics (Feedback)

How does a Lag block work?

- It computes current_val = mix(previous_val, target, 0.1).

- previous_val comes from Arena_Read (Binding 0).

- current_val goes to Arena_Write (Binding 1).

**The Magic:** Because we swap inputs every frame, Arena_Read *automatically* contains the value we calculated 16ms ago. No manual copying is required.

### 4.1 The "Feedback Loop" Block

If a user creates a feedback loop (connecting Output \$\to\$ Input), the Compiler detects a cycle.

- **Safety:** The compiler allows it because the read always comes from the *previous* frame.

- **Result:** A 1-frame delay (16ms) is inherent in all feedback loops. This is physically correct for digital signal processing.

## 5. The "Reset" Pulse

When the user clicks "Rewind," we break the cycle.

### 5.1 The Logic

1.  **CPU:** Sets frameIndex = 0.

2.  **CPU:** Uploads Reset=1 in the Uniform Buffer.

3.  **Shader:** if (uniforms.reset) { state = initial_state; }

4.  **Swap:** The swap logic proceeds normally. Buffer_A becomes the "Initial State."

## 6. The "Export" Scenario (Video Rendering)

When rendering to MP4, we cannot rely on the browser's requestAnimationFrame loop.

### 6.1 The Offline Loop

The RuntimeExecutor enters a while loop.

1.  **Update Inputs:** Set Time = Frame \* (1/60).

2.  **Dispatch Physics.**

3.  **Dispatch Draw Prep.**

4.  **Dispatch Render.**

5.  **Readback Pixels:** copyTextureToBuffer.

6.  **Swap:** Manually increment frameIndex.

7.  **Repeat.**

*Note:* In this mode, the Swap is synchronous. The CPU waits for the GPU to finish before starting the next frame to prevent memory pressure from 100 queued frames.

## 7. Summary of Implementation

1.  **State Management:** Add frameIndex: number to RuntimeContext.

2.  **Resource Creation:**

    - Create `physicsGroupA/B` and `readOnlyGroupA/B` immediately after creating buffers.

    - Cache them. Do *not* create new `GPUBindGroup` instances inside the frame loop.

3.  **Execution Update:**

    - Determine simulation group (`physicsGroup*`) and post-physics read group (`readOnlyGroup*`) based on parity.

    - Pass groups to physics, draw-prep, and render passes in canonical order.

4.  **Cleanup:** If the Arena or bind-layout resources resize/change, recreate all precomputed groups.

This simple integer increment (i++) drives the entire temporal evolution of your instrument. It is the tick of the clock.
