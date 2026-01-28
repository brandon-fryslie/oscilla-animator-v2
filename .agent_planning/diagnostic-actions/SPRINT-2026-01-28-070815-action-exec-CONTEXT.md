# Implementation Context: Action Executor
Generated: 2026-01-28-070815
Plan: SPRINT-2026-01-28-070815-action-exec-PLAN.md

## File Locations

### Primary File (NEW)
**Path**: `src/diagnostics/actionExecutor.ts` (create new file)

### Dependencies
- `src/diagnostics/types.ts` - DiagnosticAction types
- `src/stores/PatchStore.ts` - Block/edge mutations
- `src/stores/SelectionStore.ts` - Selection/navigation
- `src/stores/DiagnosticsStore.ts` - Diagnostic muting (if implemented)
- `src/events/EventHub.ts` - Event emission

## Module Structure

Create new file: `src/diagnostics/actionExecutor.ts`

### File Template
```typescript
/**
 * Action Executor - Central dispatcher for DiagnosticAction execution
 * 
 * Routes action objects to appropriate store mutations and UI commands.
 * Follows Action Determinism Contract: serializable, replayable, safe.
 * 
 * @see design-docs/.../07-diagnostics-system.md:835-854
 */

import type {
  DiagnosticAction,
  GoToTargetAction,
  InsertBlockAction,
  RemoveBlockAction,
  AddAdapterAction,
  CreateTimeRootAction,
  MuteDiagnosticAction,
  OpenDocsAction,
} from './types';
import type { PatchStore } from '../stores/PatchStore';
import type { SelectionStore } from '../stores/SelectionStore';
import type { DiagnosticsStore } from '../stores/DiagnosticsStore';
import type { EventHub } from '../events/EventHub';

/**
 * Dependencies required for action execution.
 * Injected to avoid circular dependencies and enable testing.
 */
export interface ActionExecutorDeps {
  patchStore: PatchStore;
  selectionStore: SelectionStore;
  diagnosticsStore: DiagnosticsStore;
  eventHub: EventHub;
}

/**
 * Result of action execution.
 */
export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Execute a DiagnosticAction by dispatching to appropriate handler.
 * 
 * @param action - The action to execute
 * @param deps - Store and service dependencies
 * @returns Result indicating success/failure
 */
export function executeAction(
  action: DiagnosticAction,
  deps: ActionExecutorDeps
): ActionResult {
  // Validate deps
  if (!deps.patchStore || !deps.selectionStore) {
    throw new Error('ActionExecutor: Missing required dependencies');
  }

  // Dispatch to handler based on action kind
  switch (action.kind) {
    case 'goToTarget':
      return handleGoToTarget(action, deps);
    case 'insertBlock':
      return handleInsertBlock(action, deps);
    case 'removeBlock':
      return handleRemoveBlock(action, deps);
    case 'addAdapter':
      return handleAddAdapter(action, deps);
    case 'createTimeRoot':
      return handleCreateTimeRoot(action, deps);
    case 'muteDiagnostic':
      return handleMuteDiagnostic(action, deps);
    case 'openDocs':
      return handleOpenDocs(action, deps);
    default:
      // Exhaustiveness check - TypeScript will error if we missed a case
      const _exhaustive: never = action;
      return { success: false, error: 'Unknown action kind' };
  }
}

// =============================================================================
// Handler Functions
// =============================================================================

function handleGoToTarget(
  action: GoToTargetAction,
  deps: ActionExecutorDeps
): ActionResult {
  // Implementation goes here
}

function handleInsertBlock(
  action: InsertBlockAction,
  deps: ActionExecutorDeps
): ActionResult {
  // Implementation goes here
}

function handleRemoveBlock(
  action: RemoveBlockAction,
  deps: ActionExecutorDeps
): ActionResult {
  // Implementation goes here
}

function handleAddAdapter(
  action: AddAdapterAction,
  deps: ActionExecutorDeps
): ActionResult {
  // Implementation goes here
}

function handleCreateTimeRoot(
  action: CreateTimeRootAction,
  deps: ActionExecutorDeps
): ActionResult {
  // Implementation goes here
}

function handleMuteDiagnostic(
  action: MuteDiagnosticAction,
  deps: ActionExecutorDeps
): ActionResult {
  // Implementation goes here
}

function handleOpenDocs(
  action: OpenDocsAction,
  deps: ActionExecutorDeps
): ActionResult {
  // Implementation goes here
}
```

## Implementation Details

### handleGoToTarget
**Signature**: `(action: GoToTargetAction, deps: ActionExecutorDeps) => ActionResult`

