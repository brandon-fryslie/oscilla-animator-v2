/**
 * Bidirectional Sync between PatchStore and ReactFlow Editor
 *
 * PatchStore is the source of truth for graph TOPOLOGY (blocks, edges).
 * LayoutStore is the source of truth for node POSITIONS.
 *
 * Sync strategy:
 * - Reconciliation: adds/removes/updates nodes without destroying positions
 * - Positions are read from LayoutStore, never from PatchStore
 * - User drags persist to LayoutStore
 * - Full re-layout only on explicit user action (Auto Arrange)
 */

import { reaction } from 'mobx';
import type { Node, Edge as ReactFlowEdge, OnNodesChange, OnEdgesChange, OnConnect } from 'reactflow';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Patch, BlockId } from '../../types';
import type { PatchStore } from '../../stores/PatchStore';
import type { LayoutStore } from '../../stores/LayoutStore';
import type { DiagnosticsStore } from '../../stores/DiagnosticsStore';
import { getAnyBlockDefinition, type AnyBlockDef } from '../../blocks/registry';
import { createNodeFromBlock, createEdgeFromPatchEdge, computeAllNonContributingEdges, type OscillaNode } from './nodes';
import { getPortTypeFromBlockType, formatUnitForDisplay } from './typeValidation';
import { findAdapter } from '../../blocks/adapter-spec';

// Flag to prevent sync loops
let isSyncing = false;

/**
 * Sync state holder.
 */
export interface SyncHandle {
  patchStore: PatchStore;
  layoutStore: LayoutStore;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<ReactFlowEdge[]>>;
  getNodes: () => Node[];
}

/** Default node dimensions for positioning calculations */
const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;
/** Horizontal gap when placing a new block to the right of a source */
const PLACEMENT_GAP_X = 80;
/** Vertical offset to avoid exact overlap with source */
const PLACEMENT_GAP_Y = 20;

/**
 * Find a position for a new block.
 * Strategy:
 * 1. If the new block has inputs that match an existing block's outputs,
 *    place it to the right of that block (dataflow convention).
 * 2. Otherwise, find empty space at the right edge of the graph.
 */
