# P0-1: SoA Mandate - Memory Layout Refactor - TRIVIAL Items

## Item 1: Verification Test File Name
**Spec says**: Run `pnpm vitest run src/__tests__/forbidden-patterns.test.ts`
**Implementation**: The file does not exist at this exact path. The equivalent guardrail test is `src/__tests__/architecture-guardrails.test.ts` and `src/compiler/__tests__/no-legacy-types.test.ts`.
**Gap**: Spec references a file name that doesn't exist; equivalent tests exist under slightly different names.
**Classification**: TRIVIAL

## Item 2: pnpm vs npm Command Reference
**Spec says**: Verification commands use `pnpm vitest run ...`
**Implementation**: Project uses `npm` (per `CLAUDE.md`: `npm run test`, `npx vitest run ...`).
**Gap**: Package manager reference mismatch. Both work identically for running tests.
**Classification**: TRIVIAL
