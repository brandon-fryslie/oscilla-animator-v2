# Definition of Done: Library UI Sprint
Generated: 2026-01-27T14:54:00Z

## Functional Criteria

### Library Composites
- [ ] 5 library composites compile without errors
- [ ] All 5 appear in BlockLibrary under "Composites"
- [ ] Each has description visible in inspector preview
- [ ] Cannot edit/delete library composites (UI prevents it)
- [ ] Can drag library composite to canvas
- [ ] Composite expands correctly during normalization

### Startup Integration
- [ ] App loads with library composites available
- [ ] User composites from localStorage also load
- [ ] Missing/corrupt localStorage → app still starts
- [ ] No duplicate registration errors

### BlockLibrary UI
- [ ] "Composites" category visible
- [ ] Lock icon (🔒) on library composites
- [ ] Edit icon (✏️) on user composites
- [ ] Click shows preview in inspector
- [ ] Double-click adds to canvas
- [ ] Drag-and-drop works

### Import/Export
- [ ] Import button visible
- [ ] Import valid JSON → composite appears
- [ ] Import invalid JSON → error message (not crash)
- [ ] Import duplicate name → prompt to rename or overwrite
- [ ] Export button on user composites
- [ ] Export downloads valid JSON file

## Non-Functional Criteria

### Performance
- [ ] Library composites load in < 100ms
- [ ] No visible delay when opening BlockLibrary

### Code Quality
- [ ] Library composites use readonly type pattern
- [ ] Import/export errors are user-friendly

## Verification Steps

1. Start app fresh
2. Open BlockLibrary → see "Composites" category
3. See 5 library composites with lock icons
4. Click one → preview appears
5. Double-click → composite added to canvas
6. Create user composite in editor
7. See it appear in BlockLibrary with edit icon
8. Export user composite
9. Delete user composite
10. Import from file → composite returns