function findSmartPosition(
  newBlockDef: AnyBlockDef,
  existingNodes: Node[],
  patchStore: PatchStore
): { x: number; y: number } {
  if (existingNodes.length === 0) {
    return { x: 100, y: 100 };
  }

  // Try to find a compatible source block:
  // Look at the new block's input port types and find existing blocks
  // that have matching output types
  const newInputTypes = Object.values(newBlockDef.inputs)
    .filter(input => input.exposedAsPort !== false)
    .map(input => input.type.payload);

  if (newInputTypes.length > 0) {
    // Score each existing node by how many of its outputs match our inputs
    let bestNode: Node | null = null;
    let bestScore = 0;

    for (const node of existingNodes) {
      const nodeData = node.data as { blockType?: string } | undefined;
      if (!nodeData?.blockType) continue;

      const nodeDef = getAnyBlockDefinition(nodeData.blockType);
      if (!nodeDef) continue;

      // Count matching output types
      const outputTypes = Object.values(nodeDef.outputs).map(o => o.type.payload);
      let score = 0;
      for (const outputPayload of outputTypes) {
        if (newInputTypes.includes(outputPayload)) {
          score++;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    if (bestNode) {
      // Place to the right of the best matching source block
      const sourceRight = bestNode.position.x + (bestNode.width ?? NODE_WIDTH);
      const sourceY = bestNode.position.y;

      // Check if that spot is already occupied — if so, offset vertically
      const targetX = sourceRight + PLACEMENT_GAP_X;
      let targetY = sourceY;

      // Find nodes near the target position and offset if overlapping
      for (const node of existingNodes) {
        const nodeLeft = node.position.x;
        const nodeTop = node.position.y;
        const nodeRight = nodeLeft + (node.width ?? NODE_WIDTH);
        const nodeBottom = nodeTop + (node.height ?? NODE_HEIGHT);

        // Check overlap with our target rectangle
        if (
          targetX < nodeRight + 20 &&
          targetX + NODE_WIDTH > nodeLeft - 20 &&
          targetY < nodeBottom + 20 &&
          targetY + NODE_HEIGHT > nodeTop - 20
        ) {
          // Overlap — shift below this node
          targetY = nodeBottom + PLACEMENT_GAP_Y;
        }
      }

      return { x: targetX, y: targetY };
    }
  }

  // Fallback: place to the right of the rightmost node
  let maxX = -Infinity;
  for (const node of existingNodes) {
    const nodeRight = node.position.x + (node.width ?? NODE_WIDTH);
    if (nodeRight > maxX) maxX = nodeRight;
  }

  return { x: maxX + PLACEMENT_GAP_X, y: 100 };
}

/**
 * Simple fallback positioning (no block type info available).
 * Used during reconciliation for blocks without stored positions.
 */
function findEmptyPosition(existingNodes: Node[]): { x: number; y: number } {
  if (existingNodes.length === 0) {
    return { x: 100, y: 100 };
  }

  let maxX = -Infinity;
  for (const node of existingNodes) {
    const nodeRight = node.position.x + (node.width ?? NODE_WIDTH);
    if (nodeRight > maxX) maxX = nodeRight;
  }

  return { x: maxX + PLACEMENT_GAP_X, y: 100 };
}

/**
 * Build nodes and edges from a Patch, using LayoutStore for positions.
 * This is the core reconciliation function.
 *
 * For each block in patch:
 *  - If a node already exists: preserve its position, update data
 *  - If no node exists: use LayoutStore position, or find empty space
 *
 * Removed blocks are filtered out.
 */
export function reconcileNodes(
  patch: Patch,
  currentNodes: Node[],
  layoutStore: LayoutStore,
  diagnostics: DiagnosticsStore
): { nodes: Node[]; edges: ReactFlowEdge[] } {
  // Build blockDefs map for looking up connected block labels
  const blockDefs = new Map<string, AnyBlockDef>();
  for (const block of patch.blocks.values()) {
    if (!blockDefs.has(block.type)) {
      const def = getAnyBlockDefinition(block.type);
      if (def) blockDefs.set(block.type, def);
    }
  }

  // Build map of existing nodes by ID for fast lookup
  const existingNodeMap = new Map<string, Node>();
  for (const node of currentNodes) {
    existingNodeMap.set(node.id, node);
  }

  // Reconcile nodes
  const nodes: OscillaNode[] = [];
  const patchBlockIds = new Set<string>();

  for (const block of patch.blocks.values()) {
    patchBlockIds.add(block.id);

    const def = blockDefs.get(block.type);
    if (!def) {
      diagnostics.log({
        level: 'warn',
        message: `Block definition not found: ${block.type}`,
        data: { blockId: block.id, blockType: block.type },
      });
      continue;
    }

    // Create node with updated data
    const node = createNodeFromBlock(block, def, patch.edges, patch.blocks, blockDefs);

    // Determine position (priority: existing node > LayoutStore > empty space)
    const existingNode = existingNodeMap.get(block.id);
    if (existingNode) {
      // Preserve current rendered position
      node.position = { ...existingNode.position };
    } else {
      // New node: check LayoutStore
      const storedPos = layoutStore.getPosition(block.id as BlockId);
      if (storedPos) {
        node.position = { x: storedPos.x, y: storedPos.y };
      } else {
        // No stored position: find empty space
        node.position = findEmptyPosition([...nodes, ...currentNodes]);
        // Persist this computed position
        layoutStore.setPosition(block.id as BlockId, node.position);
      }
    }

    nodes.push(node);
  }

  // Clean up positions for removed blocks
  for (const node of currentNodes) {
    if (!patchBlockIds.has(node.id)) {
      layoutStore.removePosition(node.id as BlockId);
    }
  }

  // Compute non-contributing edges before mapping
  const nonContributingEdges = computeAllNonContributingEdges(patch);

  // Build edges from patch with non-contributing styling
  const edges = patch.edges.map(e => createEdgeFromPatchEdge(e, patch.blocks, nonContributingEdges));

  return { nodes, edges };
}

/**
 * Build initial nodes and edges from a Patch (for layout computation).
 * Returns nodes with placeholder positions (0,0) - caller should run ELK layout.
 */
export function buildNodesAndEdges(
  patch: Patch,
  diagnostics: DiagnosticsStore
): { nodes: OscillaNode[]; edges: ReactFlowEdge[] } {
  const blockDefs = new Map<string, AnyBlockDef>();
  for (const block of patch.blocks.values()) {
    if (!blockDefs.has(block.type)) {
      const def = getAnyBlockDefinition(block.type);
      if (def) blockDefs.set(block.type, def);
    }
  }

  const nodes: OscillaNode[] = [];
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

    const node = createNodeFromBlock(block, def, patch.edges, patch.blocks, blockDefs);
    // Placeholder position - will be computed by ELK
    node.position = { x: 0, y: 0 };
    nodes.push(node);
  }

  // Compute non-contributing edges before mapping
  const nonContributingEdges = computeAllNonContributingEdges(patch);

  // Build edges from patch with non-contributing styling
  const edges = patch.edges.map(e => createEdgeFromPatchEdge(e, patch.blocks, nonContributingEdges));

  return { nodes, edges };
}

/**
 * Setup MobX reaction to reconcile PatchStore changes into ReactFlow.
 * This handles external changes (e.g., from TableView, delete key, etc.).
 * PRESERVES node positions - only adds/removes/updates node data.
 */
export function setupStructureReaction(
  handle: SyncHandle,
  diagnostics: DiagnosticsStore
): () => void {
  return reaction(
    () => ({
      blockCount: handle.patchStore.blocks.size,
      edgeCount: handle.patchStore.edges.length,
      // Track combineMode changes for edge dimming updates
      combineModes: Array.from(handle.patchStore.blocks.values()).map(block =>
        Array.from(block.inputPorts.values()).map(port => port.combineMode).join(',')
      ).join('|'),
    }),
    () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        const result = reconcileNodes(
          handle.patchStore.patch,
          handle.getNodes(),
          handle.layoutStore,
          diagnostics
        );
        handle.setNodes(result.nodes);
        handle.setEdges(result.edges);
      } finally {
        isSyncing = false;
      }
    }
  );
}

