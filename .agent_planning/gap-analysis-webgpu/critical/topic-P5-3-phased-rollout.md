# P5-3: Phased Rollout / Post-Cutover Fix-Forward - CRITICAL Items

## Item 1: Missing Forbidden-Pattern Tests (Phase A Acceptance Gate)
**Spec says**: Phase A acceptance requires `pnpm vitest run src/__tests__/forbidden-patterns.test.ts`. CLAUDE.md at `.claude/CLAUDE.md` also references this file as enforcing architectural constraints.
**Implementation**: File `src/__tests__/forbidden-patterns.test.ts` does NOT exist (verified via glob search). Both the spec and the project CLAUDE.md reference it as if it exists.
**Gap**: The Phase A acceptance gate cannot be run. There is no automated test preventing reintroduction of Canvas2D/SVG runtime dependencies or other legacy patterns. This is a documentation-reality mismatch in a critical guardrail.
**Classification**: CRITICAL

## Item 2: Missing Phase B Acceptance Tests
**Spec says**: Phase B acceptance requires:
- `src/compiler/__tests__/steel-thread-dual-topology.test.ts`
- `src/render/webgpu/__tests__/WebGPURenderer.test.ts`
- `src/services/__tests__/AnimationLoop.test.ts`
- `src/runtime/__tests__/executeFrameStepped.test.ts`
**Implementation**: None of these four test files exist (verified via glob).
**Gap**: Phase B acceptance criteria cannot be evaluated -- all four referenced tests are missing.
**Classification**: CRITICAL
