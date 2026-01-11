Below is the complete, closed-form, engineering-grade specification for the Phase Continuity System used by Oscilla to guarantee zero-jank animation under scrubbing, looping, hot-swap, export, and time-root changes.

This spec is normative.
Any implementation that violates it will produce visual pops or nondeterminism.

⸻

Phase Continuity System

(Anti-Jank Time Gauge Specification)

1. Definitions

Let:

t_abs       = absolute time in milliseconds from TimeRoot
t_model     = time after TimeModel mapping (finite, infinite, etc)
φ_base(t)   = raw phase in ℝ, computed from t_model
φ_eff(t)    = effective phase seen by the patch
Δφ          = phase offset (persistent state)
wrap(x)     = x mod 1  (range [0,1))

The TimeRoot produces base phase:

φ_base(t) = t_model / period

The system exposes effective phase:

φ_eff(t) = wrap( φ_base(t) + Δφ )

All blocks consume φ_eff, never φ_base.

⸻

2. Invariant

For all frames, under all operations:

Effective phase must be continuous in time unless explicitly reset by user action.

Formally:

lim(t→t0⁻) φ_eff(t) = lim(t→t0⁺) φ_eff(t)

even when t_model jumps.

⸻

3. Time Discontinuity

A time discontinuity is any event where:

t_model(new) ≠ t_model(old) + Δt

This occurs when:

• scrubbing
• jumping the playhead
• looping finite time
• hot-swapping patches
• switching TimeRoots
• changing playback speed
• export stepping
• time window resizing

The TimeModel must emit a flag:

timeDerive.out.wrapEvent = true

whenever a discontinuity occurs.

⸻

4. State

The runtime maintains a persistent time gauge:

timeState = {
prevBasePhase : float
phaseOffset   : float
}

This state is:

• preserved across frames
• preserved across hot-swap
• preserved across export stepping

⸻

5. Phase Reconciliation Rule

When a discontinuity occurs:

oldEff = wrap( prevBasePhase + phaseOffset )
newBase = φ_base(new_t)

phaseOffset += oldEff - newBase

This guarantees:

wrap(prevBasePhase + oldOffset)
==
wrap(newBase + newOffset)

Therefore:

φ_eff remains continuous


⸻

6. Per-Frame Update

Every frame:

if wrapEvent:
reconcile phaseOffset

prevBasePhase = φ_base(current_t)

Then:

phaseA = wrap( φ_base + phaseOffset )

This is what enters the SignalExpr graph.

⸻

7. Multi-Phase Support (phaseA / phaseB)

Each TimeRoot produces independent clocks:

φ_baseA(t)
φ_baseB(t)

Each has its own offset:

Δφ_A
Δφ_B

They are reconciled independently.

⸻

8. Determinism Guarantee

Offline export uses the exact same rule.

Given:

• same seed
• same TimeModel
• same discontinuity events

Then:

φ_eff(frame N) is bit-identical between live and export

No drift is permitted.

⸻

9. What Is Not Allowed

These are forbidden:

• Resetting phase on hot-swap
• Recomputing phase from wall time
• Deriving phase from frame index
• Re-zeroing phase on loop
• Skipping reconciliation
• Letting blocks see φ_base

Any of these causes jank.

⸻

10. Why This Is Non-Optional

This is not a visual trick.
This is a gauge invariance.

Time is being re-parameterized.
Phase is a conserved quantity under that transform.

Without this:

• animation continuity is impossible
• scrubbing cannot work
• loops pop
• patch edits break motion
• export cannot match playback

⸻

11. Where It Lives

This logic exists only in:

timeDerive step
RuntimeState.timeState

It is not in the compiler.
It is not in blocks.
It is not in IR.

It is part of the time → phase mapping.

⸻

12. One-Line Rule

Phase is invariant under time remapping. We enforce that by maintaining a global phase offset that absorbs all discontinuities.

That is the complete system.