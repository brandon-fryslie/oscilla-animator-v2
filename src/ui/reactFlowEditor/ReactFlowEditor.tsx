/**
 * ReactFlowEditor Component
 *
 * Alternative node editor using ReactFlow library.
 * Provides pan/zoom, node creation, connection management.
 * Syncs bidirectionally with PatchStore.
 */

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Panel,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@mui/material';
import { rootStore } from '../../stores';
import type { BlockId, PortId } from '../../types';
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
import { getLayoutedElements } from './layout';
import { validateConnection } from './typeValidation';
import { BlockContextMenu } from './menus/BlockContextMenu';
import { EdgeContextMenu } from './menus/EdgeContextMenu';
import { PortContextMenu } from './menus/PortContextMenu';
import { SimpleDebugPanel } from '../components/SimpleDebugPanel';
import { useDebugProbe } from '../hooks/useDebugProbe';
import './ReactFlowEditor.css';

export interface ReactFlowEditorHandle {
  addBlock(blockId: BlockId, blockType: string): Promise<void>;
  removeBlock(blockId: BlockId): Promise<void>;
  zoomToFit(): Promise<void>;
  autoArrange(): Promise<void>;
}

interface ReactFlowEditorProps {
  onEditorReady?: (handle: EditorHandle) => void;
}

/**
 * Context menu state types.
 */
interface BlockMenuState {
  type: 'block';
  blockId: BlockId;
  position: { top: number; left: number };
}

interface EdgeMenuState {
  type: 'edge';
  edgeId: string;
  position: { top: number; left: number };
}

interface PortMenuState {
  type: 'port';
  blockId: BlockId;
  portId: PortId;
  isInput: boolean;
  position: { top: number; left: number };
}

type ContextMenuState = BlockMenuState | EdgeMenuState | PortMenuState | null;

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

    async autoArrange(): Promise<void> {
      await handle.autoArrange();
    },

    getRawHandle(): unknown {
      return handle;
    },
  };
}

/**
 * Inner component that has access to useReactFlow hook.
 */
interface ReactFlowEditorInnerProps {
  onEditorReady?: (handle: EditorHandle) => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}

