/**
 * Bidirectional Sync between PatchStore and Rete Editor
 *
 * PatchStore is the source of truth.
 * Rete editor is a UI layer that syncs with PatchStore.
 *
 * Sync flow:
 * 1. PatchStore → Rete: Load initial state, react to external changes
 * 2. Rete → PatchStore: User edits in editor update PatchStore
 *
 * Uses isSyncing guard to prevent infinite loops.
 */

import { reaction } from 'mobx';
import { NodeEditor, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin } from 'rete-connection-plugin';
import type { Patch, BlockId } from '../../types';
import type { PatchStore } from '../../stores/PatchStore';
import { getBlockDefinition } from '../../blocks/registry';
import { OscillaNode, createNodeFromBlock } from './nodes';
import type { ReteEditorHandle } from './ReteEditor';

// Flag to prevent sync loops
let isSyncing = false;

/**
 * Load PatchStore state into Rete editor.
 * Called on initial mount and when PatchStore changes externally.
 */
export async function syncPatchToEditor(handle: ReteEditorHandle, patch: Patch): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  const { editor, area } = handle;

  try {
    // Clear existing nodes and connections
    const existingNodes = editor.getNodes();
    for (const node of existingNodes) {
      await editor.removeNode(node.id);
    }

    // Add nodes from patch
    const nodeMap = new Map<BlockId, OscillaNode>();
    let x = 100;
    let y = 100;

    for (const block of patch.blocks.values()) {
      const def = getBlockDefinition(block.type);
      if (!def) {
        console.warn(`Block definition not found: ${block.type}`);
        continue;
      }

      const node = createNodeFromBlock(block, def);
      await editor.addNode(node);
      nodeMap.set(block.id, node);

      // Position nodes in simple grid layout
      await area.translate(node.id, { x, y });
      x += 200;
      if (x > 800) {
        x = 100;
        y += 150;
      }
    }

    // Add connections from patch edges
    for (const edge of patch.edges) {
      const sourceNode = nodeMap.get(edge.from.blockId as BlockId);
      const targetNode = nodeMap.get(edge.to.blockId as BlockId);

      if (sourceNode && targetNode) {
        const sourceOutput = sourceNode.outputs[edge.from.slotId];
        const targetInput = targetNode.inputs[edge.to.slotId];

        if (sourceOutput && targetInput) {
          // Use general Node type for connection creation (Rete accepts this)
          const conn = new ClassicPreset.Connection(
            sourceNode as ClassicPreset.Node,
            edge.from.slotId,
            targetNode as ClassicPreset.Node,
            edge.to.slotId
          );
          await editor.addConnection(conn);
        } else {
          console.warn(
            `Port not found: ${edge.from.blockId}.${edge.from.slotId} → ${edge.to.blockId}.${edge.to.slotId}`
          );
        }
      }
    }

    // Fit view to nodes (if any exist)
    const nodes = editor.getNodes();
    if (nodes.length > 0) {
      await AreaExtensions.zoomAt(area, nodes);
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Setup Rete → PatchStore sync (user edits in editor).
 * Listens to Rete events and updates PatchStore.
 */
export function setupEditorToPatchSync(
  handle: ReteEditorHandle,
  patchStore: PatchStore
): void {
  const { editor, connection } = handle;

  // Listen to editor events via addPipe
  editor.addPipe((context) => {
    if (isSyncing) return context;

    // Node removed
    if (context.type === 'noderemoved') {
      const node = context.data as OscillaNode;
      isSyncing = true;
      try {
        patchStore.removeBlock(node.blockId);
      } finally {
        isSyncing = false;
      }
    }

    // Connection created
    if (context.type === 'connectioncreated') {
      const conn = context.data as ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>;
      // conn.source and conn.target are node IDs (strings), need to look up actual nodes
      const sourceNode = editor.getNode(conn.source) as OscillaNode;
      const targetNode = editor.getNode(conn.target) as OscillaNode;

      if (sourceNode && targetNode) {
        isSyncing = true;
        try {
          patchStore.addEdge(
            { kind: 'port', blockId: sourceNode.blockId, slotId: conn.sourceOutput },
            { kind: 'port', blockId: targetNode.blockId, slotId: conn.targetInput }
          );
        } finally {
          isSyncing = false;
        }
      }
    }

    // Connection removed
    if (context.type === 'connectionremoved') {
      const conn = context.data as ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>;
      const sourceNode = editor.getNode(conn.source) as OscillaNode;
      const targetNode = editor.getNode(conn.target) as OscillaNode;

      if (sourceNode && targetNode) {
        // Find and remove corresponding edge in PatchStore
        isSyncing = true;
        try {
          const edge = patchStore.edges.find(
            (e) =>
              e.from.blockId === sourceNode.blockId &&
              e.from.slotId === conn.sourceOutput &&
              e.to.blockId === targetNode.blockId &&
              e.to.slotId === conn.targetInput
          );
          if (edge) {
            patchStore.removeEdge(edge.id);
          }
        } finally {
          isSyncing = false;
        }
      }
    }

    return context;
  });
}

/**
 * Setup MobX reaction to sync PatchStore changes back to Rete.
 * This enables external changes (e.g., from TableView) to reflect in editor.
 */
export function setupPatchToEditorReaction(
  handle: ReteEditorHandle,
  patchStore: PatchStore
): () => void {
  return reaction(
    () => ({
      blockCount: patchStore.blocks.size,
      edgeCount: patchStore.edges.length,
      // Trigger on any change - MobX will detect
    }),
    () => {
      if (!isSyncing) {
        // Re-sync editor from PatchStore
        syncPatchToEditor(handle, patchStore.patch);
      }
    }
  );
}
