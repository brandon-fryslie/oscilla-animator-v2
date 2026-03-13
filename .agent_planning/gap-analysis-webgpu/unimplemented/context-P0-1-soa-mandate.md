# Context: P0-1 - SoA Mandate - UNIMPLEMENTED Items

## Target State
A `forbidden-patterns.test.ts` file that mechanically enforces:
1. No legacy f64/object storage labels in runtime/compiler hot paths
2. No AoS packing in production code (only SoA)
3. No parallel type systems or alternate memory models
4. No runtime address derivation bypassing compiler-emitted artifacts

## Current State
- `src/__tests__/architecture-guardrails.test.ts` - Exists but may not cover all forbidden patterns
- `src/compiler/__tests__/no-legacy-types.test.ts` - Blocks some legacy type patterns
- No file at `src/__tests__/forbidden-patterns.test.ts`

## Files Involved
- `src/__tests__/forbidden-patterns.test.ts` - Needs to be created (or `architecture-guardrails.test.ts` extended)

## Suggested Approach
Either:
1. Rename/alias `architecture-guardrails.test.ts` to match spec reference
2. Or create `forbidden-patterns.test.ts` that imports/re-exports the guardrail tests
3. Extend coverage to include SoA-specific forbidden patterns

## Risks
- Low risk: this is a test organization issue, not a functionality gap
