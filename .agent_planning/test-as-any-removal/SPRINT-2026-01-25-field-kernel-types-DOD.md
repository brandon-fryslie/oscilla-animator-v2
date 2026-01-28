# Definition of Done: Sprint 2 - Field Kernel Types

**Sprint:** Field Kernel Types
**Generated:** 2026-01-25
**Type:** DOD (Definition of Done)

## Verification Criteria

All of the following must be true for this sprint to be COMPLETE:

### Acceptance Criteria

**Primary: Create testFieldType() helper function**
- [ ] New test helper function `testFieldType()` created in appropriate location (likely `src/core/__tests__/test-helpers.ts` or similar)
- [ ] Function signature: `testFieldType(payload: Payload, instanceId?: InstanceId): CanonicalType`
- [ ] Function returns a properly-typed CanonicalType without requiring casts
- [ ] Helper exported for use in all test files
- [ ] Function includes JSDoc explaining its purpose

**Secondary: Update field-kernel-contracts.test.ts**
- [ ] All ~30 instances of `type as any` replaced with `testFieldType()` calls
- [ ] Verify structure: `testFieldType(payload)` used instead of incomplete mock objects
- [ ] Tests execute: `npm run test -- field-kernel-contracts.test.ts` → PASS

**Tertiary: Update other test files using field kernel types**
- [ ] Identify all test files that cast type parameters to `any`
- [ ] Apply `testFieldType()` helper to all identified locations
- [ ] Confirm no breaking changes to test behavior

### Code Quality Checks
- [ ] `npm run typecheck` → PASS (no new type errors)
- [ ] All affected test files show zero new compiler warnings
- [ ] Helper function is properly typed and documented
- [ ] No production code changes (test-only helper)

### Process Completion
- [ ] All changed files are committed
- [ ] Commit message clearly states: helper created + files updated + number of casts removed
- [ ] No uncommitted changes remain

## How to Verify

```bash
# Verify helper exists and is exported
grep -n "export.*testFieldType" src/core/__tests__/test-helpers.ts

# Check for remaining 'as any' type casts in field kernel tests
grep -n "type as any" src/compiler/__tests__/field-kernel-contracts.test.ts

# Run the field kernel tests
npm run test -- field-kernel-contracts.test.ts

# Full type check
npm run typecheck
```

If all of these commands succeed and return zero matches for remaining 'type as any', this sprint is COMPLETE.

## Notes

- This is the largest single-sprint effort (36 casts), but mechanical once the helper is created
- The helper should encapsulate all the defaults needed for test CanonicalType objects
- Focus on creating a clean, reusable helper that other tests can benefit from
- Once created, application to all ~30 instances in field-kernel-contracts.test.ts is straightforward

## Related Information

**Field kernel type pattern:**
```typescript
// Before (with cast):
const type = { payload: 'float', ... } as any

// After (with helper):
const type = testFieldType('float')
```

**Similar existing helpers:**
- `canonicalType()` from `src/core/canonical-types.ts`
- `sigExprId()` from `src/compiler/ir/Indices.ts`

Consider whether `testFieldType()` should extend or delegate to these existing factories.