/**
 * Create onNodesChange handler for ReactFlow.
 * Handles node deletion and position changes.
 * Persists drag positions to LayoutStore.
 */
export function createNodesChangeHandler(handle: SyncHandle): OnNodesChange {
  return (changes) => {
    if (isSyncing) return;

    // Apply changes to local state first
    handle.setNodes((nodes) => applyNodeChanges(changes, nodes));

    // Handle specific change types
    for (const change of changes) {
      if (change.type === 'remove') {
        const nodeId = change.id as BlockId;
        isSyncing = true;
        try {
          handle.patchStore.removeBlock(nodeId);
          handle.layoutStore.removePosition(nodeId);
        } finally {
          isSyncing = false;
        }
      } else if (change.type === 'position' && change.position) {
        // Persist drag position to LayoutStore
        handle.layoutStore.setPosition(change.id as BlockId, change.position);
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

      // Recompute non-contributing edges
      const nonContributingEdges = computeAllNonContributingEdges(handle.patchStore.patch);

      // Also add to ReactFlow state directly (since reaction is blocked by isSyncing)
      const newEdge: ReactFlowEdge = {
        id: edgeId,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
        type: 'default',
      };

      // Check if this edge is non-contributing
      const isNonContributing = nonContributingEdges.has(edgeId);
      if (isNonContributing) {
        newEdge.style = { opacity: 0.3, strokeDasharray: '5,5' };
        newEdge.label = 'Not contributing';
        newEdge.labelStyle = { fontSize: 10, fill: '#666' };
      } else {
        // Compute adapter label for the new edge (only if contributing)
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
      }

      handle.setEdges((edges) => [...edges, newEdge]);
    } finally {
      isSyncing = false;
    }
  };
}

/**
 * Add a block to ReactFlow at a smart position.
 * Places near a compatible source block (matching output→input types),
 * or to the right of the graph if no match found.
 */
export function addBlockToReactFlow(
  blockId: BlockId,
  blockType: string,
  currentNodes: Node[],
  layoutStore: LayoutStore,
  patchStore: PatchStore,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  diagnostics: DiagnosticsStore
): void {
  const def = getAnyBlockDefinition(blockType);
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
      inputPorts: new Map(),
      outputPorts: new Map(),
    },
    def,
    [] // No edges for new block
  );

  // Smart position: near compatible source block
  const position = findSmartPosition(def, currentNodes, patchStore);
  node.position = position;

  // Persist to LayoutStore
  layoutStore.setPosition(blockId, position);

  setNodes((nodes) => [...nodes, node]);
}
