# Sprint: UI Components - Action Buttons
Generated: 2026-01-28-070815
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-28-070441.md

## Sprint Goal
Add action buttons to DiagnosticConsole UI that render and execute diagnostic actions.

## Scope
**Deliverables:**
- Action buttons rendered in DiagnosticRow component
- Button click handlers execute actions via action executor
- Visual feedback (loading, success, error states)
- Styled buttons matching UI theme

## Work Items

### P0: Add Action Buttons to DiagnosticRow Component
**Confidence**: HIGH
**Dependencies**: Sprint 3 (Action Executor)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 143-168

#### Description
Modify DiagnosticRow component (DiagnosticConsole.tsx:276-310) to render action buttons when `diagnostic.actions` array exists. Buttons should appear after the diagnostic message/target info.

Current layout:
```tsx
<div style={{ /* diagnostic container */ }}>
  <div>{icon} {title} {code}</div>
  <div>{message}</div>
  <div>Target: {targetStr}</div>
  {/* ❌ MISSING: Action buttons */}
</div>
```

New layout:
```tsx
<div style={{ /* diagnostic container */ }}>
  <div>{icon} {title} {code}</div>
  <div>{message}</div>
  <div>Target: {targetStr}</div>
  
  {diagnostic.actions && diagnostic.actions.length > 0 && (
    <div style={{ marginTop: '8px', marginLeft: '24px' }}>
      {diagnostic.actions.map((action, idx) => (
        <button
          key={idx}
          onClick={() => handleActionClick(action)}
          style={{ /* button styling */ }}
        >
          {action.label}
        </button>
      ))}
    </div>
  )}
</div>
```

#### Acceptance Criteria
- [ ] DiagnosticRow renders action buttons when diagnostic.actions exists
- [ ] Buttons display action.label text
- [ ] Buttons are styled consistently with UI theme
- [ ] Buttons appear after diagnostic message/target
- [ ] No buttons appear when actions array is empty or undefined
- [ ] Visual test: E_TIME_ROOT_MISSING diagnostic shows "Add InfiniteTimeRoot" button

#### Technical Notes
- File: `src/ui/components/app/DiagnosticConsole.tsx:276-310`
- Use inline styles (matches existing DiagnosticRow pattern)
- Map over actions array with index key (or action.kind as key)
- Button spacing: 8px between buttons, 24px left margin (match message indent)

---

### P0: Wire Action Button onClick to executeAction
**Confidence**: HIGH
**Dependencies**: P0 (Add Action Buttons), Sprint 3 (Action Executor)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 143-168

#### Description
Implement click handler that executes actions via the action executor. Handler should:
1. Get store dependencies (PatchStore, SelectionStore, etc.) from React context or props
2. Call executeAction() from actionExecutor module
3. Handle result (show error if failed)

```tsx
const handleActionClick = (action: DiagnosticAction) => {
  const result = executeAction(action, {
    patchStore: stores.patchStore,
    selectionStore: stores.selectionStore,
    diagnosticsStore: stores.diagnosticsStore,
    eventHub: stores.eventHub,
  });

  if (!result.success) {
    console.error('Action failed:', result.error);
    // TODO: Show error toast/notification
  }
};
```

#### Acceptance Criteria
- [ ] Button onClick calls executeAction from actionExecutor module
- [ ] Store dependencies are passed correctly
- [ ] Success result closes/updates diagnostic display
- [ ] Failure result logs error to console
- [ ] Integration test: Click "Add InfiniteTimeRoot" button creates block
- [ ] Integration test: Click "Remove Block" button removes block

#### Technical Notes
- Import: `import { executeAction } from '../../../diagnostics/actionExecutor'`
- Get stores from RootStore context or props
- DiagnosticConsole likely has RootStore access via observer/inject pattern
- Check existing code for how PatchStore/SelectionStore are accessed

---

### P1: Add Visual Feedback for Action Execution
**Confidence**: HIGH
**Dependencies**: P0 (Wire Action Button onClick)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 143-168

#### Description
Add loading/success/error states to action buttons. Users should see feedback when they click an action button.

States:
- **Idle**: Normal button (enabled, clickable)
- **Loading**: Disabled, shows spinner or "Executing..."
- **Success**: Brief success indicator (checkmark, green flash)
- **Error**: Shows error message or red flash

Implementation:
```tsx
const [executingAction, setExecutingAction] = React.useState<number | null>(null);
const [actionErrors, setActionErrors] = React.useState<Map<number, string>>(new Map());

const handleActionClick = async (action: DiagnosticAction, idx: number) => {
  setExecutingAction(idx);
  setActionErrors(new Map(actionErrors).set(idx, '')); // Clear previous error

  const result = executeAction(action, deps);

  setExecutingAction(null);

  if (!result.success) {
    setActionErrors(new Map(actionErrors).set(idx, result.error || 'Failed'));
  }
};

// In button render:
<button
  disabled={executingAction === idx}
  style={{ opacity: executingAction === idx ? 0.5 : 1 }}
>
  {executingAction === idx ? 'Executing...' : action.label}
</button>
{actionErrors.get(idx) && (
  <span style={{ color: '#ff6b6b', fontSize: '11px' }}>
    {actionErrors.get(idx)}
  </span>
)}
```

#### Acceptance Criteria
- [ ] Button shows loading state while action executes
- [ ] Button is disabled during execution
- [ ] Error message appears below button if action fails
- [ ] Success case clears diagnostic or shows brief success indicator
- [ ] Multiple action buttons don't interfere with each other

#### Technical Notes
- Use React.useState for local component state
- Consider MobX observable if state needs to be global
- Execution is synchronous (no await needed unless future async actions)
- Error display: small text below button, red color (#ff6b6b)

---

## Dependencies
- **Sprint 1 (Type Definitions)** - Provides DiagnosticAction types
- **Sprint 2 (Action Attachment)** - Provides diagnostics with actions
- **Sprint 3 (Action Executor)** - Provides executeAction function
- **React/MobX UI framework** - Ready

## Risks
**Risk**: RootStore access unclear in DiagnosticConsole  
**Mitigation**: Inspect existing code to find store access pattern  
**Likelihood**: Low - DiagnosticConsole already uses DiagnosticsStore

**Risk**: Button styling doesn't match theme  
**Mitigation**: Copy styles from existing buttons in codebase  
**Likelihood**: Low - can iterate on styling

**Risk**: Action execution too slow, blocks UI  
**Mitigation**: Actions are synchronous and fast (store mutations)  
**Likelihood**: Very Low
