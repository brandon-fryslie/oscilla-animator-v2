# Definition of Done: Library System Sprint
Generated: 2026-01-27T15:03:00Z

## Functional Criteria

### JSON Schema
- [ ] Schema validates correct composites
- [ ] Schema rejects invalid composites with clear errors
- [ ] Schema includes all required fields
- [ ] Version field present for migrations

### Library Composites
- [ ] 5+ library composites defined
- [ ] All library composites compile successfully
- [ ] All library composites appear in BlockLibrary
- [ ] Library composites cannot be edited/deleted
- [ ] Each has description and meaningful name

### JSON Loader
- [ ] Valid JSON loads correctly
- [ ] Invalid JSON produces clear errors
- [ ] Missing required fields caught
- [ ] Invalid internal references caught
- [ ] Circular references caught

### Persistence
- [ ] User composites persist across page reload
- [ ] New composite saved immediately after creation
- [ ] Edited composite updates in storage
- [ ] Deleted composite removed from storage
- [ ] Storage errors handled gracefully

### Import/Export
- [ ] Export single composite downloads JSON file
- [ ] Export all downloads ZIP or bundle
- [ ] Import from file adds to user composites
- [ ] Import handles duplicates (rename prompt)
- [ ] Invalid import shows clear error

### Library UI
- [ ] "Composites" category visible
- [ ] Library and user composites distinguished
- [ ] Lock icon on library composites
- [ ] Edit/Delete on user composites
- [ ] Import button works
- [ ] Drag-to-canvas works

## Non-Functional Criteria

### Performance
- [ ] Library loads in < 100ms
- [ ] Import 10 composites in < 500ms
- [ ] Storage operations don't block UI

### Code Quality
- [ ] Schema defined with zod
- [ ] All JSON types have TypeScript equivalents
- [ ] Loader has comprehensive error handling

## Verification Steps

1. App loads with library composites visible
2. Create composite in editor
3. Close and reopen app - composite persists
4. Export composite to file
5. Delete composite
6. Import from exported file
7. Import invalid file - see clear error
8. Use library composite in patch
9. Verify library composite not editable
