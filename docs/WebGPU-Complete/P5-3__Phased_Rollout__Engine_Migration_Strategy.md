This is the comprehensive technical specification for **The Developer Experience & Migration Strategy: The Phased Rollout**.

This document defines the tactical execution plan for replacing a running engine while it is still flying. It rejects the "Big Bang Rewrite" (which usually kills startups) in favor of the **"Ship of Theseus"** approach—replacing the system plank by plank until the old ship is gone, without the user ever noticing a broken build.

# The Developer Experience: The Phased Rollout

**Objective:** Migrate from v2 (Legacy JS/Canvas) to v3 (WebGPU/WASM) with zero downtime.

**Invariant:** The main branch must always be deployable. At no point is the application left in a broken "Work in Progress" state.

**Mechanism:** A robust **Feature Flag System** and a **Parallel Execution Runtime** (The "Ghost Engine").

## Phase 1: The "Ghost" Engine (Parallel Validation)

Before we trust the GPU to drive the visuals, we make it run in the background, invisible to the user but visible to the developer.

### 1.1 The Architecture

The application initializes **two** runtimes simultaneously.

1.  **The Incumbent (v2):** Controls the DOM, handles Inputs, renders to the visible Canvas.

2.  **The Ghost (v3):** Initializes WebGPU, loads Naga, allocates the Arena.

### 1.2 The "Shadow Graph"

When the user edits the graph:

- The UI emits a NormalizedGraph JSON.

- **v2 Compiler:** Compiles it to JavaScript closures (Legacy).

- **v3 Compiler:** Compiles it to Naga IR \$\to\$ WGSL (New).

- **Execution:** Both engines run the frame loop.

  - v2: Draws to screen.

  - v3: Computes state, writes to offscreen buffers.

### 1.3 The Comparator (The Test)

We use the **Async Readback** system here for validation, not visualization.

- **Target:** Select a simple LFO node (Sine Wave).

- **Action:** Every 60 frames, read the value from v2 (CPU) and v3 (GPU).

- **Assert:** abs(v2_val - v3_val) \< EPSILON.

- **Failure:** If they drift, the v3 compiler logic is wrong (or the f32 phase logic is different). We fix v3. The user sees nothing but a perfect v2 render.

## Phase 2: The "Brain Transplant" (Scalar Takeover)

Once the Ghost Engine is mathematically proven to match the Incumbent, we start moving the "Brain" (Scalar Logic) to the GPU.

### 2.1 The Hybrid Dependency

We introduce a **Data Bridge** (Readback \$\to\$ CPU).

- **The Change:** We update the v2 LFO block to stop calculating Math.sin(). Instead, it returns Runtime.latestReadback\[NodeID\].

- **The Flow:**

  1.  **GPU (v3):** Calculates sin(t). Writes to Arena.

  2.  **Readback:** Copies to CPU (3-frame latency).

  3.  **CPU (v2):** Reads the value, drives the legacy visualizer (e.g., moves a div).

### 2.2 The Latency Acceptance

- **The Risk:** Controls will feel "mushy" (50ms lag).

- **The Mitigation:** We accept this temporarily. It proves that the **Data Architecture** (SoA \$\to\$ Readback) works in production.

- **Feature Flag:** ENABLE_GPU_SCALARS = true. If users complain about lag, we toggle it off instantly.

## Phase 3: The "Muscle" Migration (Field Compute)

This is the most painful phase. Performance will get *worse* before it gets better. We move the heavy geometry processing to the GPU, but we still render on the CPU.

### 3.1 The "Bottleneck" Architecture

1.  **GPU (v3):** Computes 10,000 particle positions (PhysicsKernel).

2.  **Readback:** Copies **ALL** 10,000 positions to a CPU Float32Array.

    - *Warning:* This is heavy (\$120KB/frame\$). It might drop FPS to 30.

3.  **CPU (v2):** The Legacy Renderer (Canvas2D) iterates this array and draws circles.

### 3.2 Why do this?

It validates the **Physics Engine**.

- Does the Lag block work on 10k particles?

- Does the Noise field look correct?

