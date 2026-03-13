# Context: P0-2 - Phase-Locking for Infinite Runtime

## Target State
- All time-based state runs forever on f32 without jitter
- Phase wrapping: `phase = (phase + delta) % 1.0`, bounded in `[0, 1)`
- Runtime uses `dt` (delta time) not absolute `t`
- Phasor stores persistent state, wraps to `[0, 1)` via Wrap01
- Waveshapers consume phase, not raw time
- State writes pass through phase-wrap policy
- Hot-swap preserves phase continuity

## Current State
All core requirements are implemented (DONE):
- **Delta time first-class**: `src/runtime/timeResolution.ts:185-189` computes `dt` from frame timestamps, clamps backward time to `dt = 0`
- **Monotonic tMs**: `src/runtime/timeResolution.ts:193-194` enforces `tMs` never decreases
- **Phase channels bounded [0,1)**: `src/runtime/timeResolution.ts:200-204` phases wrapped via `wrapToPhase01()`
- **wrapToPhase01**: `src/utilities/phase.ts:8-11` implements canonical `value % 1` wrapping
- **Phasor block stateful**: `src/blocks/scalar/phasor.ts:48-70` -- reads prevPhase, adds `frequency * dt / 1000`, wraps via `Wrap01` opcode
- **State write policy**: `src/runtime/StateWritePolicy.ts:20-23` -- `applyStateWritePolicy()` wraps phase-like state via `wrapToPhase01()`
- **Phase continuity on hot-swap**: `src/runtime/timeResolution.ts:100-174` -- `reconcilePhaseOffsets()` adjusts offsets when time model periods change
- **Phase-continuity test**: `src/runtime/__tests__/phase-continuity-offset.test.ts` exists
- **Oscillator as waveshaper**: `src/blocks/scalar/oscillator.ts` operates on phase/radians input (waveshaping pattern)

One item for review:
- Time model phases use division `(tMs / period) % 1.0` instead of accumulation

## Files Involved
- `src/runtime/timeResolution.ts` - Time resolution with division-based phases
- `src/blocks/scalar/phasor.ts` - Accumulation-based Phasor block
- `src/runtime/StateWritePolicy.ts` - Phase wrap enforcement
- `src/utilities/phase.ts` - Phase math

## Suggested Approach
- Document that division-based phase for time channels is a deliberate improvement over accumulation (avoids f32 drift for very long runtimes)
- Verify that the Phasor block's accumulation is safe given f32 precision constraints (it should be, since it wraps every cycle)

## Risks
- Division-based approach may have slightly different phase progression than accumulation due to floating-point representation of `tMs / period`
- For very high frequencies and long runtimes, the monotonicTMs value itself grows large (Float64 in JS, but would be f32 on GPU)
