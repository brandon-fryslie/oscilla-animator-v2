# Implementation Context: UI Components
Generated: 2026-01-28-070815
Plan: SPRINT-2026-01-28-070815-ui-buttons-PLAN.md

## File Locations

### Primary File
**Path**: `src/ui/components/app/DiagnosticConsole.tsx`
**Lines to modify**: 276-310 (DiagnosticRow component)

## Existing Code Structure

### Imports (lines 1-23)
Current imports:
```typescript
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useStores } from '../../../stores';
import type { Diagnostic, Severity, TargetRef } from '../../../diagnostics/types';
```

Add after existing imports:
```typescript
import { executeAction } from '../../../diagnostics/actionExecutor';
import type { DiagnosticAction } from '../../../diagnostics/types';
```

### Store Access Pattern (line 35)
```typescript
const { diagnostics: diagnosticsStore } = useStores();
```

The `useStores()` hook provides access to all stores. Need to get additional stores for action execution:
```typescript
const { 
  diagnostics: diagnosticsStore,
  patch: patchStore,
  selection: selectionStore,
  eventHub,
} = useStores();
```

Check `src/stores/index.ts` for exact store names exported by useStores().

### DiagnosticRow Component (lines 276-310)

Current implementation:
```typescript
const DiagnosticRow: React.FC<DiagnosticRowProps> = ({ diagnostic }) => {
  const icon = getSeverityIcon(diagnostic.severity);
  const color = getSeverityColor(diagnostic.severity);
  const targetStr = formatTargetRef(diagnostic.primaryTarget);

  return (
    <div
      style={{
        padding: '8px',
        marginBottom: '8px',
        borderLeft: `3px solid ${color}`,
        background: '#16213e',
        borderRadius: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ marginRight: '8px', fontSize: '16px' }}>{icon}</span>
        <span style={{ fontWeight: 'bold', color }}>{diagnostic.title}</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#888' }}>
          {diagnostic.code}
        </span>
      </div>

      <div style={{ fontSize: '13px', marginLeft: '24px', marginBottom: '4px' }}>
        {diagnostic.message}
      </div>

      {targetStr && (
        <div style={{ fontSize: '11px', marginLeft: '24px', color: '#888' }}>
          Target: {targetStr}
        </div>
      )}
    </div>
  );
};
```

## Implementation Steps

### Step 1: Add Store Dependencies to DiagnosticRow
**Location**: Update DiagnosticRowProps interface and component signature

Change DiagnosticRowProps to include stores:
```typescript
interface DiagnosticRowProps {
  diagnostic: Diagnostic;
  stores: {
    patchStore: any; // Import types if available
    selectionStore: any;
    diagnosticsStore: any;
    eventHub: any;
  };
}
```

Or pass individual stores:
```typescript
interface DiagnosticRowProps {
  diagnostic: Diagnostic;
  patchStore: any;
  selectionStore: any;
  diagnosticsStore: any;
  eventHub: any;
}
```

Update component signature:
```typescript
const DiagnosticRow: React.FC<DiagnosticRowProps> = ({ 
  diagnostic, 
  patchStore, 
  selectionStore, 
  diagnosticsStore, 
  eventHub 
}) => {
  // ... existing code
}
```

Update DiagnosticRow usage in parent component (around line 120-150):
```typescript
{filteredDiagnostics.map((d: Diagnostic) => (
  <DiagnosticRow 
    key={d.id} 
    diagnostic={d} 
    patchStore={patchStore}
    selectionStore={selectionStore}
    diagnosticsStore={diagnosticsStore}
    eventHub={eventHub}
  />
))}
```

### Step 2: Add Action Button State
**Location**: Inside DiagnosticRow component, after existing variables

Add state for tracking execution:
```typescript
const DiagnosticRow: React.FC<DiagnosticRowProps> = ({ diagnostic, ... }) => {
  const icon = getSeverityIcon(diagnostic.severity);
  const color = getSeverityColor(diagnostic.severity);
  const targetStr = formatTargetRef(diagnostic.primaryTarget);

  // ✅ ADD: State for action execution
  const [executingActionIdx, setExecutingActionIdx] = React.useState<number | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // ... rest of component
}
```

### Step 3: Implement Action Click Handler
**Location**: Inside DiagnosticRow component, before return statement

