This is the comprehensive technical specification for **Phase 0: The f32 Phase-Lock**.

This document defines the strict temporal discipline required to operate an infinite-duration instrument on 32-bit floating-point hardware. It addresses the "Time Wall"—the inevitable loss of precision that occurs when accumulating time in f32—and mandates a shift from "Absolute Time" logic to "Delta Time" (Phase Wrapping) logic.

# Phase 0: The f32 Phase-Lock

**Objective:** Guarantee infinite runtime stability without temporal jitter.

**Invariant:** No signal accumulator may exceed the floating-point precision threshold of the render target.

**Success Criteria:** The visual output at \$T = 0\$ seconds is bit-identical to the output at \$T = 48\$ hours.

## 1. The Mathematical Reality (The Problem)

In JavaScript, number is a 64-bit float (double precision). It provides 52 bits of significand. You can run a time counter for roughly **285,000 years** before precision drops below 1 millisecond.

In WebGPU, we are locked to f32 (single precision). It provides only 23 bits of significand. This creates a "Time Wall" that hits shockingly fast.

### 1.1 The Jitter Thresholds

- **At T = 0s:** Precision is extremely high (~0.0000001s).

- **At T = 1 hour (3600s):** Precision drops to ~0.0002s.

  - *Visual Artifact:* Fast-moving geometry (like 60Hz strobes) begins to "shudder" or alias as the frame times quantization misses the monitor's V-Sync window.

- **At T = 4 hours (14,400s):** Precision drops to ~0.001s (1ms).

  - *Audio/Visual Disaster:* LFOs meant to be smooth step visibly. Smooth curves become jagged steps. Phase alignment between two oscillators is lost.

- **At T = 9 hours:** The simulation effectively freezes for small increments.

### 1.2 The "Absolute Time" Trap

Currently, your blocks likely rely on Math.sin(time \* freq).

This is a **Stateless** approach: \$f(t) \rightarrow \text{val}\$.

On f32, calculating sin(100000.0 \* 6.28) results in garbage because the large input value swallows the small pi-modulus detail.

**The Mandate:** You must abandon Stateless Time. You must adopt **Stateful Phase**.

## 2. The Architectural Fix: Phase Wrapping

We replace the concept of "Global Time" with "Local Phase Accumulation."

### 2.1 The Modulo Invariant

Every periodic generator (LFO, Oscillator, Cycle) must maintain its own internal state variable, phase, which is strictly bounded to the unit interval \$\[0.0, 1.0)\$.

- **Old Logic (Stateless):**\
  \$\$Output = \sin(T\_{global} \times 2\pi \times Freq)\$\$\
  *Dies when \$T\_{global}\$ is large.*

- **New Logic (Stateful Phase-Lock):**\
  \$\$Phase\_{new} = (Phase\_{old} + (Freq \times dt)) \pmod{1.0}\$\$\
  \$\$Output = \sin(Phase\_{new} \times 2\pi)\$\$\
  *Precision depends only on \$dt\$, which remains small and precise forever.*

### 2.2 The Delta Time (**\$dt\$**) Standard

The Runtime Executor currently passes a context object containing time (current frame timestamp).

- **Refactor:** The Executor must now calculate a high-precision dt (Delta Time) on the CPU using performance.now().

- **Constraint:** This dt is passed to the GPU/Blocks as a Uniform.

- **The Guardrail:** The time uniform is still available for "Short Duration" effects (like a 5-second envelope), but using it for continuous motion triggers a compiler warning or is structurally discouraged.

## 3. Refactoring the Primitives

The core generator blocks must be rewritten to own their state. This is a fundamental change to the graph's serialization model, as these blocks are now "Stateful" rather than "Functional."

### 3.1 The Phasor (The Heartbeat)

The Phasor block becomes the most critical primitive in the system.

- **State:** Holds a single f32 value: current_phase.

- **Update Step:** Adds \$(Freq \times dt)\$ to current_phase.

- **Wrap Step:** If current_phase \>= 1.0, subtract 1.0.

  - *Note:* Subtracting 1.0 is numerically superior to the modulo operator (%) for maintaining continuity, as it preserves the "overflow" fraction rather than truncating it.

- **Output:** The normalized \$\[0, 1)\$ ramp.

### 3.2 The Sine / Triangle / Square Blocks

These blocks are no longer generators; they are **Waveshapers**.

- **Input:** They ideally accept a Phase signal \$\[0, 1)\$ rather than a raw Time signal.

- **Migration Path:** If a user connects Time to Sine, the system works but degrades. If they connect Phasor to Sine, it remains perfect forever.

