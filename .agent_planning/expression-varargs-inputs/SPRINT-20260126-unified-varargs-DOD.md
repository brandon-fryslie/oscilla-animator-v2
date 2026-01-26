# Definition of Done: unified-varargs

Generated: 2026-01-26
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260126-unified-varargs-PLAN.md

## Acceptance Criteria

### Port Structure Changes

- [ ] in2, in3, in4 ports REMOVED from Expression block
- [ ] in0, in1 ports REMAIN as legacy inputs (optional: true)
- [ ] 'refs' vararg port ADDED with correct constraints
- [ ] Block registers without validation errors

### Unified Lowering System (CRITICAL)

- [ ] Single code path processes ALL inputs (in0/in1 AND refs)
- [ ] Legacy inputs (in0/in1) processed same as varargs internally
- [ ] Varargs refs processed with canonical addresses/aliases as keys
- [ ] Unified `Map<string, SigExprId>` passed to compileExpression
- [ ] LowerCtx.varargConnections populated by compiler
- [ ] Expression block can access VarargConnection metadata

### Expression DSL Integration

- [ ] compileExpression accepts optional blockRefs parameter
- [ ] Member access expressions (Block.port) resolve correctly
- [ ] Type checking validates block references against allowed payloads
- [ ] Compilation produces correct signal references

### UI Visual Distinction

- [ ] Theme color defined for varargs ports
- [ ] refs port renders with distinct color (different from in0/in1)
- [ ] Visual distinction clear in graph editor

### Backward Compatibility

- [ ] Expressions using `in0` continue to work
- [ ] Expressions using `in0 + in1` continue to work
- [ ] Expressions using `in0 * in1` continue to work
- [ ] No changes required to existing patches (that don't use in2-in4)

### New Functionality

- [ ] Expression with refs vararg compiles
- [ ] Expression with refs vararg executes correctly
- [ ] Member access syntax (e.g., `Circle.radius`) works when wired via refs
- [ ] Mixed usage: `in0 + MyBlock.out` works

## Integration Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes all new and existing tests
- [ ] No circular dependencies introduced
- [ ] Expression block properly exported

## Test Coverage

- [ ] Test: Legacy in0 only
- [ ] Test: Legacy in0 + in1
- [ ] Test: Refs vararg only
- [ ] Test: Mixed in0 + refs
- [ ] Test: Member access syntax via refs
- [ ] Test: Error handling for unconnected refs
- [ ] Test: Multiple refs connections
