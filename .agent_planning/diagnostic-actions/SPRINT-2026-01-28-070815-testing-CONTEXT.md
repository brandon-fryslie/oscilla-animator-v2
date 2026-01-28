# Implementation Context: Testing
Generated: 2026-01-28-070815
Plan: SPRINT-2026-01-28-070815-testing-PLAN.md

## Test File Structure

### Test Directory Layout
```
src/
├── diagnostics/
│   ├── __tests__/
│   │   ├── actionExecutor.test.ts (NEW - unit tests)
│   │   └── actionFlow.integration.test.ts (NEW - integration tests)
│   └── validators/
│       └── __tests__/
│           └── authoringValidators.test.ts (ENHANCE - add action tests)
├── ui/
│   └── components/
│       └── app/
│           └── __tests__/
│               └── DiagnosticConsole.test.tsx (NEW - UI tests)
tests/
└── e2e/
    └── diagnosticActions.spec.ts (NEW - E2E test)
```

## Unit Test Template: Action Executor

**File**: `src/diagnostics/__tests__/actionExecutor.test.ts`

```typescript
import { executeAction } from '../actionExecutor';
import type { ActionExecutorDeps, ActionResult } from '../actionExecutor';
import type { DiagnosticAction } from '../types';

describe('actionExecutor', () => {
  let mockDeps: ActionExecutorDeps;
  let mockPatch: any;

  beforeEach(() => {
    mockPatch = {
      blocks: {
        'block-1': { id: 'block-1', type: 'SomeBlock' },
      },
    };

    mockDeps = {
      patchStore: {
        addBlock: jest.fn(() => 'new-block-id'),
        removeBlock: jest.fn(),
        snapshot: mockPatch,
      },
      selectionStore: {
        selectBlock: jest.fn(),
        selectEdge: jest.fn(),
      },
      diagnosticsStore: {
        muteDiagnostic: jest.fn(),
      },
      eventHub: {
        emit: jest.fn(),
      },
    } as any;
  });

  describe('executeAction dispatcher', () => {
    it('dispatches goToTarget action', () => {
      const action: DiagnosticAction = {
        kind: 'goToTarget',
        label: 'Go to Block',
        target: { kind: 'block', blockId: 'block-1' },
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-1');
    });

    it('dispatches createTimeRoot action', () => {
      const action: DiagnosticAction = {
        kind: 'createTimeRoot',
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.addBlock).toHaveBeenCalledWith(
        'InfiniteTimeRoot',
        {},
        { label: 'Time Root', role: 'timeRoot' }
      );
    });

    // Add tests for remaining action kinds...
  });

  describe('goToTarget handler', () => {
    it('selects block target', () => {
      const action: DiagnosticAction = {
        kind: 'goToTarget',
        label: 'Go',
        target: { kind: 'block', blockId: 'block-1' },
      };

      const result = executeAction(action, mockDeps);

      expect(result).toEqual({ success: true });
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-1');
    });

    it('selects edge target', () => {
      const action: DiagnosticAction = {
        kind: 'goToTarget',
        label: 'Go',
        target: { kind: 'edge', edgeId: 'edge-1' },
      };

      const result = executeAction(action, mockDeps);

      expect(result).toEqual({ success: true });
      expect(mockDeps.selectionStore.selectEdge).toHaveBeenCalledWith('edge-1');
    });

    it('clears selection for patch target', () => {
      const action: DiagnosticAction = {
        kind: 'goToTarget',
        label: 'Go',
        target: { kind: 'patch', patchId: 'patch-0' },
      };

      const result = executeAction(action, mockDeps);

      expect(result).toEqual({ success: true });
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith(null);
    });
  });

  describe('createTimeRoot handler', () => {
    it('creates InfiniteTimeRoot block', () => {
      const action: DiagnosticAction = {
        kind: 'createTimeRoot',
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.addBlock).toHaveBeenCalledWith(
        'InfiniteTimeRoot',
        {},
        expect.objectContaining({ role: 'timeRoot' })
      );
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('new-block-id');
    });

    it('rejects unsupported timeRootKind', () => {
      const action: any = {
        kind: 'createTimeRoot',
        label: 'Add CustomTimeRoot',
        timeRootKind: 'CustomType',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported timeRootKind');
      expect(mockDeps.patchStore.addBlock).not.toHaveBeenCalled();
    });
  });

  describe('removeBlock handler', () => {
    it('removes existing block', () => {
      const action: DiagnosticAction = {
        kind: 'removeBlock',
        label: 'Remove',
        blockId: 'block-1',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.removeBlock).toHaveBeenCalledWith('block-1');
    });

    it('fails for non-existent block', () => {
      const action: DiagnosticAction = {
        kind: 'removeBlock',
        label: 'Remove',
        blockId: 'block-nonexistent',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(mockDeps.patchStore.removeBlock).not.toHaveBeenCalled();
    });
  });

  describe('insertBlock handler', () => {
    it('creates new block', () => {
      const action: DiagnosticAction = {
        kind: 'insertBlock',
        label: 'Insert',
        blockType: 'SomeBlock',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.addBlock).toHaveBeenCalledWith(
        'SomeBlock',
        {},
        expect.any(Object)
      );
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('new-block-id');
    });
  });

  describe('openDocs handler', () => {
    it('opens documentation URL', () => {
      const mockOpen = jest.fn();
      global.window.open = mockOpen;

      const action: DiagnosticAction = {
        kind: 'openDocs',
        label: 'Learn More',
        docUrl: 'https://example.com/docs',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockOpen).toHaveBeenCalledWith(
        'https://example.com/docs',
        '_blank',
        'noopener,noreferrer'
      );
    });
  });
});
```

