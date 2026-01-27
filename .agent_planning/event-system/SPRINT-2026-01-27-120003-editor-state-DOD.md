# Definition of Done: editor-state

## Required for Completion

### Code Quality
- [ ] EditorStateStore created and wired to RootStore
- [ ] All editor lifecycle methods implemented
- [ ] Events emitted correctly for all state transitions
- [ ] No race conditions between editors

### Testing
- [ ] Test: startEdit → editStarted event
- [ ] Test: updateValidity(false) → validityChanged event with isValid=false
- [ ] Test: endEdit → editEnded event
- [ ] Test: two editors can't be active in same location
- [ ] Test: invalid editor blocks other editors

### UX Verification
- [ ] User can edit displayName in node
- [ ] Empty name shows error state
- [ ] Inspector editor disables during invalid node edit
- [ ] Escape reverts to previous value
- [ ] Enter/blur commits valid value

### Integration
- [ ] DisplayNameEditor uses EditorStateStore
- [ ] Events visible in debug logging
- [ ] No regressions in editing behavior

## Verification Commands
```bash
npm run typecheck
npm run test -- EditorStateStore
npm run test -- DisplayNameEditor
npm run dev  # Manual verification
```

## Exit Criteria
All checkboxes above must be checked. Sprint is complete when:
1. All tests pass
2. Manual verification confirms coordination works
3. UX is smooth with no glitches
