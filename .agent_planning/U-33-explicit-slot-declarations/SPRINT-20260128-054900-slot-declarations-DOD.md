# Definition of Done: slot-declarations

Generated: 2026-01-28-054900  
Status: READY FOR IMPLEMENTATION  
Plan: SPRINT-20260128-054900-slot-declarations-PLAN.md

## Acceptance Criteria

### Type Alias Definitions (P0)

- [ ] `ScalarSlotDecl` type alias defined as `= StateMappingScalar`
- [ ] `FieldSlotDecl` type alias defined as `= StateMappingField`
- [ ] Both aliases exported from `src/compiler/ir/types.ts`
- [ ] JSDoc comments reference specification section I9
- [ ] TypeScript compilation succeeds: `npm run typecheck` passes with 0 errors
- [ ] Both types available in IDE autocomplete when typing "Slot"

---

### Convenience Accessor Functions (P0)

- [ ] `getScalarSlots(schedule: ScheduleIR)` function returns `ScalarSlotDecl[]`
- [ ] `getFieldSlots(schedule: ScheduleIR)` function returns `FieldSlotDecl[]`
- [ ] Both functions use type guards for correct TypeScript narrowing
- [ ] Functions filter by `kind` discriminator correctly:
  - `getScalarSlots` returns only `kind: 'scalar'` items
  - `getFieldSlots` returns only `kind: 'field'` items
- [ ] Unit test validates filtering logic (create test file or add to existing)
- [ ] Test verifies type narrowing: returned arrays have correct TypeScript types
- [ ] Functions exported from `src/compiler/backend/schedule-program.ts`

**Test Requirements:**
```typescript
// Example test structure
const schedule = createTestSchedule({
  stateMappings: [
    { kind: 'scalar', stateId: 's1', slotIndex: 0, stride: 1, initial: [0] },
    { kind: 'field', stateId: 'f1', instanceId: 'inst1', slotStart: 1, laneCount: 4, stride: 1, initial: [0] },
    { kind: 'scalar', stateId: 's2', slotIndex: 5, stride: 2, initial: [0, 0] }
  ]
});

const scalars = getScalarSlots(schedule);
const fields = getFieldSlots(schedule);

expect(scalars).toHaveLength(2);
expect(fields).toHaveLength(1);
expect(scalars.every(s => s.kind === 'scalar')).toBe(true);
expect(fields.every(f => f.kind === 'field')).toBe(true);
```

---

### Documentation Updates (P1)

- [ ] ScheduleIR interface JSDoc updated to mention:
  - Type aliases (`ScalarSlotDecl`, `FieldSlotDecl`)
  - Accessor functions (`getScalarSlots`, `getFieldSlots`)
  - Relationship between spec and implementation naming
- [ ] `stateMappings` field comment states "Canonical source for ScalarSlotDecl and FieldSlotDecl"
- [ ] `stateSlots` field comment strengthened with "**Legacy format**" prefix
- [ ] Code example added showing recommended usage pattern:
  ```typescript
  // Recommended: Use typed accessors
  const scalars = getScalarSlots(schedule);
  const fields = getFieldSlots(schedule);
  
  // Or: Direct access to union array
  for (const mapping of schedule.stateMappings) {
    if (mapping.kind === 'scalar') { /* ... */ }
    else { /* ... */ }
  }
  ```
- [ ] JSDoc renders correctly in IDE tooltips (verify in VSCode/WebStorm)
- [ ] Links to specification document work (relative path valid)

---

### Deprecation Notices (P2)

- [ ] `@deprecated` tag added to `stateSlots` field in ScheduleIR
- [ ] Deprecation message includes:
  - "Legacy expanded format. Use stateMappings for hot-swap migration."
  - Alternative suggestion: "Use getScalarSlots() / getFieldSlots() for typed access."
- [ ] Existing code using `stateSlots` continues to compile (verify no breakage)
- [ ] IDE shows deprecation strikethrough and warning on hover
- [ ] No new TypeScript errors introduced by deprecation tag

---

## Integration Verification

### Build & Type Checking
- [ ] `npm run build` completes successfully
- [ ] `npm run typecheck` passes with 0 errors
- [ ] No new TypeScript compiler warnings

### Test Suite
- [ ] All 347 existing tests pass: `npm test` shows 100% pass rate
- [ ] New unit test for accessor functions passes
- [ ] No test failures or regressions introduced
- [ ] Test coverage for new functions meets project standards (>80%)

### API Compatibility
- [ ] Existing code using `stateMappings` continues to work
- [ ] Existing code using `StateMapping` type continues to work
- [ ] Runtime behavior unchanged (hot-swap logic unaffected)
- [ ] No breaking changes to public API

---

## Success Checklist

**Code Quality:**
- [ ] All functions have JSDoc comments with examples
- [ ] Type signatures are explicit (no implicit `any`)
- [ ] Code follows project style guidelines
- [ ] No eslint warnings or errors

**Documentation:**
- [ ] README or relevant docs mention new accessor functions (if applicable)
- [ ] CHANGELOG.md entry added (if project maintains one)
- [ ] Migration guide notes for users of legacy `stateSlots` API

**Testing:**
- [ ] Edge cases tested (empty arrays, mixed scalar/field)
- [ ] Type narrowing verified in tests
- [ ] Performance acceptable (filtering is O(n), acceptable for typical schedule sizes)

---

## Definition of "Done"

This sprint is considered **DONE** when:

1. ✅ All P0 and P1 acceptance criteria checked off
2. ✅ All tests passing (347+ tests, 100% pass rate)
3. ✅ TypeScript compilation succeeds with no errors
4. ✅ Documentation complete and reviewed
5. ✅ Code merged to main branch (or equivalent)
6. ✅ No new deprecation warnings except for intended `stateSlots` field

**Optional (P2 criteria):**
- Deprecation notices added (recommended but not blocking)

---

## Verification Commands

Run these commands to verify completion:

```bash
# Type checking
npm run typecheck

# Full test suite
npm test

# Build verification
npm run build

# Lint check
npm run lint

# Coverage (if available)
npm run test:coverage
```

**Expected Results:**
- Typecheck: 0 errors
- Tests: 347+ passing, 0 failing
- Build: Success
- Lint: 0 errors, 0 warnings (except intentional deprecations)

---

## Rollback Plan

If issues arise, rollback is straightforward:
1. Remove type aliases from `types.ts`
2. Remove accessor functions from `schedule-program.ts`
3. Revert documentation changes

**Reason this is safe**: All changes are purely additive. No existing code modified.
