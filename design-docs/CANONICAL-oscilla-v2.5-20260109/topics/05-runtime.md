---
parent: ../INDEX.md
topic: runtime
order: 5
---

# Runtime

> How compiled programs execute frame by frame on the GPU.

**Related Topics**: [04-compilation](./04-compilation.md), [03-time-system](./03-time-system.md), [16-coordinate-spaces](./16-coordinate-spaces.md)
**Key Terms**: [Arena](../GLOSSARY.md#arena), [Ping-Pong Storage](../GLOSSARY.md#ping-pong-storage), [Compute Dispatch](../GLOSSARY.md#compute-dispatch)
**Relevant Invariants**: [I1](../INVARIANTS.md#i1-time-is-monotonic-and-unbounded), [I3](../INVARIANTS.md#i3-state-continuity-with-stable-ids), [I8](../INVARIANTS.md#i8-slot-addressed-execution)

---

## Overview

The runtime orchestrates the GPU-native execution of simulation logic. Key properties:

- **GPU as the Computer**: The CPU acts as a scheduler; 100% of simulation logic runs in WGSL kernels.
- **Arena-Addressed**: Memory is accessed via physical byte offsets in a monolithic GPU buffer.
- **Ping-Pong Storage**: Strict Read-Modify-Write safety via double-buffering.
- **Deterministic**: Same inputs → same outputs across hardware.

---

## Execution Model: The Frame Loop

Every frame, the `RuntimeExecutor` executes a canonical sequence of stages:

1. **Input Marshalling**: CPU writes the "Input State" (Mouse, MIDI, dt) into the Arena Header.
2. **Compute Dispatch (Physics)**: Parallel simulation over all active instances.
3. **Draw Prep Dispatch**: GPU writes indirect command records from simulation counters.
4. **Render Pass (Sink)**: Rasterization of the simulated state.
5. **The Swap**: Ping-pong buffer role rotation.

---

## Storage Model: The Arena

State exists permanently on the GPU in a massive, channel-separated buffer called the **Arena**.

### Memory Layout (SoA)

The Arena is partitioned into functional zones. The compiler hardcodes these offsets via the `GpuLayout`.

| Zone | Role | Access |
|------|------|--------|
| **Header** | Uniforms (Time, Mouse, Resolution) | Read-Only (for GPU) |
| **Constants** | Global parameters (LFOs, Math) | Random Access |
| **Channels** | Instance data (SoA components) | Coalesced Linear |
| **State** | Persistent state (UnitDelay, Lag) | Read (In) / Write (Out) |
| **Gauge** | Continuity offsets | Read/Write |

### Ping-Pong Strategy

To prevent race conditions, we allocate two identical buffers: `Arena_Read` and `Arena_Write`.
- **Frame N**: Reads A, Writes B.
- **Frame N+1**: Reads B, Writes A.

---

## Input Marshalling

The CPU synchronizes user intent with the GPU at the very start of the frame.

### The Uniform Block

A fixed-size (256-byte) block at the start of the Arena containing:
- `GlobalTime` (monotonic f32)
- `DeltaTime` (dt)
- `MouseX / MouseY` (normalized)
- `Resolution` (pixels)

### The Transfer

The CPU uses `device.queue.writeBuffer()` to upload the latest input snapshot directly into the `Arena_Read` buffer before any compute dispatch.

---

## Compute Dispatch

The GPU executes the simulation via **Workgroups** (fixed size: 64 threads).

### Dispatch Geometry

The CPU calculates the group count per frame:
`GroupCount = ceil(InstanceCount / 64)`

### Kernel Phases

The generated compute shader follows a strict execution order:
1. **Global Phase**: Thread 0 computes and writes global parameters (cardinality: one).
2. **Tail Guard**: Invocations beyond `InstanceCount` return immediately.
3. **Lane Phase (SoA)**: All threads execute the simulation logic in parallel.
4. **State Update**: New state is written to the `Arena_Write` buffer.

---

## Draw Prep & Indirect Command ABI

Draw Prep bridges the gap between simulation and rendering.

### Invariant: GPU-Driven Logistics

The CPU **never** writes dynamic draw counts. The `DrawPrep` kernel reads active instance counters from the Arena and writes hardware-native indirect command records.

### Indirect Buffer Regions

The system maintains a monolithic Indirect Buffer with two fixed regions:
- **Indexed Region**: 20-byte `DrawIndexedIndirectArgs` records.
- **Non-Indexed Region**: 16-byte `DrawIndirectArgs` records.

---

## State Management & Migration (Invariant I3)

State is keyed by stable `StateId`.

### History Mechanics

Because we swap read/write buffers every frame, `Arena_Read` automatically contains the value calculated 16ms ago.

### Hot-Swap Migration

When the patch changes, the runtime executes a specialized **Migration Compute Pass**:
1. Maps old `StateId` offsets to new `StateId` offsets.
2. Copies persistent data from the old Arena to the new Arena.
3. Prevents simulation resets during live editing.

---

## Async Observability (The "Spy")

To visualize live data (Sparklines, Probes) without stalling the GPU:

### Async Readback

1. **Surgical Slice**: The CPU identifies a small set of "Active Probes" (Offsets).
2. **Fire-and-Forget Copy**: The GPU copies these specific bytes to a `MAP_READ` buffer.
3. **Async Map**: The CPU calls `mapAsync()` and reads the data 2-3 frames later when the GPU is idle.

This ensures the UI remains fluid even under massive simulation workloads.

---

## See Also

- [04-compilation](./04-compilation.md) - How Arena offsets are resolved
- [06-renderer](./06-renderer.md) - How the indirect buffer is consumed
- [18-camera-projection](./18-camera-projection.md) - Matrix generation kernel
- [Invariant: I8](../INVARIANTS.md#i8-slot-addressed-execution)
