# Definition of Done: patch-events

## Required for Completion

### Code Quality
- [x] PatchStore has EventHub reference
- [x] All mutation methods emit appropriate events
- [x] Events fire post-mutation (state is consistent when event fires)
- [x] No event loops or infinite cascades

### Testing
- [x] Test: addBlock → BlockAdded event fires (via EventHub.test.ts)
- [x] Test: removeBlock → BlockRemoved event fires (via EventHub.test.ts + integration.test.ts)
- [x] Test: param change → BlockUpdated event fires (via EventHub.test.ts)
- [x] Test: connect wire → BlockUpdated event fires (via EventHub.test.ts)
- [x] Test: addEdge → EdgeAdded event fires (via EventHub.test.ts)
- [x] Test: removeEdge → EdgeRemoved event fires (via EventHub.test.ts)

### Use Case Migrations (Required)
- [ ] **BlockAdded**: DiagnosticHub re-runs authoring validators (deferred - existing GraphCommitted still works)
- [x] **BlockRemoved**: SelectionStore clears selection if removed block was selected
- [ ] **BlockUpdated**: Auto-recompile triggers (deferred - existing GraphCommitted still works)
- [x] **EdgeAdded/Removed**: SelectionStore clears selection if removed edge was selected

### Behavioral Verification
- [ ] Create block in UI → BlockAdded event observed in debug (manual test pending)
- [ ] Delete block in UI → BlockRemoved event observed (manual test pending)
- [ ] Change param in UI → BlockUpdated event observed (manual test pending)
- [ ] Connect wire in UI → EdgeAdded event observed (manual test pending)

### Integration
- [x] DiagnosticHub still receives GraphCommitted (backward compat)
- [x] No regressions in existing event handling

## Verification Commands
```bash
npm run typecheck  # ✓ PASS
npm run test -- PatchStore  # ✓ 37 tests PASS
npm run test -- src/events  # ✓ 31 tests PASS
npm run test -- SelectionStore  # ✓ 28 tests PASS
npm run test -- integration  # ✓ 38 tests PASS
```

## Exit Criteria
1. ✓ All related tests pass (133 events+stores tests)
2. ✓ Use case migrated: SelectionStore clears on BlockRemoved/EdgeRemoved
3. [ ] Manual verification pending
4. ✓ No console errors in test runs

## Summary
Sprint 2 implemented event emission for all PatchStore mutations:
- BlockAdded, BlockRemoved, BlockUpdated
- EdgeAdded, EdgeRemoved
- PatchReset (for loadPatch and clear)

SelectionStore was migrated to subscribe to BlockRemoved/EdgeRemoved events for automatic selection cleanup.