**Implementation**:
```typescript
function handleGoToTarget(
  action: GoToTargetAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { selectionStore } = deps;
  const { target } = action;

  try {
    switch (target.kind) {
      case 'block':
        selectionStore.selectBlock(target.blockId);
        return { success: true };

      case 'port':
        // Select the block containing the port
        selectionStore.selectBlock(target.blockId);
        // TODO: Port-specific highlighting if supported
        return { success: true };

      case 'edge':
        selectionStore.selectEdge(target.edgeId);
        return { success: true };

      case 'patch':
        // Clear selection to show whole patch
        selectionStore.selectBlock(null);
        return { success: true };

      default:
        return { 
          success: false, 
          error: `Unsupported target kind: ${(target as any).kind}` 
        };
    }
  } catch (err) {
    return { 
      success: false, 
      error: `Navigation failed: ${err instanceof Error ? err.message : 'Unknown error'}` 
    };
  }
}
```

**SelectionStore methods** (from src/stores/SelectionStore.ts):
- `selectBlock(id: BlockId | null)` - Line 297
- `selectEdge(id: string | null)` - Check file for exact signature
- Pass `null` to clear selection

### handleCreateTimeRoot
**Signature**: `(action: CreateTimeRootAction, deps: ActionExecutorDeps) => ActionResult`

**Implementation**:
```typescript
function handleCreateTimeRoot(
  action: CreateTimeRootAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore, selectionStore } = deps;

  try {
    // Validate timeRootKind (only 'Infinite' supported currently)
    if (action.timeRootKind !== 'Infinite') {
      return { 
        success: false, 
        error: `Unsupported timeRootKind: ${action.timeRootKind}` 
      };
    }

    // Create InfiniteTimeRoot block
    const blockId = patchStore.addBlock(
      'InfiniteTimeRoot',
      {}, // No parameters needed for InfiniteTimeRoot
      {
        label: 'Time Root',
        role: 'timeRoot', // Important for block classification
      }
    );

    // Select the newly created block so user can see it
    selectionStore.selectBlock(blockId);

    return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: `Failed to create TimeRoot: ${err instanceof Error ? err.message : 'Unknown error'}` 
    };
  }
}
```

**PatchStore.addBlock signature** (line 250):
```typescript
addBlock(
  type: BlockType,
  params: Record<string, unknown> = {},
  options?: BlockOptions
): BlockId
```

**BlockOptions interface** (line 28):
```typescript
interface BlockOptions {
  label?: string;
  displayName?: string;
  domainId?: string | null;
  role?: BlockRole; // 'timeRoot' | 'bus' | etc.
}
```

### handleRemoveBlock
**Signature**: `(action: RemoveBlockAction, deps: ActionExecutorDeps) => ActionResult`

**Implementation**:
```typescript
function handleRemoveBlock(
  action: RemoveBlockAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore } = deps;
  const { blockId } = action;

  try {
    // Validate block exists
    const patch = patchStore.snapshot;
    const block = patch.blocks[blockId];
    
    if (!block) {
      return { 
        success: false, 
        error: `Block ${blockId} not found` 
      };
    }

    // Remove block (also removes connected edges automatically)
    patchStore.removeBlock(blockId);

    return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: `Failed to remove block: ${err instanceof Error ? err.message : 'Unknown error'}` 
    };
  }
}
```

**PatchStore.removeBlock signature** (line 330):
```typescript
removeBlock(id: BlockId): void
```

**Behavior**:
- Automatically removes all connected edges
- Emits BlockRemoved event (line 348-359)
- SelectionStore listens to BlockRemoved and clears selection if needed

### handleInsertBlock
**Signature**: `(action: InsertBlockAction, deps: ActionExecutorDeps) => ActionResult`

**Implementation** (basic, without positioning):
```typescript
function handleInsertBlock(
  action: InsertBlockAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore, selectionStore } = deps;

  try {
    // Create block (position/nearBlockId not yet supported)
    const blockId = patchStore.addBlock(
      action.blockType,
      {}, // No default parameters
      {
        label: action.blockType, // Use type as label
      }
    );

    // TODO: Handle action.position ('before' | 'after') and action.nearBlockId
    // when layout system is available

    // Select newly created block
    selectionStore.selectBlock(blockId);

    return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: `Failed to insert block: ${err instanceof Error ? err.message : 'Unknown error'}` 
    };
  }
}
```

**Notes**:
- `position` and `nearBlockId` fields are currently unused
- No layout/positioning system found in PatchStore
- Block will appear at default position in UI
- Future enhancement: add layout metadata or positioning system

### handleAddAdapter
**Signature**: `(action: AddAdapterAction, deps: ActionExecutorDeps) => ActionResult`

