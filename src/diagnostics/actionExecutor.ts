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
import type { Block, Edge, Endpoint } from '../graph/Patch';
import { blockId, type PortId } from '../types';

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

function resolveBlockForAction(patchStore: PatchStore, rawBlockId: string): Block | null {
  // [LAW:single-enforcer] ActionExecutor owns action-target resolution and is
  // the only boundary where serialized diagnostic IDs are validated/resolved.
  return patchStore.patch.blocks.get(blockId(rawBlockId)) ?? null;
}

function isKnownPortIdForBlock(block: Block, rawPortId: string): rawPortId is PortId {
  // [LAW:single-enforcer] ActionExecutor validates serialized port IDs before
  // they enter SelectionStore's PortId-typed API.
  return block.inputPorts.has(rawPortId) || block.outputPorts.has(rawPortId);
}

function unsupportedActionKind(_action: never): ActionResult {
  return { success: false, error: 'Unknown action kind' };
}

function unsupportedTargetKind(_target: never): ActionResult {
  const kind = (_target as { kind?: unknown } | null | undefined)?.kind;
  const suffix = kind === undefined ? '' : ` (kind: ${String(kind)})`;
  return { success: false, error: `Unsupported target kind${suffix}` };
}

type ActionKind = DiagnosticAction['kind'];
type ActionHandlerMap = {
  [K in ActionKind]: (action: Extract<DiagnosticAction, { kind: K }>, deps: ActionExecutorDeps) => ActionResult;
};

const actionHandlers: ActionHandlerMap = {
  goToTarget: handleGoToTarget,
  insertBlock: handleInsertBlock,
  removeBlock: handleRemoveBlock,
  addAdapter: handleAddAdapter,
  createTimeRoot: handleCreateTimeRoot,
  muteDiagnostic: handleMuteDiagnostic,
  openDocs: handleOpenDocs,
};

type GoToTarget = GoToTargetAction['target'];
type GoToTargetKind = GoToTarget['kind'];
type GoToTargetHandlerMap = {
  [K in GoToTargetKind]: (target: Extract<GoToTarget, { kind: K }>, deps: ActionExecutorDeps) => ActionResult;
};

type BlockTarget = Extract<GoToTarget, { kind: 'block' | 'timeRoot' }>;
type PortTarget = Extract<GoToTarget, { kind: 'port' }>;
type UnsupportedGoToTarget = Extract<GoToTarget, { kind: 'bus' | 'binding' | 'graphSpan' | 'composite' }>;

function toMissingBlockError(blockId: string): ActionResult {
  return { success: false, error: `Block ${blockId} not found` };
}

function resolveBlockOrFailure(
  patchStore: PatchStore,
  blockId: string
): { block: Block | null; failure: ActionResult | null } {
  const resolvedBlock = resolveBlockForAction(patchStore, blockId);
  return resolvedBlock
    ? { block: resolvedBlock, failure: null }
    : { block: null, failure: toMissingBlockError(blockId) };
}

function handleBlockLikeTargetSelection(
  target: BlockTarget,
  deps: ActionExecutorDeps
): ActionResult {
  const resolution = resolveBlockOrFailure(deps.patchStore, target.blockId);
  if (!resolution.block) {
    return resolution.failure ?? toMissingBlockError(target.blockId);
  }
  deps.selectionStore.selectBlock(resolution.block.id);
  return { success: true };
}

function handlePortTargetSelection(
  target: PortTarget,
  deps: ActionExecutorDeps
): ActionResult {
  const resolution = resolveBlockOrFailure(deps.patchStore, target.blockId);
  if (!resolution.block) {
    return resolution.failure ?? toMissingBlockError(target.blockId);
  }
  if (!isKnownPortIdForBlock(resolution.block, target.portId)) {
    return {
      success: false,
      error: `Port ${target.portId} not found on block ${target.blockId}`,
    };
  }
  deps.selectionStore.selectPort(resolution.block.id, target.portId);
  return { success: true };
}

function handleUnsupportedGoToTarget(target: UnsupportedGoToTarget): ActionResult {
  return {
    success: false,
    error: `Navigation to ${target.kind} targets not yet implemented`,
  };
}

const goToTargetHandlers: GoToTargetHandlerMap = {
  // [LAW:dataflow-not-control-flow] Target handling is data-dispatched by kind,
  // keeping execution shape fixed while target values vary.
  block: handleBlockLikeTargetSelection,
  port: handlePortTargetSelection,
  timeRoot: handleBlockLikeTargetSelection,
  bus: handleUnsupportedGoToTarget,
  binding: handleUnsupportedGoToTarget,
  graphSpan: handleUnsupportedGoToTarget,
  composite: handleUnsupportedGoToTarget,
};

function assertActionExecutorDeps(deps: ActionExecutorDeps): void {
  if (!deps.patchStore || !deps.selectionStore || !deps.diagnosticsStore) {
    throw new Error('ActionExecutor: Missing required dependencies');
  }
}

function dispatchAction(action: DiagnosticAction, deps: ActionExecutorDeps): ActionResult {
  const actionHandler = (actionHandlers as Record<string, ((input: DiagnosticAction, ctx: ActionExecutorDeps) => ActionResult) | undefined>)[action.kind];
  return actionHandler ? actionHandler(action, deps) : unsupportedActionKind(action as never);
}

