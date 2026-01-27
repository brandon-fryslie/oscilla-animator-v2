# Definition of Done: Editor UI Sprint
Generated: 2026-01-27T15:02:00Z

## Functional Criteria

### Editor Tab
- [ ] Composite editor opens as new tab in main editor area
- [ ] Tab shows composite name (or "New Composite" for new)
- [ ] Tab has close button with dirty confirmation
- [ ] Multiple composite editors can be open simultaneously

### Graph Editing
- [ ] Drag block from library to canvas adds it
- [ ] Click and drag from port creates edge
- [ ] Select block shows it highlighted
- [ ] Delete key removes selected blocks/edges
- [ ] Right-click context menu works
- [ ] Undo/redo works within editor session

### Port Exposure
- [ ] Panel shows all available internal ports
- [ ] Clicking port toggles exposure state
- [ ] Exposed ports show editable external name
- [ ] Graph visually indicates exposed ports (color/icon)
- [ ] At least one input and one output required for save

### Metadata
- [ ] Name field validates as identifier
- [ ] Label field is freeform text
- [ ] Category dropdown shows existing categories
- [ ] Description is optional multiline text

### Save/Cancel
- [ ] Save validates all requirements
- [ ] Save registers composite with registry
- [ ] Save persists to localStorage
- [ ] Cancel with dirty state shows confirmation
- [ ] Cancel discards all changes
- [ ] Successful save closes editor and shows toast

### Library Integration
- [ ] "Create Composite" button visible in library
- [ ] User composites appear in "Composites" category
- [ ] Right-click composite shows Edit/Delete options
- [ ] Deleting used composite shows warning
- [ ] Composites can be dragged to main graph

## Non-Functional Criteria

### Usability
- [ ] Create simple composite in < 30 seconds
- [ ] Intuitive port exposure (no documentation needed)
- [ ] Clear feedback on validation errors

### Performance
- [ ] Editor opens in < 200ms
- [ ] No lag with 20+ internal blocks
- [ ] Save completes in < 100ms

### Code Quality
- [ ] All components have prop types
- [ ] Store uses proper MobX patterns
- [ ] No memory leaks on editor close

## Verification Steps

1. Click "Create Composite" in library
2. Add 3 blocks to canvas
3. Connect them with edges
4. Expose some ports via panel
5. Set name and label
6. Save composite
7. Verify appears in library
8. Drag new composite to main graph
9. Edit composite via context menu
10. Delete composite and verify removal