- **Implicit Phasors:** To preserve user experience, "Generator" blocks (like LFO) are internally composed of a Phasor state + a Waveshaper function. They do not read Global Time; they read Global Delta Time.

### 3.3 Noise Generators (The Special Case)

Noise is typically a function of position or time: Noise(x, t). State wrapping is harder here because Noise is non-periodic.

- **The "Moving Origin" Solution:** Instead of passing t, we scroll the domain.

- **Implementation:** The Noise block maintains a seed_offset state.\
  \$\$Offset\_{new} = Offset\_{old} + (Speed \times dt)\$\$

- **The Trick:** When Offset gets too large (e.g., \$\> 100,000\$), we cannot wrap it (or the noise repeats). However, since noise is random, we can periodically **re-seed** or jump the coordinate system back to 0 seamlessly if we blend between two noise samplers.

- **Phase 0 Compromise:** For v3.0, we simply allow Noise inputs to degrade over very long durations (24h+), or strictly recommend modulating Noise with periodic Phasors.

## 4. Handling "Long" Linear Time

Some blocks, like Envelopes (Attack-Decay-Sustain-Release) or Video Playback, require linear time and cannot wrap at 1.0.

### 4.1 The "Local Epoch" Pattern

An Envelope block is triggered at a specific moment \$T\_{trigger}\$.

- **Don't:** Store \$T\_{trigger}\$ and compare (Time - T_trigger). This fails when Time is huge.

- **Do:** Store Elapsed_Time initialized to \$0.0\$.

  - On every frame, Elapsed_Time += dt.

  - If Elapsed_Time \> Duration, the envelope effectively sleeps.

- **Benefit:** Since the active duration of an envelope is usually short (seconds to minutes), f32 precision at \$T=60s\$ is excellent. The counter resets to 0.0 on the next trigger, restoring full precision.

## 5. Synchronization & Continuity (CPU vs. GPU)

Moving state to the GPU introduces a "Desync Risk." The CPU (JS) and GPU (Shader) must agree on the Phase.

### 5.1 The Reset Pulse

When the user hits "Stop/Rewind," we cannot just set Time = 0. We must broadcast a **Reset Signal**.

- **Mechanism:** A global Uniform reset_trigger (bool) is sent for one frame.

- **Shader Logic:** if (uniforms.reset) { state.phase = 0.0; }

- **Result:** All phasors snap to zero simultaneously, regardless of their current accumulated drift.

### 5.2 The "Bake" Invariant

For rendering offline video (e.g., "Export to MP4"), we cannot rely on dt accumulation because real-time accumulation introduces tiny floating-point drift compared to a perfect mathematical calculation.

- **The Bake Mode:** When exporting, the runtime must switch strategies.

  - It calculates the *exact* target phase for every frame: \$Phase = (FrameIndex / FrameRate \times Freq) \pmod 1\$.

  - It **uploads** this phase state to the Arena manually for each frame.

  - This ensures the exported video is mathematically perfect, even if the real-time preview drifted by 0.0001% over an hour.

## 6. Verification: The 4-Hour Test

How do we prove Phase 0 is complete before Phase 1 (WebGPU) starts?

**The Regression Test:**

1.  **Mock the Clock:** Inject a fake time source into the CPU runtime.

2.  **Fast Forward:** Set the clock to \$T = 14,400.0\$ (4 hours).

3.  **Run Simulation:** Execute the graph for 100 frames using normal dt steps (16ms).

4.  **Capture:** Record the output of a standard Sine LFO.

5.  **Compare:** Compare the waveform smoothness against a run at \$T = 0.0\$.

    - *Fail:* If the waveform at T+4h is "steppy" or "jagged," you are still leaking Absolute Time into a calculation.

    - *Pass:* If the waveform is smooth, the Phase-Lock is holding.

## 7. Summary of Required Changes

1.  **Refactor RuntimeContext:** Add dt (high precision) as a first-class citizen alongside time.

2.  **Refactor Phasor / Oscillator blocks:**

    - Convert internal logic from functional (sin(t)) to stateful accumulators (p += dt).

    - Implement the modulo wrap logic in the evaluate function.

3.  **Refactor Envelope blocks:** Switch to Elapsed_Time accumulation reset on trigger.

4.  **Update Math blocks:** Review Sin, Cos, Tan. Add warnings/linting in the editor if a user connects the raw Time global directly to these inputs (suggesting a Phasor instead).

This refactor decouples your instrument's stability from its uptime. It ensures that a patch left running in an installation gallery for a month looks exactly as fresh as it did the moment it was booted.
