/**
 * Bidirectional Sync between PatchStore and ReactFlow Editor
 *
 * PatchStore is the source of truth.
 * ReactFlow editor is a UI layer that syncs with PatchStore.
 *
 * Sync flow:
 * 1. PatchStore → ReactFlow: Load initial state, react to external changes
 * 2. ReactFlow → PatchStore: User edits in editor update PatchStore
 *
 * Uses isSyncing guard to prevent infinite loops.
 */

import { reaction } from 'mobx';
import type { Node, Edge as ReactFlowEdge, OnNodesChange, OnEdgesChange, OnConnect } from 'reactflow';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Patch, BlockId } from '../../types';
import type { PatchStore } from '../../stores/PatchStore';
import type { DiagnosticsStore } from '../../stores/DiagnosticsStore';
import { getBlockDefinition } from '../../blocks/registry';
import { createNodeFromBlock, createEdgeFromPatchEdge, type OscillaNode } from './nodes';
import { getPortTypeFromBlockType, formatUnitForDisplay } from './typeValidation';
import { findAdapter } from '../../graph/adapters';

// Flag to prevent sync loops
let isSyncing = false;

/**
 * Sync state holder.
 * Stores ReactFlow nodes/edges state setters and PatchStore reference.
 */
export interface SyncHandle {
  patchStore: PatchStore;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<ReactFlowEdge[]>>;
}

/**
 * Load PatchStore state into ReactFlow.
 * Called on initial mount and when PatchStore changes externally.
 */
export function syncPatchToReactFlow(
  patch: Patch,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<ReactFlowEdge[]>>,
  diagnostics: DiagnosticsStore
): void {
  if (isSyncing) return;
  isSyncing = true;

  try {
    // Build blockDefs map for looking up connected block labels
    const blockDefs = new Map<string, ReturnType<typeof getBlockDefinition>>();
    for (const block of patch.blocks.values()) {
      if (!blockDefs.has(block.type)) {
        const def = getBlockDefinition(block.type);
        if (def) blockDefs.set(block.type, def);
      }
    }

    // Create nodes from blocks
    const nodes: OscillaNode[] = [];
    let x = 100;
    let y = 100;

    for (const block of patch.blocks.values()) {
      const def = blockDefs.get(block.type);
      if (!def) {
        diagnostics.log({
          level: 'warn',
          message: `Block definition not found: ${block.type}`,
          data: { blockId: block.id, blockType: block.type },
        });
        continue;
      }

      // Pass edges, blocks, and blockDefs to compute connection info
      const node = createNodeFromBlock(block, def, patch.edges, patch.blocks, blockDefs as any);
      // Position nodes in simple grid layout
      node.position = { x, y };
      nodes.push(node);

      x += 250;
      if (x > 1000) {
        x = 100;
        y += 150;
      }
    }

    // Create edges from patch edges (with adapter labels)
    const edges = patch.edges.map(e => createEdgeFromPatchEdge(e, patch.blocks));

    setNodes(nodes);
    setEdges(edges);
  } finally {
    isSyncing = false;
  }
}

/**
 * Setup MobX reaction to sync PatchStore changes back to ReactFlow.
 * This enables external changes (e.g., from TableView) to reflect in editor.
 */
export function setupPatchToReactFlowReaction(handle: SyncHandle, diagnostics: DiagnosticsStore): () => void {
  return reaction(
    () => ({
      blockCount: handle.patchStore.blocks.size,
      edgeCount: handle.patchStore.edges.length,
      // Trigger on any change - MobX will detect
    }),
    () => {
      if (!isSyncing) {
        // Re-sync editor from PatchStore
        syncPatchToReactFlow(
          handle.patchStore.patch,
          handle.setNodes,
          handle.setEdges,
          diagnostics
        );
      }
    }
  );
}

/**
 * Create onNodesChange handler for ReactFlow.
 * Handles node deletion.
 */
