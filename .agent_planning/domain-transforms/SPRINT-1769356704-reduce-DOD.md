# Definition of Done: Reduce Adapter Block

## Pre-Implementation

- [ ] Read DOMAIN-TRANSFORMS-SPEC.md (understand architecture)
- [ ] Review Broadcast block in adapter-blocks.ts (reference implementation)
- [ ] Check existing field buffer infrastructure
- [ ] Understand IR generation pattern for adapter blocks
- [ ] Review payload resolution pass

## Implementation Checklist

### Block Definition
- [ ] Reduce block registered in BLOCK_DEFS_BY_TYPE
- [ ] Cardinality declared: many→one
- [ ] Temporality declared: continuous→continuous
- [ ] Op parameter defined with all 7 operations
- [ ] Polymorphic payload type handled

### IR Generation
- [ ] `lower()` function generates correct IR
- [ ] All 7 operations implemented:
  - [ ] mean: correct averaging
  - [ ] sum: correct accumulation
  - [ ] min: finds minimum
  - [ ] max: finds maximum
  - [ ] rms: square root of mean squares
  - [ ] any: boolean OR
  - [ ] all: boolean AND
- [ ] Empty field handled (returns 0/false/default)
- [ ] Output is scalar slot (not field)

### Type System
- [ ] Payload resolution includes Reduce
- [ ] Output type matches input type
- [ ] Type checker accepts Field→Reduce connections
- [ ] Mismatched types rejected properly

### Unit Tests
- [ ] Type inference tests (payload matching)
- [ ] Per-operation correctness tests
- [ ] Edge cases: empty field, single lane
- [ ] Float tolerance checks (rms, mean)
- [ ] Coverage >90%

### Integration Tests
- [ ] Full graph with Broadcast→Reduce→scalar sink
- [ ] Value changes propagate
- [ ] No compile errors
- [ ] Runtime output correct

## Code Quality

- [ ] No unused imports
- [ ] No console.logs
- [ ] Follows project code style
- [ ] Comments on non-obvious logic
- [ ] Function signatures clear
- [ ] Error handling comprehensive

## Performance

- [ ] No unnecessary allocations
- [ ] O(n) complexity where n = lane count (acceptable)
- [ ] Field buffer not copied (just read)
- [ ] IR compilation doesn't regress

## Documentation

- [ ] Block purpose clear in comments
- [ ] Operation semantics documented
- [ ] Edge cases explained
- [ ] Example usage in test file

## Deployment Checklist

- [ ] All tests passing
- [ ] TypeScript compiles (no new errors)
- [ ] No regressions in existing adapter tests
- [ ] Broadcast still works (dependency check)
- [ ] Field infrastructure still works
