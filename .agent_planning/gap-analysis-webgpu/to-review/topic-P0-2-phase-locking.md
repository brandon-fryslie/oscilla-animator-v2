# P0-2: Phase-Locking for Infinite Runtime - TO-REVIEW Items

## Item 1: Phase Computation Uses Division-Based Approach Rather Than Accumulation
**Spec says**: "Phasor Is Stateful" -- Phasor stores persistent phase state. Per frame computes increment from `frequency * dtSeconds`. Writes wrapped phase back.
**Implementation**: Two phase systems exist:
1. **Time model phases** (`src/runtime/timeResolution.ts:200-204`): `rawPhaseA = (monotonicTMs / periodAMs) % 1.0` -- division-based, not accumulation. This is safe for infinite runtime.
2. **Phasor block** (`src/blocks/scalar/phasor.ts:48-70`): Uses stateful accumulation: `prevPhase + frequency * dt`, then `Wrap01`. This matches spec exactly.
**Gap**: The time-model phase channels use division rather than accumulation. This is technically safer for infinite runtime (no floating-point drift from repeated accumulation) but differs from the spec's description of phase wrapping via `phase = (phase + delta) % 1.0`. The Phasor block itself uses the accumulation approach as specified. Review whether the division-based time-model approach is intentionally different and whether this should be documented as a deliberate improvement.
**Classification**: TO-REVIEW