Add handler function:
```typescript
const handleActionClick = (action: DiagnosticAction, idx: number) => {
  // Clear previous error
  setActionError(null);
  setExecutingActionIdx(idx);

  try {
    // Execute action
    const result = executeAction(action, {
      patchStore,
      selectionStore,
      diagnosticsStore,
      eventHub,
    });

    // Clear executing state
    setExecutingActionIdx(null);

    // Handle result
    if (!result.success) {
      setActionError(result.error || 'Action failed');
      console.error('Diagnostic action failed:', result.error);
    }
  } catch (err) {
    setExecutingActionIdx(null);
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    setActionError(errorMsg);
    console.error('Diagnostic action exception:', err);
  }
};
```

### Step 4: Add Action Buttons to JSX
**Location**: Inside DiagnosticRow return statement, after target display

Current structure:
```typescript
return (
  <div style={{ /* container */ }}>
    {/* icon, title, code */}
    {/* message */}
    {/* target */}
    
    {/* ✅ ADD ACTIONS HERE */}
  </div>
);
```

Add action buttons section:
```typescript
{/* Action Buttons */}
{diagnostic.actions && diagnostic.actions.length > 0 && (
  <div style={{ 
    marginTop: '8px', 
    marginLeft: '24px',
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  }}>
    {diagnostic.actions.map((action, idx) => (
      <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
        <button
          onClick={() => handleActionClick(action, idx)}
          disabled={executingActionIdx === idx}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: executingActionIdx === idx ? '#888' : '#fff',
            background: executingActionIdx === idx ? '#1a2744' : '#2a4365',
            border: '1px solid #3a5a85',
            borderRadius: '4px',
            cursor: executingActionIdx === idx ? 'not-allowed' : 'pointer',
            opacity: executingActionIdx === idx ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (executingActionIdx !== idx) {
              e.currentTarget.style.background = '#3a5a85';
            }
          }}
          onMouseLeave={(e) => {
            if (executingActionIdx !== idx) {
              e.currentTarget.style.background = '#2a4365';
            }
          }}
        >
          {executingActionIdx === idx ? '⏳ Executing...' : action.label}
        </button>
        
        {/* Error message */}
        {actionError && executingActionIdx === null && (
          <span style={{ 
            fontSize: '10px', 
            color: '#ff6b6b', 
            marginTop: '2px' 
          }}>
            {actionError}
          </span>
        )}
      </div>
    ))}
  </div>
)}
```

### Complete Modified DiagnosticRow
Here's the full component with all changes:

