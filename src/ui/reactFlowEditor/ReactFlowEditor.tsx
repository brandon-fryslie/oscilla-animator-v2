/**
 * ReactFlowEditor Component
 *
 * Alternative node editor using ReactFlow library.
 * Provides pan/zoom, node creation, connection management.
 * Syncs bidirectionally with PatchStore.
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { rootStore } from '../../stores';
import type { BlockId } from '../../types';
import type { EditorHandle } from '../editorCommon';
import {
  syncPatchToReactFlow,
  setupPatchToReactFlowReaction,
  createNodesChangeHandler,
  createEdgesChangeHandler,
  createConnectHandler,
  addBlockToReactFlow,
  type SyncHandle,
} from './sync';
import { OscillaNode } from './OscillaNode';
import './ReactFlowEditor.css';

export interface ReactFlowEditorHandle {
  addBlock(blockId: BlockId, blockType: string): Promise<void>;
  removeBlock(blockId: BlockId): Promise<void>;
  zoomToFit(): Promise<void>;
}

interface ReactFlowEditorProps {
  onEditorReady?: (handle: EditorHandle) => void;
}

/**
 * Create EditorHandle adapter for ReactFlowEditorHandle.
 * Implements generic EditorHandle interface.
 */
function createReactFlowEditorAdapter(
  handle: ReactFlowEditorHandle
): EditorHandle {
  return {
    type: 'reactflow' as const,

    async addBlock(blockId: BlockId, blockType: string): Promise<void> {
      await handle.addBlock(blockId, blockType);
    },

    async removeBlock(blockId: BlockId): Promise<void> {
      await handle.removeBlock(blockId);
    },

    async zoomToFit(): Promise<void> {
      await handle.zoomToFit();
    },

    getRawHandle(): unknown {
      return handle;
    },
  };
}

export const ReactFlowEditor: React.FC<ReactFlowEditorProps> = ({
  onEditorReady,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Register custom node types (memoized to prevent recreation)
  const nodeTypes = useMemo(() => ({ oscilla: OscillaNode }), []);

  // Setup sync handle
  const syncHandle: SyncHandle = {
    patchStore: rootStore.patch,
    setNodes,
    setEdges,
  };

  // Create event handlers that sync to PatchStore
  const handleNodesChange = useCallback(
    createNodesChangeHandler(syncHandle),
    [syncHandle.patchStore]
  );

  const handleEdgesChange = useCallback(
    createEdgesChangeHandler(syncHandle),
    [syncHandle.patchStore]
  );

  const handleConnect = useCallback(
    createConnectHandler(syncHandle),
    [syncHandle.patchStore]
  );

  // Setup bidirectional sync and editor handle
  useEffect(() => {
    // Initial sync from PatchStore
    syncPatchToReactFlow(rootStore.patch.patch, setNodes, setEdges);

    // Setup MobX reaction for external changes
    const disposeReaction = setupPatchToReactFlowReaction(syncHandle);

    // Create handle for EditorContext
    const handle: ReactFlowEditorHandle = {
      async addBlock(blockId: BlockId, blockType: string): Promise<void> {
        addBlockToReactFlow(blockId, blockType, setNodes);
      },

      async removeBlock(blockId: BlockId): Promise<void> {
        setNodes((nodes) => nodes.filter((node) => node.id !== blockId));
      },

      async zoomToFit(): Promise<void> {
        // ReactFlow handles this via Controls component
        console.log('Zoom to fit requested');
      },
    };

    // Create adapter and notify parent (App.tsx will manage EditorContext)
    const adapter = createReactFlowEditorAdapter(handle);
    onEditorReady?.(adapter);

    // Cleanup
    return () => {
      disposeReaction();
    };
  }, [onEditorReady, setNodes, setEdges]);

  // Handle delete key
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Get selected nodes
        const selectedNodes = nodes.filter((node) => node.selected);
        for (const node of selectedNodes) {
          rootStore.patch.removeBlock(node.id as BlockId);
        }

        // Get selected edges
        const selectedEdges = edges.filter((edge) => edge.selected);
        for (const edge of selectedEdges) {
          rootStore.patch.removeEdge(edge.id);
        }
      }
    },
    [nodes, edges]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};
