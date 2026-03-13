# P0-1: SoA Mandate - Memory Layout Refactor - UNIMPLEMENTED Items

## Item 1: Forbidden-Patterns Test File
**Spec says**: Verification gate 4 references `src/__tests__/forbidden-patterns.test.ts`
**Implementation**: This exact file does not exist. `src/__tests__/architecture-guardrails.test.ts` provides some architectural checks. `src/compiler/__tests__/no-legacy-types.test.ts` blocks legacy type patterns.
**Gap**: The spec's explicit "forbidden-patterns" guardrail test file is absent. While equivalent checks may exist under different names, the spec's listed verification gate references a file that should exist. The architecture guardrails test may not cover all the specific forbidden patterns the spec intends (e.g., blocking legacy f64/object runtime storage labels, AoS usage outside of tests).
**Classification**: UNIMPLEMENTED
