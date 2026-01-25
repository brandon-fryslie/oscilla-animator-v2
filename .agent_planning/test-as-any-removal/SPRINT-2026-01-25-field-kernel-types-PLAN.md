# Sprint: Field Kernel Types - SignalType factory
**Generated:** 2026-01-25T07:30:32Z
**Status:** READY FOR IMPLEMENTATION
**Confidence:** HIGH: 1, MEDIUM: 0, LOW: 0
**Expected Effort:** 1 hour

## Sprint Goal
Remove 36 'as any' casts by replacing partial SignalType objects with proper `signalTypeField()` factory function.

## Scope
**Deliverables:**
- Fix field kernel test type declarations (30 instances)
- Fix local-space sanity test types (6 instances)

## Work Items

### Item 1: Field kernel contracts test types (30 instances)
**File affected:** `src/runtime/__tests__/field-kernel-contracts.test.ts`
**Pattern:** `{ payload: 'vec2', cardinality: 'many' } as const; ... as any`

**Technical approach:**
- Import `signalTypeField()` from `src/core/canonical-types.ts`
- Create test helper function at top of file:
  ```typescript
  function testFieldType(payload: PayloadType): SignalType {
    return signalTypeField(payload, 'test-instance');
  }
  ```
- Replace all `{ payload: '...', cardinality: 'many' } as const; ... as any` patterns with `testFieldType('...')`

**Acceptance Criteria:**
- [ ] Test helper `testFieldType()` created and documented
- [ ] All 30 instances in field-kernel-contracts.test.ts replaced
- [ ] Tests pass with no behavior changes
- [ ] Type checker confirms no remaining casts

### Item 2: Local-space sanity test types (6 instances)
**File affected:** `src/__tests__/local-space-sanity.test.ts`
**Pattern:** Same as Item 1

**Technical approach:**
- Use same `testFieldType()` helper (or import from shared test utils if it exists)
- Replace 6 instances

**Acceptance Criteria:**
- [ ] All 6 instances replaced with `testFieldType()`
- [ ] Tests pass
- [ ] Type checker confirms no remaining casts

## Dependencies
- None - both files are independent

## Risks
- **Risk:** `signalTypeField()` might not exist or have different signature
  - **Mitigation:** Verify function exists and understand its parameters before proceeding
  - **Mitigation:** Check canonical-types.ts exports

## Implementation Notes
These fixes are mechanical repetition of the same pattern. The test helper consolidates the factory call, making tests more readable.

All field kernel tests should work identically after this change - we're just replacing an incomplete type object with a properly-constructed one.
