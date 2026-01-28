# Definition of Done: Testing
Generated: 2026-01-28-070815
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-28-070815-testing-PLAN.md

## Acceptance Criteria

### Action Executor Unit Tests
- [ ] Test file src/diagnostics/__tests__/actionExecutor.test.ts exists
- [ ] Test: executeAction dispatches to correct handler for each action.kind
- [ ] Test: goToTarget updates SelectionStore.selectBlock/selectEdge
- [ ] Test: createTimeRoot calls PatchStore.addBlock with correct args
- [ ] Test: createTimeRoot selects newly created block
- [ ] Test: removeBlock validates block exists before removal
- [ ] Test: removeBlock returns error for non-existent block
- [ ] Test: insertBlock creates block
- [ ] Test coverage >90% for actionExecutor.ts
- [ ] All tests pass: `npm test -- actionExecutor.test.ts`

### Action Attachment Integration Tests
- [ ] Tests in authoringValidators.test.ts verify action arrays
- [ ] Test: E_TIME_ROOT_MISSING includes createTimeRoot action
- [ ] Test: createTimeRoot action has timeRootKind='Infinite'
- [ ] Test: createTimeRoot action has user-friendly label
- [ ] Test: W_GRAPH_DISCONNECTED_BLOCK includes 2 actions (goToTarget, removeBlock)
- [ ] Test: Actions have correct blockId references matching diagnostic
- [ ] Test: Diagnostics without actions still work (backwards compat)
- [ ] Test coverage >90% for action attachment code
- [ ] All validator tests pass

### Action Execution Flow Integration Tests
- [ ] Test file actionFlow.integration.test.ts exists
- [ ] Test: Missing TimeRoot → create diagnostic → extract action → execute → block exists
- [ ] Test: Disconnected block → create diagnostic → extract removeBlock → execute → block removed
- [ ] Test: SelectionStore updated after goToTarget action execution
- [ ] Test: EventHub emits BlockAdded/BlockRemoved events
- [ ] Test: Idempotency - executing action twice is safe
- [ ] All integration tests pass

### UI Component Tests
- [ ] Tests in DiagnosticConsole.test.tsx verify button rendering
- [ ] Test: Buttons render when diagnostic.actions exists
- [ ] Test: No buttons when diagnostic.actions is undefined
- [ ] Test: Button displays action.label text
- [ ] Test: Button onClick calls executeAction with correct args
- [ ] Test: Button shows loading state (disabled, "Executing..." text)
- [ ] Test: Error message appears on action failure
- [ ] Test: Multiple buttons have independent state
- [ ] All UI component tests pass

### End-to-End Test
- [ ] Test file tests/e2e/diagnosticActions.spec.ts exists
- [ ] Test loads app with empty patch
- [ ] Test verifies E_TIME_ROOT_MISSING appears in diagnostic console
- [ ] Test verifies "Add InfiniteTimeRoot" button visible
- [ ] Test clicks button successfully
- [ ] Test verifies TimeRoot block appears in graph
- [ ] Test verifies diagnostic disappears (resolved)
- [ ] E2E test passes locally and in CI

## Overall Coverage Target
- [ ] Action executor: >90% line coverage
- [ ] Action attachment: >90% line coverage
- [ ] UI components: >80% line coverage
- [ ] Integration tests cover all 7 action kinds

## Verification
```bash
# Run all tests
npm test

# Run specific test suites
npm test -- actionExecutor.test.ts
npm test -- authoringValidators.test.ts
npm test -- actionFlow.integration.test.ts
npm test -- DiagnosticConsole.test.tsx

# Run E2E tests
npm run test:e2e

# Check coverage
npm test -- --coverage
```

## Success Criteria
All tests pass with:
- ✅ Unit tests: 100% pass rate
- ✅ Integration tests: 100% pass rate
- ✅ UI tests: 100% pass rate
- ✅ E2E tests: 100% pass rate
- ✅ Coverage: >90% for critical paths