- Does the collision logic explode?\
  We can debug these mathematical errors using the familiar Canvas2D visualizer before we introduce the complexity of the WebGPU Render Pipeline.

## Phase 4: The "Monitor Swap" (The Rubicon)

This is the moment of truth. We sever the Readback bridge and enable the WebGPU Renderer.

### 4.1 The Switch

- **Action:** Enable ENABLE_WEBGPU_RENDERER = true.

- **Visuals:**

  - Hide the \<canvas id="legacy-2d"\>.

  - Show the \<canvas id="webgpu"\>.

- **Logic:**

  - Disable the massive Readback from Phase 3.

  - Enable the **Indirect Command Buffer** and **Render Pass**.

### 4.2 The Result

- **Performance:** FPS jumps from ~30 (Phase 3) to ~144 (Native).

- **User Perception:** "The app just got impossibly fast."

- **Fallback:** If the WebGPU context crashes or looks wrong, we toggle the flag back to Phase 3 (or Phase 2). The Legacy Engine is still running in the background (or idling), ready to take over.

## Phase 5: The "Extermination" (Cleanup)

Once Phase 4 has been stable in production for 2 weeks (no major bug reports), we kill the Incumbent.

### 5.1 The Code Purge

1.  **Delete:** src/runtime/legacy/\* (The old JS executor).

2.  **Delete:** src/blocks/legacy/\* (The JS implementations of blocks).

3.  **Refactor:** The CompilerService no longer generates the "Shadow Graph." It only generates Naga IR.

4.  **Simplify:** Remove the AsyncReadback bridge used for driving the CPU. Readback is now *only* used for UI visualization (Sparklines).

### 5.2 The Artifact

The bundle size drops significantly as we remove the duplicate engine logic. The app is now pure v3.

## 6. The Feature Flag System

To manage this, we need a strict config object available globally.

TypeScript

// config/FeatureFlags.ts\
\
export const Flags = {\
// Phase 1: Boot the WASM engine but don't use it\
BOOT_WASM_ENGINE: true,\
\
// Phase 2: Use GPU for Scalar math (LFOs)\
USE_GPU_SCALARS: false,\
\
// Phase 3: Use GPU for Geometry, but draw with CPU (Slow!)\
USE_GPU_PHYSICS_CPU_RENDER: false,\
\
// Phase 4: Full WebGPU (The End Goal)\
USE_WEBGPU_RENDER: false,\
};\
\
// The Migration Timeline:\
// Week 1: BOOT_WASM_ENGINE = true\
// Week 2: USE_GPU_SCALARS = true (Opt-in Beta)\
// Week 4: USE_GPU_PHYSICS_CPU_RENDER = true (Internal Dev Only)\
// Week 6: USE_WEBGPU_RENDER = true (Public Beta)

## 7. Handling "Missing" Blocks

During migration, not every block will be ported to Naga immediately.

### 7.1 The "Hybrid Graph" Problem

What if the user uses Sine (Ported) and SuperRareFilter (Not Ported)?

### 7.2 The "CpuFallback" Node

- **Strategy:** We cannot run a hybrid graph easily (GPU \$\to\$ CPU \$\to\$ GPU is too slow).

- **Rule:** If a graph contains **ANY** un-ported blocks, the **Entire Graph** falls back to the Legacy Engine.

- **UI:** Display a warning on the un-ported node: *"This block forces Legacy Mode (Low Performance). Porting coming soon."*

- **Incentive:** This pushes users to bug you about porting specific blocks, prioritizing your roadmap based on actual demand.

## 8. Summary of Strategy

1.  **Do not rewrite from scratch.** Build the new engine as a "Ghost" inside the old one.

2.  **Validate Data, then Visuals.** Prove the math is right (Readback) before you worry about pixels.

3.  **Accept temporary regression.** Phase 3 will be slow. That is okay; it is a necessary bridge.

4.  **Toggle, don't revert.** Use feature flags to switch engines instantly if a bug is found, rather than rolling back deployments.

This strategy converts a terrifying architectural overhaul into a series of boring, verifiable checklists. It is the only professional way to upgrade a live instrument.