## Integration Test Template: Action Attachment

**File**: `src/diagnostics/validators/__tests__/authoringValidators.test.ts` (add to existing)

```typescript
// Add to existing test file
describe('Diagnostic Actions', () => {
  describe('E_TIME_ROOT_MISSING actions', () => {
    it('includes createTimeRoot action', () => {
      const patch = createEmptyPatch(); // No TimeRoot
      const diagnostics = validateTimeRoots(patch, 1);

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];

      expect(diagnostic.code).toBe('E_TIME_ROOT_MISSING');
      expect(diagnostic.actions).toBeDefined();
      expect(diagnostic.actions).toHaveLength(1);

      const action = diagnostic.actions![0];
      expect(action.kind).toBe('createTimeRoot');
      expect(action.label).toBe('Add InfiniteTimeRoot');
      expect(action.timeRootKind).toBe('Infinite');
    });
  });

  describe('W_GRAPH_DISCONNECTED_BLOCK actions', () => {
    it('includes goToTarget and removeBlock actions', () => {
      const patch = createPatchWithDisconnectedBlock();
      const diagnostics = validateConnectivity(patch, 1);

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];

      expect(diagnostic.code).toBe('W_GRAPH_DISCONNECTED_BLOCK');
      expect(diagnostic.actions).toHaveLength(2);

      expect(diagnostic.actions![0].kind).toBe('goToTarget');
      expect(diagnostic.actions![0].label).toBe('Go to Block');

      expect(diagnostic.actions![1].kind).toBe('removeBlock');
      expect(diagnostic.actions![1].label).toBe('Remove Block');
      expect(diagnostic.actions![1].blockId).toBeDefined();
    });
  });
});
```

## Integration Test Template: Action Flow

**File**: `src/diagnostics/__tests__/actionFlow.integration.test.ts` (new file)

```typescript
import { PatchStore } from '../../stores/PatchStore';
import { SelectionStore } from '../../stores/SelectionStore';
import { DiagnosticsStore } from '../../stores/DiagnosticsStore';
import { EventHub } from '../../events/EventHub';
import { validateTimeRoots } from '../validators/authoringValidators';
import { executeAction } from '../actionExecutor';

describe('Diagnostic Action Flow Integration', () => {
  let patchStore: PatchStore;
  let selectionStore: SelectionStore;
  let diagnosticsStore: DiagnosticsStore;
  let eventHub: EventHub;

  beforeEach(() => {
    eventHub = new EventHub();
    patchStore = new PatchStore('patch-0', eventHub);
    selectionStore = new SelectionStore(patchStore);
    diagnosticsStore = new DiagnosticsStore();
  });

  it('creates TimeRoot when action executed', () => {
    // 1. Create patch without TimeRoot
    const patch = patchStore.snapshot;
    expect(Object.keys(patch.blocks)).toHaveLength(0);

    // 2. Run validator - should create diagnostic
    const diagnostics = validateTimeRoots(patch, 1);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('E_TIME_ROOT_MISSING');

    // 3. Extract action
    const action = diagnostics[0].actions![0];
    expect(action.kind).toBe('createTimeRoot');

    // 4. Execute action
    const result = executeAction(action, {
      patchStore,
      selectionStore,
      diagnosticsStore,
      eventHub,
    });

    // 5. Verify result
    expect(result.success).toBe(true);

    // 6. Verify block created
    const updatedPatch = patchStore.snapshot;
    const blocks = Object.values(updatedPatch.blocks);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('InfiniteTimeRoot');

    // 7. Verify selection updated
    expect(selectionStore.selectedBlockId).toBe(blocks[0].id);

    // 8. Verify diagnostic would now resolve
    const newDiagnostics = validateTimeRoots(updatedPatch, 2);
    expect(newDiagnostics).toHaveLength(0); // No error - TimeRoot exists!
  });

  it('removes block when removeBlock action executed', () => {
    // Similar flow for removeBlock...
  });
});
```

