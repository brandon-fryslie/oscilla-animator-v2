# Definition of Done: Library Core Sprint
Generated: 2026-01-27T14:53:00Z

## Functional Criteria

### Schema Validation
- [ ] Valid composite JSON parses without errors
- [ ] Missing required field → clear error with field name
- [ ] Invalid type format → clear error explaining format
- [ ] Invalid internal block reference → caught and reported
- [ ] Empty internalBlocks → validation error
- [ ] Version field must be exactly 1

### Loader Functions
- [ ] JSON string → CompositeBlockDef round-trip works
- [ ] All fields preserved through conversion
- [ ] `inputs`/`outputs` computed correctly from exposed ports
- [ ] Invalid JSON → Result with errors (not thrown exception)
- [ ] Block types validated against registry

### Persistence
- [ ] New composite appears in localStorage after save
- [ ] localStorage data survives page reload (verified manually)
- [ ] `exportSingle()` produces valid JSON that can be re-imported
- [ ] `exportAll()` produces bundle with all composites
- [ ] `remove()` actually deletes from storage
- [ ] Corrupt localStorage data → graceful degradation

### Integration
- [ ] CompositeEditorStore.save() persists to storage
- [ ] Creating new composite → appears in storage
- [ ] Editing existing composite → storage updated

## Non-Functional Criteria

### Performance
- [ ] Schema validation < 10ms for complex composite
- [ ] Storage operations < 50ms

### Code Quality
- [ ] All functions have TypeScript return types
- [ ] Error types are discriminated unions (not just strings)
- [ ] No `any` types in schema or loader

## Verification Steps

1. Install zod: `npm install zod`
2. Run typecheck: `npm run typecheck`
3. Create test composite in editor
4. Save composite
5. Check localStorage in DevTools (should have entry)
6. Reload page
7. Composite should still be in storage
8. Export composite to file
9. Delete composite
10. Import from file
