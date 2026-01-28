# Definition of Done: UI Components
Generated: 2026-01-28-070815
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-28-070815-ui-buttons-PLAN.md

## Acceptance Criteria

### Action Buttons Rendering
- [ ] DiagnosticRow component checks for diagnostic.actions array
- [ ] Buttons render only when actions array exists and has length > 0
- [ ] Each action gets its own button
- [ ] Button text displays action.label
- [ ] Buttons styled with consistent theme (background, border, padding)
- [ ] Buttons appear below diagnostic message with 24px left margin
- [ ] Multiple buttons have 8px spacing between them
- [ ] Visual test: Load diagnostic with actions, verify buttons appear

### Action Execution Wiring
- [ ] Button onClick handler implemented
- [ ] Handler imports executeAction from actionExecutor module
- [ ] Handler passes correct ActionExecutorDeps (patchStore, selectionStore, etc.)
- [ ] Success result doesn't show error
- [ ] Failure result logs error to console
- [ ] Integration test: Click "Add InfiniteTimeRoot" creates block in patch
- [ ] Integration test: Click "Remove Block" removes block from patch
- [ ] Integration test: Verify SelectionStore state changes after goToTarget action

### Visual Feedback
- [ ] Button disabled state implemented (disabled during execution)
- [ ] Loading text/spinner shows while action executes
- [ ] Error message appears below button if action fails
- [ ] Error message styled in red (#ff6b6b) with small font (11px)
- [ ] Success case clears error message
- [ ] Multiple action buttons don't interfere (independent state per button)
- [ ] Visual test: Trigger action failure, verify error appears

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
