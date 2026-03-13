# Context: P0-2 - Phase-Locking - UNIMPLEMENTED Items

## Target State
1. **temporal-comparison.test.ts**: Dedicated test verifying dt ordering, phase monotonicity, tMs monotonicity, and backward-time clamping.
2. **executeFrameStepped.test.ts**: Dedicated test verifying deterministic stepped frame execution with known dt values and correct phase channel advancement.

## Current State
- `src/runtime/__tests__/phase-continuity-offset.test.ts` - Tests phase continuity offset reconciliation (exists, partial coverage)
- No temporal-comparison or executeFrameStepped test files
- `src/runtime/timeResolution.ts` - Implementation exists and handles dt, monotonicity, and phase wrapping correctly

## Files Involved
- `src/runtime/__tests__/temporal-comparison.test.ts` - Needs to be created
- `src/runtime/__tests__/executeFrameStepped.test.ts` - Needs to be created

## Suggested Approach
1. **temporal-comparison.test.ts**:
   - Test that dt is always >= 0 (backward time clamps)
   - Test that tMs is monotonically non-decreasing across frames
   - Test that phaseA/phaseB are always in [0, 1)
   - Test phase ordering within a single period
   - Test wrap detection accuracy

2. **executeFrameStepped.test.ts**:
   - Create a minimal compiled program
   - Step through N frames with known dt values
   - Verify phase channels advance proportionally to dt
   - Verify phasor state accumulation matches expected values

## Risks
- Low risk: the underlying implementation is correct; these are test coverage gaps
- The phase-continuity-offset test covers some of this ground already
