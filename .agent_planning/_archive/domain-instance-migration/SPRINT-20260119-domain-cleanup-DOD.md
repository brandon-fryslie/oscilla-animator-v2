# Definition of Done: Domain-Cleanup Sprint

**Sprint**: Domain→Instance Migration Completion
**Date**: 2026-01-19

## Acceptance Criteria

### 1. Test Migration Complete

- [ ] `instance-unification.test.ts` does not import `domainId` from Indices
- [ ] `instance-unification.test.ts` does not call `fieldSource()` or `fieldIndex()`
- [ ] All existing test cases pass (possibly with updated assertions)
- [ ] Domain unification validation preserved (via instances)

### 2. Deprecated Methods Removed

- [ ] `IRBuilderImpl.fieldSource()` method deleted
- [ ] `IRBuilderImpl.fieldIndex()` method deleted
- [ ] `IRBuilder` interface does not expose deprecated methods
- [ ] No `@deprecated` annotations for these methods (they're gone)

### 3. Legacy Materializer Path Removed

- [ ] `case 'source'` removed from `fillBuffer()` switch
- [ ] `fillBufferSource()` function deleted
- [ ] Switch remains exhaustive for all valid FieldExpr kinds
- [ ] No runtime errors when executing patches

### 4. Type System Cleaned

- [ ] `DomainId` type removed from `Indices.ts`
- [ ] `domainId()` factory removed from `Indices.ts`
- [ ] Re-exports in `types.ts` updated
- [ ] TypeScript compiles cleanly (no errors)

### 5. No Regressions

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Demo patches render correctly
- [ ] No new `as any` casts introduced

### 6. Code Quality

- [ ] No dead code left behind
- [ ] No misleading TODOs referencing removed features
- [ ] `.claude/rules/compiler/intrinsics.md` updated if needed

## Verification Commands

```bash
# Type checking
npm run typecheck

# All tests pass
npm run test

# Verify no deprecated API usage in src/
grep -r "domainId(" src/ --include="*.ts" | grep -v "\.test\." | grep -v "/types\.ts" | grep -v "/Indices\.ts"

# Verify deprecated methods removed
grep -r "fieldSource(" src/ --include="*.ts"
grep -r "fieldIndex(" src/ --include="*.ts"

# Verify legacy materializer path removed
grep -r "fillBufferSource" src/ --include="*.ts"
```

## Exit Criteria

All checkboxes above must be checked for the sprint to be considered complete.
