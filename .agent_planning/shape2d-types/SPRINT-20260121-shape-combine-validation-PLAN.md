# Sprint: shape-combine-validation - Shape Combine Mode Validation
Generated: 2026-01-21
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Add compile-time validation to restrict shape payload combine modes to `last | first | layer`, preventing invalid operations like `sum(shape1, shape2)`.

## Scope
**Deliverables:**
- Shape combine mode validation in `validateCombineMode()`
- Unit tests for shape combine mode restrictions
- Clear error messages for invalid combines

## Work Items

### P0: Add shape combine mode validation
**Acceptance Criteria:**
- [ ] `validateCombineMode('shape', 'sum')` returns false
- [ ] `validateCombineMode('shape', 'avg')` returns false
- [ ] `validateCombineMode('shape', 'mul')` returns false
- [ ] `validateCombineMode('shape', 'min')` returns false
- [ ] `validateCombineMode('shape', 'max')` returns false
- [ ] `validateCombineMode('shape', 'last')` returns true
- [ ] `validateCombineMode('shape', 'first')` returns true
- [ ] `validateCombineMode('shape', 'layer')` returns true

**Technical Notes:**
- File: `src/core/combine-utils.ts`
- Pattern: Same as color/bool handling (lines 75-129)
- Add case for 'shape' in the switch statement

### P1: Add unit tests
**Acceptance Criteria:**
- [ ] Test that numeric modes are rejected for shape
- [ ] Test that selection modes are accepted for shape
- [ ] Tests pass with `npm test`

**Technical Notes:**
- Test file likely in `src/core/__tests__/` or similar
- Follow existing test patterns

## Dependencies
- None - standalone change

## Risks
- LOW: May reject graphs that previously compiled (unlikely in practice since shapes rarely have multiple writers)