const ReactFlowEditorInner: React.FC<ReactFlowEditorInnerProps> = ({
  onEditorReady,
  wrapperRef,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLayouting, setIsLayouting] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const { fitView, setCenter } = useReactFlow();

  // Debug probe state (Sprint 1: Debug Probe)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [debugPanelEnabled, setDebugPanelEnabled] = useState(true);
  const edgeValue = useDebugProbe(debugPanelEnabled ? hoveredEdgeId : null);

  // Store refs for handle access to latest state
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

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

  // Selection handlers - sync ReactFlow selection to SelectionStore
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      rootStore.selection.selectBlock(node.id as BlockId);
    },
    []
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      rootStore.selection.selectEdge(edge.id);
    },
    []
  );

  const handlePaneClick = useCallback(() => {
    rootStore.selection.clearSelection();
    setContextMenu(null); // Close context menu when clicking pane
  }, []);

  // Context menu handlers
  const handleNodeContextMenu = useCallback<NodeMouseHandler>(
    (event, node) => {
      event.preventDefault();
      setContextMenu({
        type: 'block',
        blockId: node.id as BlockId,
        position: { top: event.clientY, left: event.clientX },
      });
    },
    []
  );

  const handleEdgeContextMenu = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      event.preventDefault();
      setContextMenu({
        type: 'edge',
        edgeId: edge.id,
        position: { top: event.clientY, left: event.clientX },
      });
    },
    []
  );

  // Port context menu handler - called from OscillaNode
  const handlePortContextMenu = useCallback(
    (blockId: BlockId, portId: PortId, isInput: boolean, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        type: 'port',
        blockId,
        portId,
        isInput,
        position: { top: event.clientY, left: event.clientX },
      });
    },
    []
  );

  // Edge hover handlers (Sprint 1: Debug Probe)
  const handleEdgeMouseEnter = useCallback<EdgeMouseHandler>(
    (_event, edge) => {
      setHoveredEdgeId(edge.id);
    },
    []
  );

  const handleEdgeMouseLeave = useCallback<EdgeMouseHandler>(
    () => {
      setHoveredEdgeId(null);
    },
    []
  );

  // Expose port context menu handler via global store for OscillaNode access
  // (Alternative: use React Context, but this is simpler for now)
  useEffect(() => {
    (window as any).__reactFlowPortContextMenu = handlePortContextMenu;
    return () => {
      delete (window as any).__reactFlowPortContextMenu;
    };
  }, [handlePortContextMenu]);

  // Navigate to block helper - centers and selects block
  const navigateToBlock = useCallback(
    (blockId: BlockId) => {
      const node = nodesRef.current.find((n) => n.id === blockId);
      if (node) {
        rootStore.selection.selectBlock(blockId);
        setCenter(node.position.x + 90, node.position.y + 50, {
          zoom: 1.2,
          duration: 300,
        });
      }
    },
    [setCenter]
  );

  // Connection validation - prevent incompatible type connections
  const isValidConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return false;

    const result = validateConnection(
      connection.source,
      connection.sourceHandle || '',
      connection.target,
      connection.targetHandle || '',
      rootStore.patch.patch
    );

    return result.valid;
  }, []);

  // Auto-arrange handler
  const handleAutoArrange = useCallback(async () => {
    if (isLayouting) return;

    // Edge case: empty graph - no-op
    if (nodesRef.current.length === 0) {
      return;
    }

    setIsLayouting(true);

    try {
      // Edge case: single node - just zoom to it, skip layout computation
      if (nodesRef.current.length === 1) {
        setTimeout(() => fitView({ padding: 0.1 }), 50);
        return;
      }

      // Multiple nodes - run ELK layout algorithm
      const { nodes: layoutedNodes } = await getLayoutedElements(
        nodesRef.current,
        edgesRef.current
      );
      setNodes(layoutedNodes);

      // Fit view after layout completes
      setTimeout(() => fitView({ padding: 0.1 }), 50);
    } catch (error) {
      // Log to diagnostics system (appears in LogPanel)
      rootStore.diagnostics.log({
        level: 'error',
        message: `Auto-arrange failed: ${error instanceof Error ? error.message : String(error)}`,
        data: { error },
      });
    } finally {
      setIsLayouting(false);
    }
  }, [isLayouting, setNodes, fitView]);

  // Store autoArrange ref for handle access
  const autoArrangeRef = useRef(handleAutoArrange);
  autoArrangeRef.current = handleAutoArrange;

  // Track previous node count to detect additions/deletions
  const prevNodeCountRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);

  // Auto-arrange on startup and when blocks are added/deleted
  useEffect(() => {
    let initTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let changeTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const currentCount = nodes.length;
    const prevCount = prevNodeCountRef.current;

    // On first render with nodes, trigger auto-arrange once
    if (!hasInitializedRef.current && currentCount > 0) {
      hasInitializedRef.current = true;
      // Delay to ensure layout is ready
      initTimeoutId = setTimeout(() => autoArrangeRef.current(), 100);
    }

    // After initialization, trigger auto-arrange when node count changes (add/delete)
    if (hasInitializedRef.current && prevCount !== null && prevCount !== currentCount) {
      // Only trigger if we're not already layouting
      if (!isLayouting) {
        // Small delay to let React settle
        changeTimeoutId = setTimeout(() => autoArrangeRef.current(), 50);
      }
    }

    prevNodeCountRef.current = currentCount;

    // Cleanup timeouts on unmount or when dependencies change
    return () => {
      if (initTimeoutId) clearTimeout(initTimeoutId);
      if (changeTimeoutId) clearTimeout(changeTimeoutId);
    };
  }, [nodes.length, isLayouting]);

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
        fitView({ padding: 0.1 });
      },

      async autoArrange(): Promise<void> {
        await autoArrangeRef.current();
      },
    };

    // Create adapter and notify parent (App.tsx will manage EditorContext)
    const adapter = createReactFlowEditorAdapter(handle);
    onEditorReady?.(adapter);

    // Cleanup
    return () => {
      disposeReaction();
    };
  }, [onEditorReady, setNodes, setEdges, fitView]);

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

  // Force wrapper dimensions for Dockview compatibility
  React.useLayoutEffect(() => {
    if (!wrapperRef.current) return;
    const wrapper = wrapperRef.current;

    // Force explicit dimensions
    const updateDimensions = () => {
      const rect = wrapper.getBoundingClientRect();

      // If parent has no dimensions, try to inherit from parent container
      if (rect.width === 0 || rect.height === 0) {
        const parent = wrapper.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          wrapper.style.width = parentRect.width > 0 ? '100%' : '100vw';
          wrapper.style.height = parentRect.height > 0 ? '100%' : '100vh';
        }
      }
    };

    // Update dimensions immediately and on window resize
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(wrapper);
    window.addEventListener('resize', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [wrapperRef]);

  // Build edge label for debug panel
  const edgeLabel = useMemo(() => {
    if (!hoveredEdgeId) return null;

    const edge = edges.find((e) => e.id === hoveredEdgeId);
    if (!edge) return null;

    return `${edge.source}:${edge.sourceHandle} → ${edge.target}:${edge.targetHandle}`;
  }, [hoveredEdgeId, edges]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        isValidConnection={isValidConnection}
        fitView
        attributionPosition="bottom-left"
        style={{ width: '100%', height: '100%' }}
      >
        <Background />
        <Controls />
        <Panel position="top-left" className="react-flow-panel">
          <Button
            variant="outlined"
            size="small"
            onClick={handleAutoArrange}
            disabled={isLayouting}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              borderColor: '#0f3460',
              color: isLayouting ? '#666' : '#eee',
              '&:hover': {
                borderColor: '#4ecdc4',
                background: 'rgba(78, 205, 196, 0.1)',
              },
              '&:disabled': {
                borderColor: '#0f3460',
                color: '#666',
              },
            }}
          >
            {isLayouting ? 'Arranging...' : 'Auto Arrange'}
          </Button>
        </Panel>
        <Panel position="top-right" className="react-flow-panel">
          <Button
            variant="outlined"
            size="small"
            onClick={() => setDebugPanelEnabled(!debugPanelEnabled)}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              borderColor: debugPanelEnabled ? '#4ecdc4' : '#0f3460',
              color: debugPanelEnabled ? '#4ecdc4' : '#666',
              background: debugPanelEnabled ? 'rgba(78, 205, 196, 0.1)' : 'transparent',
              '&:hover': {
                borderColor: '#4ecdc4',
                background: 'rgba(78, 205, 196, 0.1)',
              },
            }}
          >
            {debugPanelEnabled ? 'Debug: ON' : 'Debug: OFF'}
          </Button>
        </Panel>
      </ReactFlow>

      {/* Debug Panel (Sprint 1: Debug Probe) */}
      <SimpleDebugPanel
        edgeValue={edgeValue}
        edgeLabel={edgeLabel}
        enabled={debugPanelEnabled}
      />

      {/* Context Menus */}
      {contextMenu?.type === 'block' && (
        <BlockContextMenu
          blockId={contextMenu.blockId}
          anchorPosition={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onCenter={navigateToBlock}
        />
      )}
      {contextMenu?.type === 'edge' && (
        <EdgeContextMenu
          edgeId={contextMenu.edgeId}
          anchorPosition={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onNavigateToBlock={navigateToBlock}
        />
      )}
      {contextMenu?.type === 'port' && (
        <PortContextMenu
          blockId={contextMenu.blockId}
          portId={contextMenu.portId}
          isInput={contextMenu.isInput}
          anchorPosition={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

export const ReactFlowEditor: React.FC<ReactFlowEditorProps> = ({
  onEditorReady,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  return (
    <div className="react-flow-wrapper" ref={wrapperRef}>
      <ReactFlowProvider>
        <ReactFlowEditorInner
          onEditorReady={onEditorReady}
          wrapperRef={wrapperRef}
        />
      </ReactFlowProvider>
    </div>
  );
};