**Implementation** (complex - requires edge manipulation):
```typescript
function handleAddAdapter(
  action: AddAdapterAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore, selectionStore } = deps;

  try {
    // 1. Find target port/edge that needs adapter
    // This is complex - may need to find edge connected to fromPort
    // TODO: Implement edge finding logic

    // 2. Create adapter block
    const adapterId = patchStore.addBlock(
      action.adapterType, // e.g., 'SignalToValue'
      {},
      { label: 'Adapter' }
    );

    // 3. Rewire edges: source → adapter → target
    // TODO: Remove old edge, add two new edges

    // 4. Select adapter block
    selectionStore.selectBlock(adapterId);

    return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: `Failed to add adapter: ${err instanceof Error ? err.message : 'Unknown error'}` 
    };
  }
}
```

**Notes**:
- This is MEDIUM confidence - complex implementation
- Requires finding existing edge between fromPort and target
- May need helper function: `findEdge(fromPort, toPort)`
- Consider deferring or implementing as separate work item

### handleMuteDiagnostic
**Signature**: `(action: MuteDiagnosticAction, deps: ActionExecutorDeps) => ActionResult`

**Implementation**:
```typescript
function handleMuteDiagnostic(
  action: MuteDiagnosticAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { diagnosticsStore } = deps;

  try {
    // TODO: Add muted diagnostics tracking to DiagnosticsStore
    // For now, return unimplemented
    return { 
      success: false, 
      error: 'Diagnostic muting not yet implemented' 
    };

    // Future implementation:
    // diagnosticsStore.muteDiagnostic(action.diagnosticId);
    // return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: `Failed to mute diagnostic: ${err instanceof Error ? err.message : 'Unknown error'}` 
    };
  }
}
```

**Notes**:
- Requires enhancing DiagnosticsStore with muted diagnostics Set
- Add method: `muteDiagnostic(id: string): void`
- UI should filter out muted diagnostics

### handleOpenDocs
**Signature**: `(action: OpenDocsAction, deps: ActionExecutorDeps) => ActionResult`

**Implementation**:
```typescript
function handleOpenDocs(
  action: OpenDocsAction,
  deps: ActionExecutorDeps
): ActionResult {
  try {
    // Open URL in new browser tab
    window.open(action.docUrl, '_blank', 'noopener,noreferrer');
    return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: `Failed to open docs: ${err instanceof Error ? err.message : 'Unknown error'}` 
    };
  }
}
```

**Notes**:
- Use `noopener,noreferrer` for security
- Purely UI action - no graph mutations
- May be blocked by popup blockers - consider error handling

## Testing Strategy

### Unit Tests
Create file: `src/diagnostics/__tests__/actionExecutor.test.ts`

```typescript
import { executeAction } from '../actionExecutor';
import type { ActionExecutorDeps } from '../actionExecutor';

describe('actionExecutor', () => {
  let mockDeps: ActionExecutorDeps;

  beforeEach(() => {
    mockDeps = {
      patchStore: {
        addBlock: jest.fn(() => 'block-123'),
        removeBlock: jest.fn(),
        snapshot: { blocks: { 'block-123': {} } },
      },
      selectionStore: {
        selectBlock: jest.fn(),
        selectEdge: jest.fn(),
      },
      diagnosticsStore: {},
      eventHub: {},
    } as any;
  });

  describe('goToTarget', () => {
    it('selects block target', () => {
      const result = executeAction({
        kind: 'goToTarget',
        label: 'Go to Block',
        target: { kind: 'block', blockId: 'block-123' },
      }, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-123');
    });
  });

  describe('createTimeRoot', () => {
    it('creates InfiniteTimeRoot block', () => {
      const result = executeAction({
        kind: 'createTimeRoot',
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite',
      }, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.addBlock).toHaveBeenCalledWith(
        'InfiniteTimeRoot',
        {},
        { label: 'Time Root', role: 'timeRoot' }
      );
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-123');
    });
  });

  describe('removeBlock', () => {
    it('removes existing block', () => {
      const result = executeAction({
        kind: 'removeBlock',
        label: 'Remove Block',
        blockId: 'block-123',
      }, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.removeBlock).toHaveBeenCalledWith('block-123');
    });

    it('fails for non-existent block', () => {
      mockDeps.patchStore.snapshot = { blocks: {} };

      const result = executeAction({
        kind: 'removeBlock',
        label: 'Remove Block',
        blockId: 'block-999',
      }, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
```

## Integration with RootStore

**Location**: `src/stores/RootStore.ts` (if exists)

Add method to RootStore for easy action execution:
```typescript
class RootStore {
  // ... existing stores

  executeAction(action: DiagnosticAction): ActionResult {
    return executeAction(action, {
      patchStore: this.patchStore,
      selectionStore: this.selectionStore,
      diagnosticsStore: this.diagnosticsStore,
      eventHub: this.eventHub,
    });
  }
}
```

This allows UI components to execute actions via:
```typescript
rootStore.executeAction(diagnostic.actions[0]);
```
