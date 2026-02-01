# Definition of Done: Integration
Generated: 2026-02-01-163200
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260201-163200-integration-PLAN.md

## Acceptance Criteria

### Round-Trip Tests
- [ ] `roundtrip.test.ts` implemented with test for each demo patch
- [ ] All 11 demo patches (excluding index.ts and types.ts) round-trip successfully with no errors
- [ ] Structural equality verified: same blocks (type, displayName, params), same edges (from, to, enabled), same port overrides
- [ ] Order-insensitive comparison for blocks (Map), order-sensitive for edges (sorted by sortKey)
- [ ] Test fails if serialization loses information (e.g., missing param, missing edge)
- [ ] Test fails if deserialization introduces errors (e.g., unresolved reference)

### Error Recovery Tests
- [ ] Error recovery test suite implemented
- [ ] Malformed HCL produces partial patch + error list (no exceptions thrown)
- [ ] Unresolvable block reference → error collected, edge skipped
- [ ] Duplicate block names → warning collected, block renamed with suffix
- [ ] Unknown block type → warning collected, block preserved as-is (string type)
- [ ] Syntax error in HCL → parse error collected, partial AST produced
- [ ] Empty HCL → empty patch, no errors
- [ ] All tests pass

### Integration with PatchPersistence
- [ ] `exportPatchAsHCL(patch: Patch, name?: string): string` added to PatchPersistence.ts
- [ ] `importPatchFromHCL(hcl: string): { patch: Patch; errors: PatchDslError[] } | null` added
- [ ] `importPatchFromHCL` returns `null` if total failure (no blocks + errors), otherwise returns partial patch + errors
- [ ] Existing JSON serialization unchanged (no breaking changes)
- [ ] All tests pass (add integration test to PatchPersistence.test.ts)

### Integration with PatchStore
- [ ] `loadFromHCL(hcl: string): void` added to PatchStore
- [ ] `exportToHCL(name?: string): string` added to PatchStore
- [ ] `loadFromHCL` updates the current patch state (via MobX action)
- [ ] `loadFromHCL` handles errors gracefully (e.g., shows diagnostic or throws)
- [ ] `exportToHCL` returns HCL string for current patch
- [ ] Existing store methods unchanged (no breaking changes)

## Overall Sprint Success Criteria
- [ ] All files compile without TypeScript errors
- [ ] All tests pass: `npx vitest run src/patch-dsl/__tests__/roundtrip.test.ts`
- [ ] All 11 demo patches round-trip successfully
- [ ] Error recovery tests pass (5+ test cases)
- [ ] Integration tests in PatchPersistence.test.ts pass
- [ ] HCL import/export available via PatchStore (manual verification)

## Verification Command
```bash
# Run all patch-dsl tests (including round-trip and error recovery)
npx vitest run src/patch-dsl/__tests__/

# Run integration test in PatchPersistence
npx vitest run src/services/__tests__/PatchPersistence.test.ts
```

## Manual Verification
1. Open dev server: `npm run dev`
2. In browser console:
   ```javascript
   const store = getPatchStore();  // Get store instance
   const hcl = store.exportToHCL('Manual Test');
   console.log(hcl);  // Verify HCL output
   store.loadFromHCL(hcl);  // Re-load, should work
   ```
