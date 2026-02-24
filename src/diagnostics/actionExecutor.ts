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
import { requireAnyBlockDef } from '../blocks/registry';
import type { Endpoint } from '../graph/Patch';

/**
 * Dependencies required for action execution.
 * Injected to avoid circular dependencies and enable testing.
 */
export interface ActionExecutorDeps {
  patchStore: PatchStore;
  selectionStore: SelectionStore;
  diagnosticsStore: DiagnosticsStore;
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
  if (!deps.patchStore || !deps.selectionStore || !deps.diagnosticsStore) {
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
        selectionStore.selectPort(target.blockId as any, target.portId as any);
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
 */
function handleInsertBlock(
  action: InsertBlockAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore, selectionStore } = deps;

  try {
    // Create block
    const blockId = patchStore.addBlock(action.blockType, {});

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
 *
 * Behavior:
 * - Finds a single edge to adapt from fromPort (input or output side)
 * - Rejects ambiguous cases (multiple edges) with explicit error
 * - Rewires source -> adapter -> target
 */
function handleAddAdapter(
  action: AddAdapterAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore, selectionStore } = deps;

  try {
    const patch = patchStore.patch;
    const matchingEdges = patch.edges.filter((edge) => {
      if (edge.from.kind !== 'port' || edge.to.kind !== 'port') return false;
      if (action.fromPort.portKind === 'output') {
        return edge.from.blockId === action.fromPort.blockId && edge.from.slotId === action.fromPort.portId;
      }
      return edge.to.blockId === action.fromPort.blockId && edge.to.slotId === action.fromPort.portId;
    });

    if (matchingEdges.length === 0) {
      return {
        success: false,
        error: `No edge found for ${action.fromPort.blockId}.${action.fromPort.portId}`,
      };
    }
    if (matchingEdges.length > 1) {
      // [LAW:no-silent-fallbacks] Action schema is ambiguous for fan-out/fan-in; fail
      // explicitly instead of applying an arbitrary rewire.
      return {
        success: false,
        error: `Adapter insertion is ambiguous for ${action.fromPort.blockId}.${action.fromPort.portId} (${matchingEdges.length} edges)`,
      };
    }

    const edgeToAdapt = matchingEdges[0];
    if (edgeToAdapt.from.kind !== 'port' || edgeToAdapt.to.kind !== 'port') {
      return {
        success: false,
        error: 'Adapter insertion only supports port-to-port edges',
      };
    }

    const adapterDef = requireAnyBlockDef(action.adapterType);
    const adapterSpec = 'adapterSpec' in adapterDef ? adapterDef.adapterSpec : undefined;
    if (!adapterSpec) {
      return {
        success: false,
        error: `Block ${action.adapterType} is not an adapter block`,
      };
    }
    // [LAW:one-source-of-truth] Adapter wiring ports come from adapterSpec.
    const adapterInputPort = adapterSpec.inputPortId;
    const adapterOutputPort = adapterSpec.outputPortId;
    if (!adapterDef.inputs[adapterInputPort] || !adapterDef.outputs[adapterOutputPort]) {
      return {
        success: false,
        error: `Adapter ${action.adapterType} has invalid adapterSpec port wiring`,
      };
    }

    // Create adapter block
    const adapterId = patchStore.addBlock(
      action.adapterType, // e.g., 'Broadcast'
      {}
    );

    const sourceEndpoint: Endpoint = {
      kind: 'port',
      blockId: edgeToAdapt.from.blockId,
      slotId: edgeToAdapt.from.slotId,
    };
    const adapterInputEndpoint: Endpoint = {
      kind: 'port',
      blockId: adapterId,
      slotId: adapterInputPort,
    };
    const adapterOutputEndpoint: Endpoint = {
      kind: 'port',
      blockId: adapterId,
      slotId: adapterOutputPort,
    };
    const targetEndpoint: Endpoint = {
      kind: 'port',
      blockId: edgeToAdapt.to.blockId,
      slotId: edgeToAdapt.to.slotId,
    };

    patchStore.removeEdge(edgeToAdapt.id as any);
    patchStore.addEdge(sourceEndpoint, adapterInputEndpoint);
    patchStore.addEdge(adapterOutputEndpoint, targetEndpoint);

    // Select adapter block
    selectionStore.selectBlock(adapterId);

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
    const muted = deps.diagnosticsStore.muteDiagnostic(action.diagnosticId);
    if (!muted) {
      return {
        success: false,
        error: `Diagnostic ${action.diagnosticId} not found`,
      };
    }
    return {
      success: true,
    };
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