```typescript
interface DiagnosticRowProps {
  diagnostic: Diagnostic;
  patchStore: any;
  selectionStore: any;
  diagnosticsStore: any;
  eventHub: any;
}

const DiagnosticRow: React.FC<DiagnosticRowProps> = ({ 
  diagnostic, 
  patchStore, 
  selectionStore, 
  diagnosticsStore, 
  eventHub 
}) => {
  const icon = getSeverityIcon(diagnostic.severity);
  const color = getSeverityColor(diagnostic.severity);
  const targetStr = formatTargetRef(diagnostic.primaryTarget);

  // Action execution state
  const [executingActionIdx, setExecutingActionIdx] = React.useState<number | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Action click handler
  const handleActionClick = (action: DiagnosticAction, idx: number) => {
    setActionError(null);
    setExecutingActionIdx(idx);

    try {
      const result = executeAction(action, {
        patchStore,
        selectionStore,
        diagnosticsStore,
        eventHub,
      });

      setExecutingActionIdx(null);

      if (!result.success) {
        setActionError(result.error || 'Action failed');
        console.error('Diagnostic action failed:', result.error);
      }
    } catch (err) {
      setExecutingActionIdx(null);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setActionError(errorMsg);
      console.error('Diagnostic action exception:', err);
    }
  };

  return (
    <div
      style={{
        padding: '8px',
        marginBottom: '8px',
        borderLeft: `3px solid ${color}`,
        background: '#16213e',
        borderRadius: '4px',
      }}
    >
      {/* Header: icon, title, code */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ marginRight: '8px', fontSize: '16px' }}>{icon}</span>
        <span style={{ fontWeight: 'bold', color }}>{diagnostic.title}</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#888' }}>
          {diagnostic.code}
        </span>
      </div>

      {/* Message */}
      <div style={{ fontSize: '13px', marginLeft: '24px', marginBottom: '4px' }}>
        {diagnostic.message}
      </div>

      {/* Target */}
      {targetStr && (
        <div style={{ fontSize: '11px', marginLeft: '24px', color: '#888' }}>
          Target: {targetStr}
        </div>
      )}

      {/* Action Buttons */}
      {diagnostic.actions && diagnostic.actions.length > 0 && (
        <div style={{ 
          marginTop: '8px', 
          marginLeft: '24px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          {diagnostic.actions.map((action, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
              <button
                onClick={() => handleActionClick(action, idx)}
                disabled={executingActionIdx === idx}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: executingActionIdx === idx ? '#888' : '#fff',
                  background: executingActionIdx === idx ? '#1a2744' : '#2a4365',
                  border: '1px solid #3a5a85',
                  borderRadius: '4px',
                  cursor: executingActionIdx === idx ? 'not-allowed' : 'pointer',
                  opacity: executingActionIdx === idx ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (executingActionIdx !== idx) {
                    e.currentTarget.style.background = '#3a5a85';
                  }
                }}
                onMouseLeave={(e) => {
                  if (executingActionIdx !== idx) {
                    e.currentTarget.style.background = '#2a4365';
                  }
                }}
              >
                {executingActionIdx === idx ? '⏳ Executing...' : action.label}
              </button>
              
              {actionError && executingActionIdx === null && (
                <span style={{ 
                  fontSize: '10px', 
                  color: '#ff6b6b', 
                  marginTop: '2px' 
                }}>
                  {actionError}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

## Color Scheme

Matching existing DiagnosticConsole theme:
- **Background**: `#16213e` (diagnostic card)
- **Button normal**: `#2a4365` (blue-gray)
- **Button hover**: `#3a5a85` (lighter blue-gray)
- **Button disabled**: `#1a2744` (darker blue-gray)
- **Border**: `#3a5a85`
- **Text**: `#fff` (white)
- **Error**: `#ff6b6b` (red)
- **Secondary text**: `#888` (gray)

## Testing Verification

### Manual Testing
```bash
# Start dev server
npm run dev

# Test steps:
# 1. Create empty patch (no TimeRoot)
# 2. Open Diagnostic Console
# 3. Verify "Add InfiniteTimeRoot" button appears
# 4. Click button
# 5. Verify TimeRoot block created
# 6. Verify diagnostic disappears
```

### Unit Testing
Create file: `src/ui/components/app/__tests__/DiagnosticConsole.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { DiagnosticRow } from '../DiagnosticConsole';
import * as actionExecutor from '../../../../diagnostics/actionExecutor';

jest.mock('../../../../diagnostics/actionExecutor');

describe('DiagnosticRow with actions', () => {
  const mockStores = {
    patchStore: {},
    selectionStore: {},
    diagnosticsStore: {},
    eventHub: {},
  };

  it('renders action buttons', () => {
    const diagnostic = {
      id: 'test-1',
      code: 'E_TIME_ROOT_MISSING',
      severity: 'error',
      domain: 'authoring',
      primaryTarget: { kind: 'patch', patchId: 'patch-0' },
      title: 'No TimeRoot',
      message: 'Add a TimeRoot',
      actions: [
        { 
          kind: 'createTimeRoot', 
          label: 'Add InfiniteTimeRoot', 
          timeRootKind: 'Infinite' 
        }
      ],
      scope: { patchRevision: 1 },
      metadata: { firstSeenAt: 0, lastSeenAt: 0, occurrenceCount: 1 },
    };

    render(<DiagnosticRow diagnostic={diagnostic} {...mockStores} />);
    
    expect(screen.getByText('Add InfiniteTimeRoot')).toBeInTheDocument();
  });

  it('executes action on button click', () => {
    const mockExecuteAction = jest.spyOn(actionExecutor, 'executeAction')
      .mockReturnValue({ success: true });

    const diagnostic = {
      // ... same as above
    };

    render(<DiagnosticRow diagnostic={diagnostic} {...mockStores} />);
    
    fireEvent.click(screen.getByText('Add InfiniteTimeRoot'));

    expect(mockExecuteAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'createTimeRoot' }),
      expect.any(Object)
    );
  });
});
```
