# Definition of Done: varargs-infra

Generated: 2026-01-25-192523
Status: PARTIALLY READY
Plan: SPRINT-20260125-192523-varargs-infra-PLAN.md

## Acceptance Criteria

### VarargInputDef Type

- [ ] `InputDef` extended with `isVararg?: boolean` flag
- [ ] `VarargConstraint` interface defined with `payloadType`, `cardinalityConstraint`, `minConnections`, `maxConnections`
- [ ] `InputDef.varargConstraint?: VarargConstraint` added
- [ ] `isVarargInput(def: InputDef): boolean` type guard
- [ ] Existing InputDef usages unaffected (backward compatible)
- [ ] Unit tests in `src/blocks/__tests__/registry.test.ts`

### Varargs Port Representation in Patch

- [ ] `VarargConnection` interface defined with `sourceAddress`, `alias?`, `sortKey`
- [ ] `InputPort.varargConnections?: readonly VarargConnection[]` added
- [ ] `PatchBuilder.addVarargConnection(blockId, portId, sourceAddress, sortKey)` method
- [ ] Patch serialization handles varargConnections
- [ ] Unit tests for Patch with varargs in `src/graph/__tests__/Patch.test.ts`

### Varargs Normalization Pass

- [ ] Pass validates all vararg connections exist
- [ ] Pass validates payload type constraint (float only)
- [ ] Pass validates cardinality constraint
- [ ] Pass produces diagnostics for invalid references
- [ ] Pass orders connections by sortKey
- [ ] Integration with existing normalization pipeline
- [ ] Unit tests for valid/invalid varargs

### Varargs Type Resolution

- [ ] Type resolution handles vararg inputs
- [ ] Non-float vararg connections produce type error
- [ ] Mixed signal/field is type error
- [ ] Error messages include source addresses
- [ ] Unit tests for type validation

### Varargs Block Lowering Infrastructure

- [ ] `LowerArgs.varargInputsById?: Record<string, readonly ValueRefPacked[]>`
- [ ] Blocks with varargs receive populated varargInputsById
- [ ] Array order matches sortKey order
- [ ] Normal blocks unaffected (varargInputsById undefined)
- [ ] Unit tests for lowering with varargs

## Integration Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes all tests
- [ ] Existing block definitions continue to work
- [ ] Existing patches continue to compile
- [ ] No performance regression in normalization/compilation

## Documentation

- [ ] JSDoc on VarargInputDef and VarargConstraint
- [ ] JSDoc on VarargConnection
- [ ] Inline comments explaining varargs bypass combine system
