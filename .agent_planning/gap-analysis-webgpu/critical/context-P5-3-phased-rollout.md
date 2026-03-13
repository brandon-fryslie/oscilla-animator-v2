# Context: P5-3 - Phased Rollout / Post-Cutover Fix-Forward

## Target State
The spec requires five sequential phases (A-E) with deterministic acceptance criteria:
- Phase A: Dead seam removal + forbidden-pattern tests
- Phase B: Compiler/runtime contract completion with 4 specific test suites
- Phase C: Continuity & observability hardening with 5 test suites
- Phase D: Performance discipline under high instance counts
- Phase E: Integration demo + documentation lock

## Current State
- Phase A: Legacy renderers are removed from active code, but the acceptance test (`forbidden-patterns.test.ts`) does not exist. No automated guard prevents regression.
- Phase B: All four referenced acceptance tests are missing. The compiler/runtime pipeline works functionally but acceptance evidence is not mechanically verifiable.
- Phase C: 2 of 5 tests exist (`phase-continuity-offset.test.ts`, `ValueRenderer.test.ts`). Three are missing.
- Phase D: Bench infrastructure exists but GPU-path-specific validation is unverified.
- Phase E: No dedicated v3 steel thread demo verified.

## Files Involved
- `src/__tests__/forbidden-patterns.test.ts` -- MISSING (must be created)
- `src/compiler/__tests__/steel-thread-dual-topology.test.ts` -- MISSING
- `src/render/webgpu/__tests__/WebGPURenderer.test.ts` -- MISSING
- `src/services/__tests__/AnimationLoop.test.ts` -- MISSING
- `src/runtime/__tests__/executeFrameStepped.test.ts` -- MISSING
- `src/runtime/__tests__/continuity-integration.test.ts` -- MISSING
- `src/runtime/__tests__/StepDebugSession.test.ts` -- MISSING
- `src/runtime/__tests__/phase-continuity-offset.test.ts` -- EXISTS
- `src/ui/debug-viz/ValueRenderer.test.ts` -- EXISTS

## Suggested Approach
1. **Highest priority**: Create `forbidden-patterns.test.ts` with grep-based guards against Canvas2D/SVG imports, legacy renderer references, and dual-runtime flags. This is low effort and high value.
2. **Phase B tests**: These require integration-level test infrastructure. Consider whether they should be exact matches to spec names or functionally equivalent tests under different names.
3. **Phase C tests**: StepDebugSession and continuity-integration tests may exist under different names. Search for functionally equivalent tests before creating new ones.

## Risks
- CLAUDE.md references `forbidden-patterns.test.ts` as existing -- new contributors may assume it's enforced when it isn't.
- Missing acceptance tests mean phases cannot be formally signed off.
- Some referenced tests may exist under different names, requiring an audit.
