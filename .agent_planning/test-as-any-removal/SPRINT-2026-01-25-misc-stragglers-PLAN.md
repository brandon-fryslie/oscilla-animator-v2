# Sprint: Misc Stragglers - Various small files
**Generated:** 2026-01-25T07:30:32Z
**Status:** READY FOR IMPLEMENTATION
**Confidence:** HIGH: 1, MEDIUM: 0, LOW: 0
**Expected Effort:** 30 minutes

## Sprint Goal
Remove ~17 remaining 'as any' casts from miscellaneous test files (1-4 instances each).

## Scope
**Deliverables:**
- Fix projection tests
- Fix compiler tests
- Fix store tests
- Fix other small files

## Work Items

### Item 1: Opportunistic fixes in misc files (17 instances)
**Files affected:** Various (projection tests, compiler tests, stores tests, etc.)
**Pattern:** Varies - each file has 1-4 casts

**Technical approach:**
- Scan all remaining test files for 'as any'
- Apply appropriate fix from previous sprints (sigExprId, canonicalType, mock helpers, etc.)
- Each file is independent

**Acceptance Criteria:**
- [ ] Grep for 'as any' in test files returns zero matches
- [ ] All tests pass
- [ ] Type checker reports no issues

## Dependencies
- Depends on Sprints 1-3 being completed (test helpers and factories available)
- Can be done after or interleaved with other sprints

## Implementation Notes
These are cleanup passes through remaining files. Most will use one of:
- `sigExprId()` for branded types
- `canonicalType()` or `signalTypeField()` for type objects
- Test helpers from earlier sprints

## Risks
- **Risk:** Miss some casts when scanning
  - **Mitigation:** Use grep to verify zero 'as any' in test files after completion

## Follow-up
After all sprints complete:
```bash
# Verify all casts removed
grep -r "as any" src/__tests__ --include="*.test.ts" --include="*.test.tsx"
# Should return: empty
```