## UI Test Template

**File**: `src/ui/components/app/__tests__/DiagnosticConsole.test.tsx` (new file)

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { DiagnosticRow } from '../DiagnosticConsole';
import * as actionExecutor from '../../../../diagnostics/actionExecutor';

jest.mock('../../../../diagnostics/actionExecutor');

describe('DiagnosticRow with actions', () => {
  const mockStores = {
    patchStore: {} as any,
    selectionStore: {} as any,
    diagnosticsStore: {} as any,
    eventHub: {} as any,
  };

  const createDiagnostic = (actions?: any[]) => ({
    id: 'test-1',
    code: 'E_TIME_ROOT_MISSING',
    severity: 'error' as const,
    domain: 'authoring',
    primaryTarget: { kind: 'patch' as const, patchId: 'patch-0' },
    title: 'No TimeRoot',
    message: 'Add a TimeRoot',
    scope: { patchRevision: 1 },
    metadata: { firstSeenAt: 0, lastSeenAt: 0, occurrenceCount: 1 },
    actions,
  });

  it('renders action buttons', () => {
    const diagnostic = createDiagnostic([
      { kind: 'createTimeRoot', label: 'Add InfiniteTimeRoot', timeRootKind: 'Infinite' }
    ]);

    render(<DiagnosticRow diagnostic={diagnostic} {...mockStores} />);
    
    expect(screen.getByText('Add InfiniteTimeRoot')).toBeInTheDocument();
  });

  it('does not render buttons when no actions', () => {
    const diagnostic = createDiagnostic(); // No actions

    render(<DiagnosticRow diagnostic={diagnostic} {...mockStores} />);
    
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('executes action on button click', () => {
    const mockExecuteAction = jest.spyOn(actionExecutor, 'executeAction')
      .mockReturnValue({ success: true });

    const diagnostic = createDiagnostic([
      { kind: 'createTimeRoot', label: 'Add InfiniteTimeRoot', timeRootKind: 'Infinite' }
    ]);

    render(<DiagnosticRow diagnostic={diagnostic} {...mockStores} />);
    
    fireEvent.click(screen.getByText('Add InfiniteTimeRoot'));

    expect(mockExecuteAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'createTimeRoot' }),
      mockStores
    );
  });

  it('shows error when action fails', () => {
    jest.spyOn(actionExecutor, 'executeAction')
      .mockReturnValue({ success: false, error: 'Block not found' });

    const diagnostic = createDiagnostic([
      { kind: 'removeBlock', label: 'Remove', blockId: 'block-1' }
    ]);

    render(<DiagnosticRow diagnostic={diagnostic} {...mockStores} />);
    
    fireEvent.click(screen.getByText('Remove'));

    expect(screen.getByText('Block not found')).toBeInTheDocument();
  });
});
```

## E2E Test Template

**File**: `tests/e2e/diagnosticActions.spec.ts` (new file)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Diagnostic Actions E2E', () => {
  test('Add TimeRoot action resolves E_TIME_ROOT_MISSING', async ({ page }) => {
    // 1. Navigate to app
    await page.goto('http://localhost:3000');

    // 2. Create new empty patch
    await page.click('[data-testid="new-patch-button"]');

    // 3. Open Diagnostic Console
    await page.click('[data-testid="diagnostic-console-toggle"]');

    // 4. Verify E_TIME_ROOT_MISSING appears
    await expect(page.locator('text=E_TIME_ROOT_MISSING')).toBeVisible();
    await expect(page.locator('text=No TimeRoot')).toBeVisible();

    // 5. Verify action button exists
    await expect(page.locator('button:has-text("Add InfiniteTimeRoot")')).toBeVisible();

    // 6. Click action button
    await page.click('button:has-text("Add InfiniteTimeRoot")');

    // 7. Verify TimeRoot block appears in graph
    await expect(page.locator('[data-block-type="InfiniteTimeRoot"]')).toBeVisible();

    // 8. Verify diagnostic disappears (error resolved)
    await expect(page.locator('text=E_TIME_ROOT_MISSING')).not.toBeVisible();
  });
});
```

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm test -- actionExecutor.test.ts

# Integration tests
npm test -- actionFlow.integration.test.ts

# UI tests
npm test -- DiagnosticConsole.test.tsx

# E2E tests
npm run test:e2e

# With coverage
npm test -- --coverage --collectCoverageFrom="src/diagnostics/**/*.ts"
```
