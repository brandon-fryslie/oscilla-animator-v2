# Sprint: Trivial Fixes - SigExprId & Block Mocks
**Generated:** 2026-01-25T07:30:32Z
**Status:** READY FOR IMPLEMENTATION
**Confidence:** HIGH: 2, MEDIUM: 0, LOW: 0
**Expected Effort:** 30 minutes

## Sprint Goal
Remove 15 'as any' casts by applying trivial, mechanical fixes to branded type constructors and mock block definitions.

## Scope
**Deliverables:**
- Fix SigExprId branded type usage (6 instances)
- Fix block definition mock SignalTypes (9 instances)

## Work Items

### Item 1: SigExprId branded type replacement (6 instances)
**Files affected:** event-blocks.test.ts, EventEvaluator.test.ts
**Pattern:** `0 as any` for SigExprId values

**Technical approach:**
- Import `sigExprId` from `src/compiler/ir/Indices.ts`
- Replace `0 as any` with `sigExprId(0)`, etc.
- Already exported and ready to use

**Acceptance Criteria:**
- [ ] `event-blocks.test.ts`: All SigExprId casts replaced
- [ ] `EventEvaluator.test.ts`: All SigExprId casts replaced
- [ ] Tests pass with no regressions
- [ ] No remaining 'as any' in these two files

### Item 2: Block definition mock SignalTypes (9 instances)
**Files affected:** exportFormats.test.ts, and related test files
**Pattern:** `{ payload: 'float' } as any` in block input/output definitions

**Technical approach:**
- Import `canonicalType()` from `src/core/canonical-types.ts`
- Replace `{ payload: 'float' } as any` with `canonicalType('float')`
- This function already returns properly-typed CanonicalType with sensible defaults

**Acceptance Criteria:**
- [ ] All mock block definitions use proper `canonicalType()` factory
- [ ] Tests pass with no regressions
- [ ] Verify exports still work correctly (since exportFormats.test.ts covers serialization)

## Dependencies
- None - both fixes are self-contained

## Risks
- **Risk:** Incorrect understanding of canonicalType() defaults
  - **Mitigation:** Read canonical-types.ts to confirm defaults before implementation
  - **Mitigation:** Run tests after changes to verify behavior

## Notes
These are the simplest fixes in the full set. Both `sigExprId()` and `canonicalType()` are existing, stable functions. No new code needed.
