# Definition of Done: patch-events

## Required for Completion

### Code Quality
- [ ] PatchStore has EventHub reference
- [ ] All mutation methods emit appropriate events
- [ ] Events fire post-mutation (state is consistent when event fires)
- [ ] No event loops or infinite cascades

### Testing
- [ ] Test: addBlock → BlockAdded event fires
- [ ] Test: removeBlock → BlockRemoved + EdgeRemoved (cascade) events fire
- [ ] Test: addEdge → EdgeAdded event fires
- [ ] Test: removeEdge → EdgeRemoved event fires
- [ ] Test: param change → BlockChanged event fires
- [ ] Test: patchReset → PatchReset event fires

### Behavioral Verification
- [ ] Create block in UI → BlockAdded event observed in debug
- [ ] Delete block in UI → BlockRemoved + cascade events observed
- [ ] Connect ports in UI → EdgeAdded event observed
- [ ] Load new file → PatchReset event observed

### Integration
- [ ] DiagnosticHub still receives GraphCommitted
- [ ] No regressions in existing event handling

## Verification Commands
```bash
npm run typecheck
npm run test -- PatchStore
npm run test -- src/events
```

## Exit Criteria
All checkboxes above must be checked. Sprint is complete when:
1. All tests pass
2. Manual verification in running app confirms events fire
3. No console errors during normal editing operations