export function createNodesChangeHandler(handle: SyncHandle): OnNodesChange {
  return (changes) => {
    if (isSyncing) return;

    // Apply changes to local state first
    handle.setNodes((nodes) => applyNodeChanges(changes, nodes));

    // Handle removal changes - sync to PatchStore
    for (const change of changes) {
      if (change.type === 'remove') {
        const nodeId = change.id as BlockId;
        isSyncing = true;
        try {
          handle.patchStore.removeBlock(nodeId);
        } finally {
          isSyncing = false;
        }
      }
    }
  };
}

/**
 * Create onEdgesChange handler for ReactFlow.
 * Handles edge deletion.
 */
export function createEdgesChangeHandler(handle: SyncHandle): OnEdgesChange {
  return (changes) => {
    if (isSyncing) return;

    // Apply changes to local state first
    handle.setEdges((edges) => applyEdgeChanges(changes, edges));

    // Handle removal changes - sync to PatchStore
    for (const change of changes) {
      if (change.type === 'remove') {
        const edgeId = change.id;
        isSyncing = true;
        try {
          handle.patchStore.removeEdge(edgeId);
        } finally {
          isSyncing = false;
        }
      }
    }
  };
}

/**
 * Create onConnect handler for ReactFlow.
 * Handles connection creation.
 */
export function createConnectHandler(handle: SyncHandle): OnConnect {
  return (connection) => {
    if (isSyncing) return;
    if (!connection.source || !connection.target) return;

    isSyncing = true;
    try {
      // Add to PatchStore (source of truth)
      const edgeId = handle.patchStore.addEdge(
        {
          kind: 'port',
          blockId: connection.source,
          slotId: connection.sourceHandle || '',
        },
        {
          kind: 'port',
          blockId: connection.target,
          slotId: connection.targetHandle || '',
        }
      );

      // Also add to ReactFlow state directly (since reaction is blocked by isSyncing)
      const newEdge: ReactFlowEdge = {
        id: edgeId,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
        type: 'default',
      };

      // Compute adapter label for the new edge
      const sourceBlock = handle.patchStore.patch.blocks.get(connection.source as BlockId);
      const targetBlock = handle.patchStore.patch.blocks.get(connection.target as BlockId);
      if (sourceBlock && targetBlock) {
        const sourceType = getPortTypeFromBlockType(sourceBlock.type, connection.sourceHandle || '', 'output');
        const targetType = getPortTypeFromBlockType(targetBlock.type, connection.targetHandle || '', 'input');
        if (sourceType && targetType) {
          const adapter = findAdapter(sourceType, targetType);
          if (adapter) {
            const fromUnit = formatUnitForDisplay(sourceType.unit);
            const toUnit = formatUnitForDisplay(targetType.unit);
            newEdge.label = `${fromUnit}→${toUnit}`;
            newEdge.labelStyle = { fontSize: 10, fill: '#888' };
            newEdge.style = { stroke: '#f59e0b', strokeDasharray: '4 2' };
          }
        }
      }

      handle.setEdges((edges) => [...edges, newEdge]);
    } finally {
      isSyncing = false;
    }
  };
}

/**
 * Add a block to ReactFlow at the center of the viewport.
 */
export function addBlockToReactFlow(
  blockId: BlockId,
  blockType: string,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  diagnostics: DiagnosticsStore
): void {
  const def = getBlockDefinition(blockType);
  if (!def) {
    diagnostics.log({
      level: 'warn',
      message: `Block definition not found: ${blockType}`,
      data: { blockId, blockType },
    });
    return;
  }

  const node = createNodeFromBlock(
    {
      id: blockId,
      type: blockType,
      displayName: def.label,
      params: {},
      domainId: null,
      role: { kind: 'user', meta: {} },
    } as any,
    def,
    [] // No edges for new block
  );

  // Position at reasonable default (center logic would require viewport access)
  node.position = { x: 250, y: 250 };

  setNodes((nodes) => [...nodes, node]);
}
