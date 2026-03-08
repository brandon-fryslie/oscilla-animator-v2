---
parent: ../INDEX.md
topic: time-system
order: 3
---

# Time System

> Time is the heartbeat of Oscilla. The GPU executes simulation steps with f32 phase-locking for infinite runtime.

**Related Topics**: [02-block-system](./02-block-system.md), [05-runtime](./05-runtime.md)
**Key Terms**: [TimeRoot](../GLOSSARY.md#timeroot), [Rail](../GLOSSARY.md#rail), [tMs](../GLOSSARY.md#tms), [dt](../GLOSSARY.md#dt)
**Relevant Invariants**: [I1](../INVARIANTS.md#i1-time-is-monotonic-and-unbounded), [I2](../INVARIANTS.md#i2-transport-continuity-across-hot-swap), [I5](../INVARIANTS.md#i5-single-time-authority)

---

## Overview

Oscilla is a **looping, interactive visual instrument**. The time system provides the temporal baseline for the GPU simulation:

1. **Single time authority** - One source of truth for simulation time.
2. **Monotonic f32 time** - Time always increases; CPU marshalling handles 64-bit to 32-bit conversion.
3. **Delta Time (dt)** - First-class input for frame-rate independent physics.
4. **Phase Rails** - Bounded cyclic values `[0, 1)` that run forever without precision loss.

---

## Time Invariants

### Invariant: Time is Monotonic and Unbounded

`tMs` is monotonic at runtime. The CPU loop calculates the current time and ensures it never decreases across frames.

### Invariant: f32 Phase-Lock

The simulation runs exclusively on `f32`. To prevent precision jitter over long durations:
- **Unbounded accumulation** (`t += dt`) is forbidden for general animation.
- **Phase Wrapping** is mandatory: all phasors must implement `phase = (phase + delta) % 1.0`.

### Invariant: Transport Continuity

When recompiling (hot-swap), simulation state continues. Gauge offsets absorb jumps in base phase to preserve effective motion.

---

## Time Variables & Input Marshalling

The CPU writes the temporal state into the Arena Header every frame.

### dt (Delta Time)

Delta time since last frame in seconds (or ms).
- **Type**: `float`
- **CanonicalType**: `one + continuous + float`
- **Semantics**: The step size for physics integration and stateful smoothing.

### tMs

Simulation time in milliseconds.
- **Type**: `float` (marshalled from CPU double)
- **Monotonic**: Guaranteed by CPU scheduler.

### phaseA / phaseB

Primary and secondary phase rails:
- **Type**: `float` (with phase unit)
- **Range**: Strictly `[0, 1)`.
- **Semantics**: CPU-calculated bounded cyclic values.

---

## Phase System

### Phase Wrap Semantics

Phase values are always in the range [0, 1) with automatic wrap:
- `0.9 + 0.2 = 0.1` (wrapped)
- `1.0 → 0.0` (normalized)

### Phase Continuity (Gauging)

When changing speed/period or hot-swapping, the runtime applies a **Phase Offset (Gauge)**:
`phase_eff = wrap(phase_base + offset)`

This ensures the effective animation seen by the user remains continuous even when the underlying time model jumps.

---

## Scheduling Model

### One Tick Model (v3.0)

Every tick (render frame):

1. **CPU**: Sample wall clock and compute `dt`.
2. **CPU**: Marshall `tMs`, `dt`, and base phases into the `Arena_Read` header.
3. **GPU**: Apply continuity gauges to state.
4. **GPU**: Execute simulation kernels (SoA parallel).
5. **GPU**: Write new state to `Arena_Write`.
6. **GPU**: Dispatch Draw Prep and Render.

---

## Determinism

### Deterministic Replay (Invariant I21)

Given the same `PatchRevision`, `Seed`, and `InputRecord` (including the exact `dt` sequence), the GPU output is bit-identical across runs. This is the foundation for collaborative editing and server-authoritative playback.

---

## See Also

- [02-block-system](./02-block-system.md) - TimeRoot and rail blocks
- [05-runtime](./05-runtime.md) - How time is marshalled to the GPU
- [Invariant: I1](../INVARIANTS.md#i1-time-is-monotonic-and-unbounded)
