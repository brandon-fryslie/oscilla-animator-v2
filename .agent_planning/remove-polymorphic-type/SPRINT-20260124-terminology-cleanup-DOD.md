# Definition of Done: terminology-cleanup

Generated: 2026-01-24

## Acceptance Criteria

### Must Pass

1. **File Rename Complete**
   - `src/graph/passes/pass0-payload-resolution.ts` exists
   - `src/graph/passes/pass0-polymorphic-types.ts` does NOT exist
   - Function exported as `pass0PayloadResolution`

2. **All References Updated**
   - `grep -r "pass0Polymorphic" src/` returns no matches
   - `grep -r "pass0-polymorphic" src/` returns no matches
   - All imports compile successfully

3. **Build Verification**
   - `npm run typecheck` exits 0
   - `npm run test` exits 0
   - `npm run build` exits 0

4. **No Behavioral Change**
   - Existing patches compile identically
   - Runtime behavior unchanged
   - This is purely a refactoring commit

## Verification Commands

```bash
# Check no old references remain
grep -r "pass0Polymorphic" src/ && echo "FAIL: old function name found" || echo "PASS"
grep -r "pass0-polymorphic" src/ && echo "FAIL: old file reference found" || echo "PASS"

# Verify builds
npm run typecheck
npm run test
npm run build
```

## Exit Criteria

- All acceptance criteria pass
- Commit message: "refactor(types): rename polymorphic→payload-generic terminology"
- No new features, no new tests (this is cleanup)
