# Sprint: Testing - Comprehensive Test Coverage
Generated: 2026-01-28-070815
Confidence: HIGH: 5, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-28-070441.md

## Sprint Goal
Create comprehensive test suite for DiagnosticAction feature covering unit, integration, and end-to-end scenarios.

## Scope
**Deliverables:**
- Unit tests for type definitions and action executor
- Integration tests for action attachment and execution flow
- UI tests for action button rendering and interaction
- End-to-end test for complete diagnostic → action → resolution flow

## Work Items

### P0: Unit Tests for Action Executor
**Confidence**: HIGH
**Dependencies**: Sprint 3 (Action Executor)
**Spec Reference**: 07-diagnostics-system.md:835-854 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 297-309

#### Description
Create comprehensive unit tests for each action handler in actionExecutor.ts. Test success cases, error cases, and edge cases.

Test file: `src/diagnostics/__tests__/actionExecutor.test.ts`

Tests to include:
- executeAction() dispatches to correct handler based on action.kind
- goToTarget handler updates SelectionStore
- createTimeRoot handler creates block with correct type and role
- removeBlock handler validates block existence
- removeBlock handler returns error for non-existent block
- insertBlock handler creates block
- All handlers return ActionResult with success flag

#### Acceptance Criteria
- [ ] Test file exists at src/diagnostics/__tests__/actionExecutor.test.ts
- [ ] At least 15 test cases covering all action kinds
- [ ] Mock stores (PatchStore, SelectionStore, etc.) used for isolation
- [ ] Success and failure paths tested for each action
- [ ] Test coverage >90% for actionExecutor.ts
- [ ] All tests pass with `npm test -- actionExecutor.test.ts`

#### Technical Notes
- Use Jest with @testing-library patterns
- Mock store methods with jest.fn()
- Test ActionResult structure (success, error fields)
- Verify correct store methods called with correct arguments

---

### P0: Integration Tests for Action Attachment
**Confidence**: HIGH
**Dependencies**: Sprint 2 (Action Attachment)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 64-98

#### Description
Test that diagnostics are created with correct actions attached. Verify action arrays match spec requirements.

Test file: `src/diagnostics/validators/__tests__/authoringValidators.test.ts` (enhance existing)

Tests to include:
- E_TIME_ROOT_MISSING includes createTimeRoot action
- createTimeRoot action has correct timeRootKind ('Infinite')
- W_GRAPH_DISCONNECTED_BLOCK includes goToTarget and removeBlock actions
- Actions have user-friendly labels
- Actions have correct blockId references
- Diagnostics without actions still work (backwards compatibility)

#### Acceptance Criteria
- [ ] E_TIME_ROOT_MISSING test verifies action exists and is correct
- [ ] W_GRAPH_DISCONNECTED_BLOCK tests verify 2 actions exist
- [ ] Action labels are checked (not generic/empty)
- [ ] Action blockIds match diagnostic targets
- [ ] Test coverage >90% for action-related code in validators
- [ ] All tests pass

#### Technical Notes
- Extend existing authoringValidators.test.ts
- Create test patches with known issues (missing TimeRoot, disconnected blocks)
- Run validators and inspect resulting diagnostic.actions arrays
- Verify action objects match DiagnosticAction type

---

### P1: Integration Tests for Action Execution Flow
**Confidence**: HIGH
**Dependencies**: Sprint 3 (Action Executor), Sprint 2 (Action Attachment)
**Spec Reference**: 07-diagnostics-system.md:835-854 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 102-135

#### Description
Test complete flow: diagnostic created → action extracted → action executed → effect verified.

Test file: `src/diagnostics/__tests__/actionFlow.integration.test.ts` (new)

Tests to include:
- Create patch without TimeRoot → diagnostic created → extract action → execute → TimeRoot exists
- Create patch with disconnected block → diagnostic created → extract removeBlock action → execute → block removed
- Verify SelectionStore updated after goToTarget action
- Verify EventHub emits BlockAdded/BlockRemoved events
- Test idempotency: executing action twice doesn't break

