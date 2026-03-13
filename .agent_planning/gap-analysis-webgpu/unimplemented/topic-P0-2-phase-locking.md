# P0-2: Phase-Locking for Infinite Runtime - UNIMPLEMENTED Items

## Item 1: Temporal Comparison Test
**Spec says**: Verification gate 2: `pnpm vitest run src/runtime/__tests__/temporal-comparison.test.ts`
**Implementation**: No file exists at `src/runtime/__tests__/temporal-comparison.test.ts`.
**Gap**: The spec expects a dedicated test file for temporal comparison semantics. This test should verify that time channels produce correct relative comparisons (dt ordering, phase monotonicity within a period, tMs monotonicity) and that backward-time clamping works correctly.
**Classification**: UNIMPLEMENTED

## Item 2: Stepped Frame Execution Test
**Spec says**: Verification gate 3: `pnpm vitest run src/runtime/__tests__/executeFrameStepped.test.ts`
**Implementation**: No file exists at `src/runtime/__tests__/executeFrameStepped.test.ts`.
**Gap**: The spec expects a dedicated test file for stepped frame execution. This test should verify that frame-by-frame execution produces deterministic results with known dt values, and that phase channels advance correctly step by step.
**Classification**: UNIMPLEMENTED
