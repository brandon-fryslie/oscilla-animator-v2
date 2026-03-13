# P5-3: Phased Rollout / Post-Cutover Fix-Forward - TO-REVIEW Items

## Item 1: Phase A - Forbidden-Pattern Tests
**Spec says**: Add forbidden-pattern tests preventing reintroduction of Canvas2D/SVG runtime dependencies. Acceptance: `pnpm vitest run src/__tests__/forbidden-patterns.test.ts`.
**Implementation**: CLAUDE.md references `src/__tests__/forbidden-patterns.test.ts` as an architectural enforcement tool, but this file does not exist on disk (glob search returned no results). No automated guard against reintroduction of legacy renderer references.
**Gap**: The spec's Phase A acceptance test does not exist. CLAUDE.md claims it does, creating a documentation-reality mismatch. This should either be created or the reference removed.
**Classification**: TO-REVIEW

## Item 2: Phase B - Compiler/Runtime Contract Tests
**Spec says**: Acceptance via `steel-thread-dual-topology.test.ts`, `WebGPURenderer.test.ts`, `AnimationLoop.test.ts`, `executeFrameStepped.test.ts`.
**Implementation**: Need to verify these test files exist and pass. The spec references specific test paths.
**Gap**: Test existence needs verification; they may or may not exist.
**Classification**: TO-REVIEW

## Item 3: Phase C - Continuity & Observability Tests
**Spec says**: Acceptance via `continuity-integration.test.ts`, `phase-continuity-offset.test.ts`, `StepDebugSession.test.ts`, `ValueRenderer.test.ts`, `forbidden-patterns.test.ts`.
**Implementation**: `ValueRenderer.test.ts` exists at `src/ui/debug-viz/ValueRenderer.test.ts`. Other tests need verification.
**Gap**: Partial test coverage. Need to verify all referenced tests exist.
**Classification**: TO-REVIEW
