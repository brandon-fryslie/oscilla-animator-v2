# Definition of Done: Value Representation Validation

## Pre-Implementation Checklist

- [ ] Read authoringValidators.ts to understand validator pattern
- [ ] Review pass0-payload-resolution.ts to understand where to integrate
- [ ] Check how Const block values are serialized (what JSON format?)
- [ ] Review existing error diagnostics to understand message format
- [ ] Check test files to understand validation test pattern

## Implementation Checklist

- [ ] Validator function created in authoringValidators.ts
- [ ] Validation logic for all 7 types implemented
- [ ] Validator registered in validator registry
- [ ] Integration with pass0-payload-resolution added
- [ ] Integration with value-change handler (BlockInspector) added
- [ ] Error messages clear and actionable

## Testing Checklist

- [ ] Create Const(float) with value "abc" → Shows validation error
- [ ] Create Const(int) with value "3.5" → Shows validation error (or auto-converts)
- [ ] Create Const(bool) with value "maybe" → Shows validation error
- [ ] Create Const(vec2) with value {x: 1} (missing y) → Shows validation error
- [ ] Create Const(color) with invalid color value → Shows validation error
- [ ] Create Const(float) with value 3.14 → No error
- [ ] Create Const(int) with value 3 → No error
- [ ] Create Const(bool) with value true → No error
- [ ] Create Const(vec2) with value {x: 1, y: 2} → No error
- [ ] Edit Const value in BlockInspector → Validation runs immediately
- [ ] Fix invalid value → Error disappears
- [ ] Unresolved Const (no payloadType yet) → No validation error

## Validation Quality

- [ ] Error messages are specific (mention the type and problem)
- [ ] Error location is correct (points to Const block, not downstream)
- [ ] No false positives
- [ ] No false negatives
- [ ] Edge cases handled (empty strings, null values, extreme numbers)

## Code Quality

- [ ] Validator follows existing authoringValidators patterns
- [ ] No duplication with other validators
- [ ] Testable function signature
- [ ] Comments explain validation rules
- [ ] No console.logs
- [ ] Proper error handling
