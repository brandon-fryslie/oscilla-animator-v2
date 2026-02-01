# Definition of Done: Type-Compat-Purity

Generated: 2026-02-01T12:00:00Z
Status: PARTIALLY READY
Plan: SPRINT-20260201-120000-type-compat-purity-PLAN.md

## Acceptance Criteria

### isTypeCompatible Purity
- [ ] Function signature: `isTypeCompatible(from: CanonicalType, to: CanonicalType): boolean`
- [ ] No `sourceBlockType` or `targetBlockType` parameters anywhere in the function
- [ ] No imports of `getBlockCardinalityMetadata` or `isCardinalityGeneric` in `analyze-type-graph.ts`
- [ ] Call site at `analyze-type-graph.ts` line 182 passes only `(fromType, toType)`
- [ ] Enforcement test (from Sprint A) un-skipped and passing

### Cardinality-Generic Block Compatibility
- [ ] Chosen approach documented (Option A/B/C)
- [ ] Cardinality-generic blocks compile with mixed signal+field inputs
- [ ] Type compatibility determined purely from CanonicalType (no block metadata)
- [ ] Test: signal -> Mul(field) compiles correctly
- [ ] Test: field -> Add(signal) compiles correctly
- [ ] Test: field -> Sin -> downstream field compiles correctly

### Cardinality-Preserving Block Output Types
- [ ] Block outputs in `portTypes` reflect resolved cardinality (not static BlockDef cardinality)
- [ ] Instance reference propagated correctly through cardinality-preserving chains
- [ ] Test: Mul(field_input) output type has cardinality=many with correct instance
- [ ] Test: Mul(signal_input) output type has cardinality=one

### Global
- [ ] `npm run build` passes (zero typecheck errors)
- [ ] `npm run test` passes (all tests green)
- [ ] No new block-name lookups introduced in type compatibility logic
- [ ] Existing compilation test suite passes without modification (or modifications are documented)

## Exit Criteria (for MEDIUM items to reach HIGH)
- [ ] User has decided cardinality polymorphism strategy (SUMMARY.md P3 #6)
- [ ] Prototype of chosen approach compiles 3+ mixed-cardinality test graphs
- [ ] Instance propagation rule defined, documented, and tested
- [ ] Multi-field-input edge case handled
