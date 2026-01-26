# Definition of Done: expr-block-integration

Generated: 2026-01-25-192523
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260125-192523-expr-block-integration-PLAN.md

## Acceptance Criteria

### Expression Block Varargs Input Definition

- [ ] Expression block has `refs` input with `isVararg: true`
- [ ] VarargConstraint: `payloadType: 'float'`, `cardinalityConstraint: 'any'`
- [ ] `exposedAsPort: false`, `hidden: true` on refs input
- [ ] Existing inputs (in0-in4, expression) unchanged
- [ ] Block definition passes validation
- [ ] Unit tests in `src/blocks/__tests__/expression-blocks.test.ts`

### Expression Block Lowering with Varargs

- [ ] Lower function handles `varargInputsById.refs`
- [ ] Builds `blockRefs` signal map from vararg connections
- [ ] Creates BlockReferenceContext with AddressRegistry
- [ ] Passes context to `compileExpression()`
- [ ] Works with block references only (no fixed inputs)
- [ ] Works with mixed inputs (in0 + refs)
- [ ] Unit tests for lowering scenarios

### LowerCtx Extension

- [ ] `LowerCtx.addressRegistry?: AddressRegistry` added
- [ ] `LowerCtx.varargConnections?: ReadonlyMap<string, readonly ResolvedVarargConnection[]>` added
- [ ] Block lowering pass (pass6) populates fields
- [ ] Non-varargs blocks unaffected (fields undefined)
- [ ] Type definitions updated in registry.ts

### End-to-End Integration Tests

- [ ] Test: `Circle1.radius * 2` compiles (single ref)
- [ ] Test: `Circle1.radius + Osc1.out` compiles (multi ref)
- [ ] Test: `in0 * Circle1.radius` compiles (mixed)
- [ ] Test: Complex formula with block refs
- [ ] Test: Error for invalid block name
- [ ] Test: Error for non-float output reference
- [ ] Test: Signal cardinality preserved
- [ ] Test: Field cardinality propagates
- [ ] Tests in `src/blocks/__tests__/expression-varargs.test.ts`

## Integration Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes all tests
- [ ] Existing Expression block tests unchanged
- [ ] Existing patches compile without modification
- [ ] No performance regression

## Documentation

- [ ] JSDoc on Expression block refs input
- [ ] JSDoc on LowerCtx.addressRegistry
- [ ] JSDoc on LowerCtx.varargConnections
- [ ] Update expression-blocks.ts header comment
