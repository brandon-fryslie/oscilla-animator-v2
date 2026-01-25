# Definition of Done: Storage Key Bump Sprint

## Acceptance Criteria

### Code Changes
- [ ] `src/main.ts:558` STORAGE_KEY updated to v10
- [ ] Comment explains block refactoring reason
- [ ] No syntax errors introduced
- [ ] TypeScript compilation passes (`npm run typecheck`)

### Build & Testing
- [ ] Full build succeeds (`npm run build`)
- [ ] No new TypeScript errors introduced
- [ ] Existing tests still pass (`npm run test`)
- [ ] No console errors/warnings when app loads

### Runtime Verification
- [ ] Open app in fresh browser (or clear localStorage)
- [ ] App loads without "Port does not exist" errors
- [ ] Demo patches render correctly
- [ ] Can create new patches without port errors
- [ ] Graph editor works without stale block references

### Documentation
- [ ] STORAGE_KEY comment is clear and up-to-date
- [ ] No additional documentation needed (single-line fix)

## Sign-Off
- Once all criteria met and tests pass, mark bd item `oscilla-animator-v2-aql` as closed
