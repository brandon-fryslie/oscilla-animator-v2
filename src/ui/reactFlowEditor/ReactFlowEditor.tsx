/**
 * ReactFlowEditor Component
 *
 * Alternative node editor using ReactFlow library.
 * Provides pan/zoom, node creation, connection management.
 * Syncs bidirectionally with PatchStore.
 *
 * Layout strategy:
 * - Initial load: compute ELK layout BEFORE rendering (no flash)
 * - Mutations (add/remove block/edge): reconcile without re-layout
 * - Auto Arrange button: explicit user request to re-layout
 * - Drag: persisted to LayoutStore
 */

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
import { useStores } from '../../stores';
import type { BlockId, PortId } from '../../types';
import type { EditorHandle } from '../editorCommon';
import {
  buildNodesAndEdges,
  setupStructureReaction,
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

const ReactFlowEditorInner: React.FC<ReactFlowEditorInnerProps> = observer(({
  onEditorReady,
  wrapperRef,
}) => {
  // Get store from context
  const { patch: patchStore, selection, diagnostics, debug, layout: layoutStore } = useStores();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLayouting, setIsLayouting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const { fitView, setCenter } = useReactFlow();

  // Store refs for handle access to latest state
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Register custom node types (memoized to prevent recreation)
  const nodeTypes = useMemo(() => ({ oscilla: OscillaNode }), []);

  // Setup sync handle (includes LayoutStore and getNodes)
  const syncHandle: SyncHandle = useMemo(() => ({
    patchStore,
    layoutStore,
    setNodes,
    setEdges,
    getNodes: () => nodesRef.current,
  }), [patchStore, layoutStore, setNodes, setEdges]);

  // Create event handlers that sync to PatchStore
  const handleNodesChange = useCallback(
    createNodesChangeHandler(syncHandle),
    [syncHandle.patchStore, syncHandle.layoutStore]
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
      selection.selectBlock(node.id as BlockId);
    },
    [selection]
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      selection.selectEdge(edge.id);
    },
    [selection]
  );

  const handlePaneClick = useCallback(() => {
    selection.clearSelection();
    setContextMenu(null); // Close context menu when clicking pane
  }, [selection]);

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

  // Edge hover handlers (Sprint 1: Debug Probe) - now using DebugStore
  const handleEdgeMouseEnter = useCallback<EdgeMouseHandler>(
    (_event, edge) => {
      debug.setHoveredEdge(edge.id);
    },
    [debug]
  );

  const handleEdgeMouseLeave = useCallback<EdgeMouseHandler>(
    () => {
      debug.setHoveredEdge(null);
    },
    [debug]
  );

  // Expose port context menu handler via global store for OscillaNode access
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
        selection.selectBlock(blockId);
        setCenter(node.position.x + 90, node.position.y + 50, {
          zoom: 1.2,
          duration: 300,
        });
      }
    },
    [setCenter, selection]
  );

  // Connection validation - prevent incompatible type connections
  const isValidConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return false;

    const result = validateConnection(
      connection.source,
      connection.sourceHandle || '',
      connection.target,
      connection.targetHandle || '',
      patchStore.patch
    );
    return result.valid;
  }, [patchStore]);

  // Auto-arrange handler (explicit user action only)
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

      // Persist computed positions to LayoutStore
      for (const node of layoutedNodes) {
        layoutStore.setPosition(node.id as BlockId, node.position);
      }

      // Fit view after layout completes
      setTimeout(() => fitView({ padding: 0.1 }), 50);
    } catch (error) {
      diagnostics.log({
        level: 'error',
        message: `Auto-arrange failed: ${error instanceof Error ? error.message : String(error)}`,
        data: { error },
      });
    } finally {
      setIsLayouting(false);
    }
  }, [isLayouting, setNodes, fitView, diagnostics, layoutStore]);

  // Store autoArrange ref for handle access
  const autoArrangeRef = useRef(handleAutoArrange);
  autoArrangeRef.current = handleAutoArrange;

  // Initialize: compute ELK layout BEFORE first render (no flash)
  useEffect(() => {
    let cancelled = false;

    async function initializeLayout() {
      const patch = patchStore.patch;

      // Empty patch: nothing to layout
      if (patch.blocks.size === 0) {
        setIsInitialized(true);
        return;
      }

      // Build nodes/edges with placeholder positions
      const { nodes: initialNodes, edges: initialEdges } = buildNodesAndEdges(patch, diagnostics);

      // Single node: just center it
      if (initialNodes.length === 1) {
        initialNodes[0].position = { x: 100, y: 100 };
        layoutStore.setPosition(initialNodes[0].id as BlockId, initialNodes[0].position);
        if (!cancelled) {
          setNodes(initialNodes);
          setEdges(initialEdges);
          setIsInitialized(true);
          setTimeout(() => fitView({ padding: 0.1 }), 50);
        }
        return;
      }

      // Compute ELK layout (async)
      try {
        const { nodes: layoutedNodes } = await getLayoutedElements(initialNodes, initialEdges);

        if (cancelled) return;

        // Persist positions to LayoutStore
        for (const node of layoutedNodes) {
          layoutStore.setPosition(node.id as BlockId, node.position);
        }

        // Set state - first render will show correct positions
        setNodes(layoutedNodes);
        setEdges(initialEdges);
        setIsInitialized(true);

        // Fit view after initial render
        setTimeout(() => fitView({ padding: 0.1 }), 50);
      } catch (error) {
        if (cancelled) return;

        // Fallback: use grid layout if ELK fails
        diagnostics.log({
          level: 'error',
          message: `Initial layout failed, using grid fallback: ${error instanceof Error ? error.message : String(error)}`,
          data: { error },
        });

        let x = 100, y = 100;
        for (const node of initialNodes) {
          node.position = { x, y };
          layoutStore.setPosition(node.id as BlockId, { x, y });
          x += 250;
          if (x > 1000) { x = 100; y += 150; }
        }

        setNodes(initialNodes);
        setEdges(initialEdges);
        setIsInitialized(true);
      }
    }

    initializeLayout();

    return () => { cancelled = true; };
  }, [patchStore, diagnostics, layoutStore, setNodes, setEdges, fitView]);

  // Setup structure reaction AFTER initialization
  useEffect(() => {
    if (!isInitialized) return;

    const disposeReaction = setupStructureReaction(syncHandle, diagnostics);

    // Create handle for EditorContext
    const handle: ReactFlowEditorHandle = {
      async addBlock(blockId: BlockId, blockType: string): Promise<void> {
        addBlockToReactFlow(blockId, blockType, nodesRef.current, layoutStore, setNodes, diagnostics);
      },

      async removeBlock(blockId: BlockId): Promise<void> {
        setNodes((nodes) => nodes.filter((node) => node.id !== blockId));
        layoutStore.removePosition(blockId);
      },

      async zoomToFit(): Promise<void> {
        fitView({ padding: 0.1 });
      },

      async autoArrange(): Promise<void> {
        await autoArrangeRef.current();
      },
    };

    // Create adapter and notify parent
    const adapter = createReactFlowEditorAdapter(handle);
    onEditorReady?.(adapter);

    return () => {
      disposeReaction();
    };
  }, [isInitialized, onEditorReady, fitView, patchStore, diagnostics, layoutStore, syncHandle, setNodes]);

  // Handle delete key
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Get selected nodes
        const selectedNodes = nodes.filter((node) => node.selected);
        for (const node of selectedNodes) {
          patchStore.removeBlock(node.id as BlockId);
        }

        // Get selected edges
        const selectedEdges = edges.filter((edge) => edge.selected);
        for (const edge of selectedEdges) {
          patchStore.removeEdge(edge.id);
        }
      }
    },
    [nodes, edges, patchStore]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Force wrapper dimensions for Dockview compatibility
  React.useLayoutEffect(() => {
    if (!wrapperRef.current) return;
    const wrapper = wrapperRef.current;

    const updateDimensions = () => {
      const rect = wrapper.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {
        const parent = wrapper.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          wrapper.style.width = parentRect.width > 0 ? '100%' : '100vw';
          wrapper.style.height = parentRect.height > 0 ? '100%' : '100vh';
        }
      }
    };

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
    if (!debug.hoveredEdgeId) return null;

    const edge = edges.find((e) => e.id === debug.hoveredEdgeId);
    if (!edge) return null;

    return `${edge.source}:${edge.sourceHandle} → ${edge.target}:${edge.targetHandle}`;
  }, [debug.hoveredEdgeId, edges]);

  // Loading state: don't render ReactFlow until layout is computed
  if (!isInitialized) {
    return (
      <div className="react-flow-loading" style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        fontSize: '0.875rem',
      }}>
        Computing layout...
      </div>
    );
  }

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
        <MiniMap
          nodeColor={(node) => {
            const type = node.data?.blockType || '';
            if (type.includes('Render')) return '#4ecdc4';
            if (type.includes('Field')) return '#a18cd1';
            if (type.includes('Sin') || type.includes('Cos')) return '#ff6b6b';
            return '#0f3460';
          }}
          maskColor="rgba(10, 20, 40, 0.85)"
          style={{
            backgroundColor: 'rgba(13, 27, 42, 0.9)',
            borderRadius: '8px',
            border: '1px solid rgba(78, 205, 196, 0.2)',
          }}
          zoomable
          pannable
        />
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
            onClick={() => debug.toggleEnabled()}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              borderColor: debug.enabled ? '#4ecdc4' : '#0f3460',
              color: debug.enabled ? '#4ecdc4' : '#666',
              background: debug.enabled ? 'rgba(78, 205, 196, 0.1)' : 'transparent',
              '&:hover': {
                borderColor: '#4ecdc4',
                background: 'rgba(78, 205, 196, 0.1)',
              },
            }}
          >
            {debug.enabled ? 'Debug: ON' : 'Debug: OFF'}
          </Button>
        </Panel>
      </ReactFlow>

      {/* Debug Panel (Sprint 1: Debug Probe) */}
      <SimpleDebugPanel
        edgeValue={debug.edgeValue}
        edgeLabel={edgeLabel}
        enabled={debug.enabled}
        status={debug.status}
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
});

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
