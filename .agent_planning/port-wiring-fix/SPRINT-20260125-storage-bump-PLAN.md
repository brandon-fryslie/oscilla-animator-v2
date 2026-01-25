# Sprint: Storage Key Bump - Fix Port Wiring Error

**Generated**: 2026-01-25
**Confidence**: HIGH (3/3 items)
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Fix port wiring compilation errors by bumping localStorage storage key version to force fresh patch load after block refactoring.

## Scope

**Deliverables**:
1. Bump STORAGE_KEY from v9 to v10 in src/main.ts
2. Verify patches load without port errors
3. Confirm demos render correctly

## Work Items

### P0: Bump Storage Key Version

**Acceptance Criteria**:
- [ ] `STORAGE_KEY` in `src/main.ts:558` changed from `'oscilla-v2-patch-v9'` to `'oscilla-v2-patch-v10'`
- [ ] Comment updated to reference block refactoring (not just Z wave)
- [ ] App rebuilds without new errors introduced
- [ ] Patches load and compile without "Port does not exist" errors
- [ ] Demo patches render without compilation failures

**Technical Notes**:
- Single line change in `src/main.ts` around line 558
- This forces localStorage to treat old patches as obsolete, triggering fresh load
- Demos will reset to factory defaults (expected behavior)
- No breaking changes to API or compilation logic

**Implementation**:
```typescript
// Before (line 558)
const STORAGE_KEY = 'oscilla-v2-patch-v9'; // Bumped to force fresh load - Z wave animation

// After
const STORAGE_KEY = 'oscilla-v2-patch-v10'; // Bumped for block refactoring (FieldSin→Sin, etc.)
```

## Dependencies

None. This is a standalone fix.

## Risks

**Risk**: Users lose saved patches
- **Mitigation**: This is intended behavior - stale patches with removed blocks cannot compile anyway. User receives fresh demos as compensation.

## Verification

1. Clear browser cache/localStorage (or app will do it automatically)
2. Load app - should reset to demo patches
3. Create new patches using current block types - should work without port errors
4. Run `npm run build` - type check passes
5. Run `npm run test` - related tests pass
