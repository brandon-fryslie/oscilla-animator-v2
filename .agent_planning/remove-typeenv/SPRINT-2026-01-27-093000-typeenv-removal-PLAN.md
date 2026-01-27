# Sprint: typeenv-removal - Remove TypeEnv Legacy Pattern

**Generated**: 2026-01-27
**Bead ID**: oscilla-animator-v2-6n6
**Confidence**: HIGH: 3, MEDIUM: 0, LOW: 0
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Remove the deprecated `TypeEnv` type alias and its backwards-compatibility pattern, consolidating on `TypeCheckContext` as the single interface for type checking.

## Scope

**Deliverables:**
- Remove deprecated `typecheck()` overload that accepts `TypeEnv`
- Remove `isTypeEnv()` type guard
- Update all callers to use `TypeCheckContext`
- Remove `TypeEnv` public export

## Work Items

### P0: Update src/expr/index.ts to use TypeCheckContext [HIGH]

**Acceptance Criteria:**
- [ ] `extractPayloadTypes()` return type changed from `TypeEnv` to `ReadonlyMap<string, PayloadType>`
- [ ] `typecheck()` call passes `{ inputs: inputTypes }` instead of raw `inputTypes`
- [ ] `TypeEnv` import removed
- [ ] `TypeEnv` re-export removed from line 151

**Technical Notes:**
- This is the only call site that uses the deprecated pattern
- Change is localized to lines 29, 91, 141, 151

### P1: Remove deprecated code from typecheck.ts [HIGH]

**Acceptance Criteria:**
- [ ] Deprecated overload removed (line 122)
- [ ] `isTypeEnv()` type guard removed (lines 159-161)
- [ ] Union type in implementation signature removed (line 123)
- [ ] Auto-conversion code removed (lines 124-127)
- [ ] `TypeEnv` type alias retained as internal (still used by `TypeCheckContext.inputs`)

**Technical Notes:**
- After P0, no callers use the deprecated pattern
- Signature simplifies from `(node, ctxOrEnv: TypeCheckContext | TypeEnv)` to `(node, ctx: TypeCheckContext)`
- Removal follows from the fact that all callers now use `TypeCheckContext`

### P2: Update tests to use TypeCheckContext [HIGH]

**Acceptance Criteria:**
- [ ] All test cases in `typecheck.test.ts` pass `{ inputs: map }` instead of raw `map`
- [ ] All tests pass with `npm run test`
- [ ] No references to deprecated pattern remain

**Technical Notes:**
- Tests currently use duck-typing (`new Map()` passed directly)
- Update to `{ inputs: new Map() }` pattern
- ~15 test cases to update

## Dependencies

None - self-contained cleanup.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Missed external caller | Build break | Verified via grep - no external callers |

## Execution Order

1. **P0** - Update index.ts (makes current code work with either pattern)
2. **P2** - Update tests (makes tests work with new pattern only)
3. **P1** - Remove deprecated code (cleanup after all callers updated)
4. Run full test suite and verify
