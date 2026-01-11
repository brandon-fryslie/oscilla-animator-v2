# System Invariants: The 4 Stateful Primitives

**Date**: 2026-01-01
**Status**: Finalized
**Context**: Defining the minimal set of "Infrastructure Blocks" required to support stateful modulation.

## Core Principle: Minimal Canonical State

To prevent an explosion of utility blocks (e.g., separate blocks for Slew, Glide, LPF, LFO, SawLFO), the system defines **four** canonical stateful primitive blocks. These primitives cover the vast majority of modulation and logic needs.

The Editor may present "friendly" names (e.g., "Slew Limiter", "Low Pass Filter") to the user, but under the hood, they must map to one of these four primitives in the graph.

---

## 1. `UnitDelay` ($z^{-1}$)

*   **Function**: Outputs the value from the previous frame ($y[t] = x[t-1]$).
*   **State**: Stores exactly one sample/frame of data.
*   **Role**:
    *   Breaking algebraic loops (feedback).
    *   Physical modeling algorithms.
    *   Building custom filters.
*   **Previous Names**: FrameLatch.

## 2. `Lag` (The Follower)

*   **Function**: Moves the output towards the input value over time, constrained by "physics".
*   **Parameters**:
    *   `Rise`: Time to reach target when increasing.
    *   `Fall`: Time to reach target when decreasing.
    *   `Mode`:
        *   **Linear**: Constant rate of change (Slew Limiting / Portamento).
        *   **Exponential**: Rate proportional to distance (1-Pole Low Pass Filter).
*   **Role**:
    *   Smoothing signals.
    *   Envelope following.
    *   Signal conditioning.
*   **Previous Names**: SlewBlock, FollowerBlock.

## 3. `Phasor` (The Time Keeper)

*   **Function**: Generates a ramping signal from 0.0 to 1.0 based on a frequency/rate input ($y[t] = (y[t-1] + \Delta) \% 1.0$).
*   **Role**: The universal driver for time-based modulation.
    *   **Sine LFO**: `Phasor` -> `Math.sin()`.
    *   **Triangle LFO**: `Phasor` -> `Math.triangle()`.
    *   **Square LFO**: `Phasor` -> `Math.greaterThan(0.5)`.
    *   **Sequencer Clock**: `Phasor` driving a lookup.
*   **Previous Names**: LFOBlock, PhasorBlock, Accumulator.

## 4. `SampleAndHold` (The Freezer)

*   **Function**: Updates its output to match the input *only* when the `Trigger` input transitions high. Otherwise, it holds the previous output value.
*   **Role**:
    *   Stepped Randomness (Noise -> S&H).
    *   Locking/Freezing values.
    *   Discrete sequencing logic.
*   **Previous Names**: LatchBlock.
