This is the comprehensive technical specification for **The Runtime Loop: The Swap**.

This document defines the critical "End of Frame" logic. It details how the engine transitions from Frame \$N\$ to Frame \$N+1\$ without copying massive amounts of memory, ensuring that the "Past" becomes the "Present" for the next simulation step.

# The Runtime Loop: The Swap

**Objective:** Advance the simulation timeline by rotating buffer roles.

**Invariant:** The Arena_Write of Frame \$N\$ becomes the Arena_Read of Frame \$N+1\$.

**Mechanism:** A pointer swap of GPUBindGroup objects on the CPU.

## 1. The Physics of the Swap

In a double-buffered system, data does not move. The *pointers* move.

- **Buffer A (Physical Address 0x1000):** Holds the state of the Universe at \$T=0\$.

- **Buffer B (Physical Address 0x2000):** Holds the state of the Universe at \$T=1\$.

When the frame finishes, we simply redefine "Universe Present" to be 0x2000 and "Universe Future" to be 0x1000.

### 1.1 The Frame Index

The runtime maintains a monotonically increasing integer: frameIndex.

- **Current State (Read):** frameIndex % 2

- **Next State (Write):** (frameIndex + 1) % 2

## 2. The Bind Group Strategy (The "Cached Swap")

In WebGPU, you cannot just say "swap buffers." You must bind a **BindGroup**. Creating a BindGroup is cheap, but creating one *every frame* is garbage.

### 2.1 Pre-Allocation

At the start of the application (or after a resize), we create **two permanent BindGroups**.

**BindGroup A (Index 0):**

- **Binding 0 (Read):** Buffer_A

- **Binding 1 (Write):** Buffer_B

- **Binding 2:** Shape Bank

- **Binding 3:** Uniforms

**BindGroup B (Index 1):**

- **Binding 0 (Read):** Buffer_B

- **Binding 1 (Write):** Buffer_A

- **Binding 2:** Shape Bank

- **Binding 3:** Uniforms

### 2.2 The Execution Logic

Inside executeFrame(), we simply toggle which group we use.

TypeScript

// RuntimeExecutor.ts\
const isEven = frameIndex % 2 === 0;\
const currentBindGroup = isEven ? bindGroupA : bindGroupB;\
\
// 1. Dispatch Physics (Writes to Next)\
computePass.setBindGroup(0, currentBindGroup);\
computePass.dispatchWorkgroups(...);\
\
// 2. Dispatch Draw Prep (Reads from Next)\
// Wait! Draw Prep needs to read the \*Result\* of the Physics.\
// So it needs to bind the 'Write' buffer as 'Read'.

**Correction:** The DrawPrep pipeline uses a *different* BindGroup layout because it treats the "Future" state as "Present" (Read-Only).

## 3. The "Read-After-Write" Hazard

This is where the architecture gets tricky.

### 3.1 The Pipeline Dependency

1.  **Physics Kernel:** Writes to Buffer_Next.

2.  **Draw Prep Kernel:** Reads Buffer_Next (to count particles).

3.  **Render Pass:** Reads Buffer_Next (to draw positions).

### 3.2 The BindGroup Permutations

We actually need **Three** BindGroups per swap cycle, or a smarter layout.

**Option A: The "Uniform" Layout (Simpler)**

All pipelines use the same layout: @group(0) @binding(0) var\<storage, read\>.

- *Physics Pass:* Binds Group_A (Read A, Write B).

- *Draw Prep Pass:* Binds Group_B (Read B). *Note: It ignores the write binding.*

- *Render Pass:* Binds Group_B (Read B).

**Option B: The "Dedicated" Layout (Explicit)**

- *Physics:* Uses Layout_Physics.

- *Draw Prep:* Uses Layout_Read_Only.

- *Render:* Uses Layout_Read_Only.

**Decision:** **Option A** is preferred for v3.0. We create two "Master" BindGroups.

- **Even Frame:**

  - Physics uses BindGroup_A (Read A, Write B).

  - Draw Prep uses BindGroup_B (Read B, Write A - *writes ignored*).

  - Render uses BindGroup_B (Read B, Write A - *writes impossible in Render*).

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

    - Create bindGroupA and bindGroupB immediately after creating buffers.

    - Cache them. Do *not* create new GPUBindGroup inside the loop.

3.  **Execution Update:**

    - Determine readGroup and writeGroup based on parity.

    - Pass the correct group to computePass.setBindGroup(0, ...).

4.  **Cleanup:** If the Arena resizes, you **must** destroy and recreate both BindGroups.

This simple integer increment (i++) drives the entire temporal evolution of your instrument. It is the tick of the clock.