#### Acceptance Criteria
- [ ] End-to-end test: missing TimeRoot → action → block created
- [ ] End-to-end test: disconnected block → removeBlock action → block removed
- [ ] Test verifies SelectionStore state changes
- [ ] Test verifies EventHub event emission
- [ ] Idempotency test executes action twice safely
- [ ] All integration tests pass

#### Technical Notes
- Use real stores (not mocks) for integration tests
- Create fresh PatchStore for each test
- Verify graph state before/after action execution
- Check EventHub event log for correct events

---

### P1: UI Component Tests
**Confidence**: HIGH
**Dependencies**: Sprint 4 (UI Components)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 143-168

#### Description
Test DiagnosticRow component renders and interacts correctly with actions.

Test file: `src/ui/components/app/__tests__/DiagnosticConsole.test.tsx` (new or enhance)

Tests to include:
- DiagnosticRow renders action buttons when actions exist
- DiagnosticRow doesn't render buttons when actions undefined
- Button displays correct label from action.label
- Button click calls executeAction
- Button shows loading state during execution
- Button shows error message on failure
- Multiple buttons don't interfere with each other

#### Acceptance Criteria
- [ ] Test verifies buttons render for diagnostics with actions
- [ ] Test verifies no buttons for diagnostics without actions
- [ ] Test verifies button onClick calls executeAction
- [ ] Test verifies loading state (disabled, opacity, text change)
- [ ] Test verifies error display on failure
- [ ] All UI tests pass
- [ ] Visual regression test passes (optional)

#### Technical Notes
- Use @testing-library/react
- Mock executeAction from actionExecutor module
- Use fireEvent.click to simulate button clicks
- Verify DOM updates with screen.getByText / screen.queryByText
- Mock stores to avoid side effects

---

### P2: End-to-End Test (Complete User Flow)
**Confidence**: HIGH
**Dependencies**: All previous sprints
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 369-375

#### Description
Full user scenario test using Playwright or similar E2E framework.

Test file: `tests/e2e/diagnosticActions.spec.ts` (new)

Scenario:
1. Load app with empty patch
2. Verify E_TIME_ROOT_MISSING diagnostic appears in console
3. Verify "Add InfiniteTimeRoot" button visible
4. Click button
5. Verify TimeRoot block appears in graph
6. Verify diagnostic disappears (resolved)

#### Acceptance Criteria
- [ ] E2E test file created
- [ ] Test opens app and loads empty patch
- [ ] Test locates diagnostic console and verifies error
- [ ] Test clicks action button
- [ ] Test verifies block creation in graph
- [ ] Test verifies diagnostic resolution
- [ ] E2E test passes in CI/CD pipeline

#### Technical Notes
- Use Playwright (already in project: playwright.config.ts exists)
- Run against dev server: npm run dev
- Use page.locator() to find diagnostic console
- Use page.click() to click action button
- Verify graph canvas shows TimeRoot block (may need data-testid)

---

## Dependencies
- **Sprint 1 (Type Definitions)** - Provides types for tests
- **Sprint 2 (Action Attachment)** - Provides actions to test
- **Sprint 3 (Action Executor)** - Provides executor to test
- **Sprint 4 (UI Components)** - Provides UI to test
- **Jest** - Ready (test framework)
- **@testing-library/react** - Ready (UI testing)
- **Playwright** - Ready (E2E testing)

## Risks
**Risk**: E2E tests flaky in CI  
**Mitigation**: Use proper waits and selectors, retry logic  
**Likelihood**: Medium - common with E2E tests

**Risk**: Mocking stores incorrectly breaks tests  
**Mitigation**: Use real stores for integration tests, mocks only for unit tests  
**Likelihood**: Low - clear separation of unit vs integration

**Risk**: Test coverage tool doesn't detect all branches  
**Mitigation**: Manual review of untested code paths  
**Likelihood**: Low - Jest coverage is reliable
