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
 * Uses isSyncing guard to prevent infinite loops and history commits.
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
 * Add a block to the editor at the center of the viewport.
 * Returns the node that was added.
 */
export async function addBlockToEditor(
  handle: ReteEditorHandle,
  blockId: BlockId,
  blockType: string
): Promise<OscillaNode | null> {
  const { editor, area } = handle;

  const def = getBlockDefinition(blockType);
  if (!def) {
    console.warn(`Block definition not found: ${blockType}`);
    return null;
  }

  const node = createNodeFromBlock(
    { id: blockId, type: blockType, displayName: def.label, params: {} } as any,
    def
  );

  // Add node to editor first
  await editor.addNode(node);

  // Calculate viewport center
  // area.container is the DOM element, get its dimensions
  const container = area.container;
  const rect = container.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  // Transform to editor coordinates (account for pan/zoom)
  // area.area.transform gives us the current transform
  const transform = area.area.transform;
  const editorX = (centerX - transform.x) / transform.k;
  const editorY = (centerY - transform.y) / transform.k;

  // Position the node at viewport center
  await area.translate(node.id, { x: editorX, y: editorY });

  // Zoom to fit if this is the only node
  const nodes = editor.getNodes();
  if (nodes.length === 1) {
    // Only one node (this one), zoom to fit
    await AreaExtensions.zoomAt(area, nodes);
  }

  return node;
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

/**
 * History plugin integration for undo/redo
 */
let history: any = null; // Will be set when plugin is initialized

export function setHistoryPlugin(historyPlugin: any): void {
  history = historyPlugin;
}

export function pushHistoryState(): void {
  if (history && !isSyncing) {
    history.push();
  }
}

export function undo(): void {
  if (history) {
    history.undo();
  }
}

export function redo(): void {
  if (history) {
    history.redo();
  }
}

export function isHistoryAvailable(): { undo: boolean; redo: boolean } {
  if (!history) {
    return { undo: false, redo: false };
  }

  return {
    undo: history.canUndo(),
    redo: history.canRedo()
  };
}