function dispatchGoToTarget(target: GoToTarget, deps: ActionExecutorDeps): ActionResult {
  const targetHandler = (goToTargetHandlers as Record<string, ((input: GoToTarget, ctx: ActionExecutorDeps) => ActionResult) | undefined>)[target.kind];
  return targetHandler ? targetHandler(target, deps) : unsupportedTargetKind(target as never);
}

type PortToPortEdge = Edge & {
  from: Extract<Endpoint, { kind: 'port' }>;
  to: Extract<Endpoint, { kind: 'port' }>;
};

function isPortToPortEdge(edge: Edge): edge is PortToPortEdge {
  return edge.from.kind === 'port' && edge.to.kind === 'port';
}

function matchesAdapterSource(edge: PortToPortEdge, action: AddAdapterAction): boolean {
  return action.fromPort.portKind === 'output'
    ? edge.from.blockId === action.fromPort.blockId && edge.from.slotId === action.fromPort.portId
    : edge.to.blockId === action.fromPort.blockId && edge.to.slotId === action.fromPort.portId;
}

function collectMatchingAdapterEdges(action: AddAdapterAction, patchStore: PatchStore): PortToPortEdge[] {
  return patchStore.patch.edges.filter((edge): edge is PortToPortEdge => (
    isPortToPortEdge(edge) && matchesAdapterSource(edge, action)
  ));
}

function resolveSingleAdapterEdge(action: AddAdapterAction, matchingEdges: PortToPortEdge[]): { edge: PortToPortEdge | null; failure: ActionResult | null } {
  if (matchingEdges.length === 0) {
    return {
      edge: null,
      failure: {
        success: false,
        error: `No edge found for ${action.fromPort.blockId}.${action.fromPort.portId}`,
      },
    };
  }
  if (matchingEdges.length > 1) {
    // [LAW:no-silent-fallbacks] Ambiguous rewires fail explicitly; no arbitrary edge selection.
    return {
      edge: null,
      failure: {
        success: false,
        error: `Adapter insertion is ambiguous for ${action.fromPort.blockId}.${action.fromPort.portId} (${matchingEdges.length} edges)`,
      },
    };
  }
  return {
    edge: matchingEdges[0],
    failure: null,
  };
}

function resolveAdapterWiring(action: AddAdapterAction): { inputPortId: string | null; outputPortId: string | null; failure: ActionResult | null } {
  const adapterDef = requireAnyBlockDef(action.adapterType);
  const adapterSpec = 'adapterSpec' in adapterDef ? adapterDef.adapterSpec : undefined;
  if (!adapterSpec) {
    return {
      inputPortId: null,
      outputPortId: null,
      failure: {
        success: false,
        error: `Block ${action.adapterType} is not an adapter block`,
      },
    };
  }
  const adapterInputPort = adapterSpec.inputPortId;
  const adapterOutputPort = adapterSpec.outputPortId;
  // [LAW:one-source-of-truth] Adapter wiring ports derive strictly from adapterSpec.
  if (!adapterDef.inputs[adapterInputPort] || !adapterDef.outputs[adapterOutputPort]) {
    return {
      inputPortId: null,
      outputPortId: null,
      failure: {
        success: false,
        error: `Adapter ${action.adapterType} has invalid adapterSpec port wiring`,
      },
    };
  }
  return {
    inputPortId: adapterInputPort,
    outputPortId: adapterOutputPort,
    failure: null,
  };
}

function makePortEndpoint(blockId: string, slotId: string): Endpoint {
  return { kind: 'port', blockId, slotId };
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
  assertActionExecutorDeps(deps);
  return dispatchAction(action, deps);
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
  try {
    return dispatchGoToTarget(action.target, deps);
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
    const block = resolveBlockForAction(patchStore, blockId);

    if (!block) {
      return {
        success: false,
        error: `Block ${blockId} not found`,
      };
    }

    const issueBeforeRemove = patchStore.lastIssue;
    patchStore.removeBlock(block.id);

    if (resolveBlockForAction(patchStore, blockId)) {
      // [LAW:no-silent-fallbacks] Report refusal to mutate as ActionResult failure.
      const refusalMessage = patchStore.lastIssue && patchStore.lastIssue !== issueBeforeRemove
        ? patchStore.lastIssue.message
        : `Block ${blockId} could not be removed`;
      return {
        success: false,
        error: refusalMessage,
      };
    }

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
    const edgeResolution = resolveSingleAdapterEdge(action, collectMatchingAdapterEdges(action, patchStore));
    if (!edgeResolution.edge) {
      return edgeResolution.failure ?? { success: false, error: 'No edge found for adapter insertion' };
    }

    const wiring = resolveAdapterWiring(action);
    if (!wiring.inputPortId || !wiring.outputPortId) {
      return wiring.failure ?? { success: false, error: `Adapter ${action.adapterType} wiring is invalid` };
    }

    const adapterId = patchStore.addBlock(action.adapterType, {});
    patchStore.removeEdge(edgeResolution.edge.id);
    patchStore.addEdge(
      makePortEndpoint(edgeResolution.edge.from.blockId, edgeResolution.edge.from.slotId),
      makePortEndpoint(adapterId, wiring.inputPortId)
    );
    patchStore.addEdge(
      makePortEndpoint(adapterId, wiring.outputPortId),
      makePortEndpoint(edgeResolution.edge.to.blockId, edgeResolution.edge.to.slotId)
    );
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
