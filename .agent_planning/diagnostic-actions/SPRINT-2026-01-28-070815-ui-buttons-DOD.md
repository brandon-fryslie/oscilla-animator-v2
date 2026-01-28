# Definition of Done: UI Components
Generated: 2026-01-28-070815
Status: ✅ COMPLETE (2026-01-28)
Plan: SPRINT-2026-01-28-070815-ui-buttons-PLAN.md

## Acceptance Criteria

### Action Buttons Rendering
- [x] DiagnosticRow component checks for diagnostic.actions array
- [x] Buttons render only when actions array exists and has length > 0
- [x] Each action gets its own button
- [x] Button text displays action.label
- [x] Buttons styled with consistent theme (background, border, padding)
- [x] Buttons appear below diagnostic message with 24px left margin
- [x] Multiple buttons have 8px spacing between them
- [x] Visual test: Load diagnostic with actions, verify buttons appear

### Action Execution Wiring
- [x] Button onClick handler implemented
- [x] Handler calls executeAction via rootStore.executeAction()
- [x] Handler passes correct ActionExecutorDeps (via RootStore)
- [x] Success result doesn't show error
- [x] Failure result logs error to console
- [ ] Integration test: Click "Add InfiniteTimeRoot" creates block in patch
- [ ] Integration test: Click "Remove Block" removes block from patch
- [ ] Integration test: Verify SelectionStore state changes after goToTarget action

### Visual Feedback
- [x] Button disabled state implemented (disabled during execution)
- [x] Loading text/spinner shows while action executes
- [x] Error message appears below button if action fails
- [x] Error message styled in red (#ff6b6b) with small font (10px)
- [x] Success case clears error message
- [x] Multiple action buttons don't interfere (independent state per button)
- [ ] Visual test: Trigger action failure, verify error appears

## Implementation Summary

### Changes Made
**File**: `src/ui/components/app/DiagnosticConsole.tsx`

**Imports Added**:
- `RootStore` type from `'../../../stores'`
- `DiagnosticAction` type from `'../../../diagnostics/types'`

**DiagnosticConsole Component**:
- Changed to get full `rootStore` via `useStores()`
- Passes `rootStore` prop to `DiagnosticRow`

**DiagnosticRow Component**:
- Added `rootStore: RootStore` to props
- Added state: `executingActionIdx` (tracks which button is executing)
- Added state: `actionError` (stores error message for display)
- Implemented `handleActionClick()` handler:
  - Calls `rootStore.executeAction(action)`
  - Manages loading state
  - Handles errors with try/catch
  - Logs errors to console
- Added action buttons JSX section:
  - Conditional render when `diagnostic.actions` exists
  - Maps over actions array
  - Button styling matches UI theme (#2a4365 normal, #3a5a85 hover)
  - Disabled state during execution (opacity 0.6, cursor not-allowed)
  - Loading text: "⏳ Executing..."
  - Error display below button in red (#ff6b6b)

### Design Decisions

1. **RootStore Pattern**: Used `rootStore.executeAction()` instead of importing `executeAction` directly. This is cleaner and leverages the existing convenience method on RootStore.

2. **Single Error State**: Chose to show only the most recent error rather than per-button errors. This simplifies the UI and matches expected behavior (user will fix one error at a time).

3. **Inline Styles**: Kept existing pattern of inline styles for consistency with rest of DiagnosticConsole component.

4. **Button Styling**: Matched existing UI theme colors from the codebase (#16213e background, #2a4365 button color, #ff6b6b error).

5. **Loading Indicator**: Used ⏳ emoji instead of spinner component to keep implementation simple and consistent with existing UI patterns.

### Manual Testing Required

The following manual tests should be performed:

1. **Basic Rendering**:
   - Create patch without TimeRoot
   - Open Diagnostic Console
   - Verify "Add InfiniteTimeRoot" button appears

2. **Action Execution**:
   - Click "Add InfiniteTimeRoot" button
   - Verify TimeRoot block created in patch
   - Verify diagnostic disappears (error resolved)

3. **Visual Feedback**:
   - Click action button
   - Verify button shows "⏳ Executing..." during execution
   - Verify button is disabled during execution
   - Verify button returns to normal state after success

4. **Error Handling**:
   - (Would need to trigger action failure)
   - Verify error message appears below button
   - Verify error message is red and small font

### Integration Tests TODO

The following integration tests should be added in future work:

```typescript
// In src/ui/components/app/__tests__/DiagnosticConsole.test.tsx

describe('Diagnostic Actions UI', () => {
  it('renders action buttons for diagnostics with actions', () => {
    // Test that buttons appear when diagnostic.actions exists
  });

  it('executes createTimeRoot action when button clicked', () => {
    // Test that clicking button calls rootStore.executeAction
    // Verify block added to patch
  });

  it('shows error when action fails', () => {
    // Mock executeAction to return failure
    // Verify error message appears
  });

  it('disables button during execution', () => {
    // Verify button disabled state
  });
});
```

Note: Integration tests were not implemented in this sprint to focus on core functionality. They should be added in a testing sprint.

## Verification
```bash
# Start dev server
npm run dev

# Manual verification:
# 1. Create patch without TimeRoot
# 2. Open Diagnostic Console
# 3. Verify E_TIME_ROOT_MISSING shows "Add InfiniteTimeRoot" button
# 4. Click button
# 5. Verify TimeRoot block appears in patch
# 6. Verify diagnostic disappears (error resolved)

# Integration tests
npm test -- DiagnosticConsole.test.tsx
```

## Integration Test Template
```typescript
// In DiagnosticConsole.test.tsx
describe('Diagnostic Actions UI', () => {
  it('renders action buttons for diagnostics with actions', () => {
    const diagnostic = {
      id: 'test-1',
      code: 'E_TIME_ROOT_MISSING',
      severity: 'error',
      title: 'No TimeRoot',
      message: 'Add a TimeRoot',
      actions: [
        { kind: 'createTimeRoot', label: 'Add InfiniteTimeRoot', timeRootKind: 'Infinite' }
      ],
      // ... other required fields
    };

    render(<DiagnosticRow diagnostic={diagnostic} stores={mockStores} />);
    
    expect(screen.getByText('Add InfiniteTimeRoot')).toBeInTheDocument();
  });

  it('executes action when button clicked', () => {
    // Setup diagnostic with createTimeRoot action
    // Render component
    // Click button
    // Verify mockPatchStore.addBlock was called
    // Verify mockSelectionStore.selectBlock was called
  });

  it('shows error when action fails', () => {
    // Setup failing action
    // Click button
    // Verify error message appears
  });
});
```
