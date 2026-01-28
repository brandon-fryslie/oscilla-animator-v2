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
import type { EventHub } from '../events/EventHub';

/**
 * Dependencies required for action execution.
 * Injected to avoid circular dependencies and enable testing.
 */
export interface ActionExecutorDeps {
  patchStore: PatchStore;
  selectionStore: SelectionStore;
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

/**
 * Navigate to a target in the UI using SelectionStore.
 * Supports block, port, timeRoot, and other targets defined in TargetRef.
 */
function handleGoToTarget(
  action: GoToTargetAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { selectionStore } = deps;
  const { target } = action;

  try {
    switch (target.kind) {
      case 'block':
        selectionStore.selectBlock(target.blockId as any);
        return { success: true };

      case 'port':
        // Select the block containing the port
        selectionStore.selectBlock(target.blockId as any);
        // TODO: Port-specific highlighting if supported
        return { success: true };

      case 'timeRoot':
        // TimeRoot is a specialized block reference
        selectionStore.selectBlock(target.blockId as any);
        return { success: true };

      case 'bus':
      case 'binding':
      case 'graphSpan':
      case 'composite':
        // Not yet supported - return error
        return {
          success: false,
          error: `Navigation to ${target.kind} targets not yet implemented`,
        };

      default:
        return {
          success: false,
          error: `Unsupported target kind: ${(target as any).kind}`,
        };
    }
  } catch (err) {
    return {
      success: false,
      error: `Navigation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Insert a new block into the patch.
 * Note: position and nearBlockId are not yet supported (no layout system).
 */
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
      error: `Failed to insert block: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Remove a block from the patch.
 * Validates block exists before removal.
 */
function handleRemoveBlock(
  action: RemoveBlockAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore } = deps;
  const { blockId } = action;

  try {
    // Validate block exists
    const patch = patchStore.patch;
    const block = patch.blocks.get(blockId as any);

    if (!block) {
      return {
        success: false,
        error: `Block ${blockId} not found`,
      };
    }

    // Remove block (also removes connected edges automatically)
    patchStore.removeBlock(blockId as any);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to remove block: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Add an adapter block between two ports to fix type mismatches.
 * Note: This is a complex operation requiring edge manipulation.
 * Current implementation is basic - creates adapter block but does not rewire edges.
 */
function handleAddAdapter(
  action: AddAdapterAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore, selectionStore } = deps;

  try {
    // Create adapter block
    const adapterId = patchStore.addBlock(
      action.adapterType, // e.g., 'SignalToValue'
      {},
      { label: 'Adapter' }
    );

    // Select adapter block
    selectionStore.selectBlock(adapterId);

    // TODO: Rewire edges: source → adapter → target
    // This requires:
    // 1. Find existing edge connected to fromPort
    // 2. Remove old edge
    // 3. Add two new edges: source → adapter → target

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to add adapter: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Create a time root block (required for patch execution).
 * Currently only supports InfiniteTimeRoot.
 */
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
        error: `Unsupported timeRootKind: ${action.timeRootKind}`,
      };
    }

    // Create InfiniteTimeRoot block
    const blockId = patchStore.addBlock(
      'InfiniteTimeRoot',
      {}, // No parameters needed for InfiniteTimeRoot
      {
        label: 'Time Root',
        role: { kind: 'timeRoot', meta: {} },
      }
    );

    // Select the newly created block so user can see it
    selectionStore.selectBlock(blockId);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create TimeRoot: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Mute/hide a specific diagnostic (user dismissal).
 * Note: Requires DiagnosticsStore enhancement - not yet implemented.
 */
function handleMuteDiagnostic(
  action: MuteDiagnosticAction,
  deps: ActionExecutorDeps
): ActionResult {
  try {
    // TODO: Add muted diagnostics tracking to DiagnosticsStore
    // For now, return unimplemented
    return {
      success: false,
      error: 'Diagnostic muting not yet implemented',
    };

    // Future implementation:
    // diagnosticsStore.muteDiagnostic(action.diagnosticId);
    // return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to mute diagnostic: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Open documentation in external browser.
 * Pure UI action - no graph mutations.
 */
function handleOpenDocs(
  action: OpenDocsAction,
  deps: ActionExecutorDeps
): ActionResult {
  try {
    // Open URL in new browser tab
    if (typeof window !== 'undefined' && window.open) {
      window.open(action.docUrl, '_blank', 'noopener,noreferrer');
      return { success: true };
    } else {
      return {
        success: false,
        error: 'Window.open not available (non-browser environment)',
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to open docs: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
