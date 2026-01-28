/**
 * GraphEditorCore - Reusable ReactFlow-based graph editor component
 *
 * Works with any GraphDataAdapter to provide a unified editing experience.
 * Replaces both ReactFlowEditor (main editor) and CompositeInternalGraph (composite editor).
 *
 * Key responsibilities:
 * - ReactFlow canvas rendering (Background, Controls, MiniMap)
 * - Adapter-to-ReactFlow synchronization (MobX reactions)
 * - Event handling (node drag, edge create/remove, context menus)
 * - Auto-arrange layout (ELK algorithm)
 *
 * ARCHITECTURAL: Adapter is passed via PROPS (explicit), provided via Context for children.
 * This hybrid approach avoids prop drilling while keeping top-level testable.
 */

import React, { useEffect, useCallback, useMemo, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { observer } from 'mobx-react-lite';
import { reaction } from 'mobx';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
import type { GraphDataAdapter } from './types';
import { GraphEditorProvider, type GraphEditorContextValue } from './GraphEditorContext';
import { reconcileNodesFromAdapter } from './nodeDataTransform';
import { UnifiedNode as UnifiedNodeComponent } from './UnifiedNode';
import { getLayoutedElements } from '../reactFlowEditor/layout';
import { validateConnection } from '../reactFlowEditor/typeValidation';
import type { SelectionStore } from '../../stores/SelectionStore';
import type { PortHighlightStore } from '../../stores/PortHighlightStore';
import type { DiagnosticsStore } from '../../stores/DiagnosticsStore';
import type { DebugStore } from '../../stores/DebugStore';
import type { Patch } from '../../graph/Patch';
import './GraphEditorCore.css';

/**
 * Feature flags for optional capabilities.
 * Composite editor disables param editing, main editor enables all.
 */
export interface GraphEditorFeatures {
  /** Enable inline parameter editing in nodes */
  enableParamEditing?: boolean;
  /** Enable debug mode (edge labels, diagnostics) */
  enableDebugMode?: boolean;
  /** Enable context menus (block/edge/port) */
  enableContextMenus?: boolean;
  /** Enable auto-arrange button */
  enableAutoArrange?: boolean;
  /** Enable minimap */
  enableMinimap?: boolean;
}

const DEFAULT_FEATURES: Required<GraphEditorFeatures> = {
  enableParamEditing: false,
  enableDebugMode: false,
  enableContextMenus: true,
  enableAutoArrange: true,
  enableMinimap: true,
};

/**
 * Props for GraphEditorCore.
 * Adapter is required, stores and features are optional.
 */
export interface GraphEditorCoreProps {
  /** Data adapter (source of truth for graph data) */
  adapter: GraphDataAdapter;

  /** Feature flags */
  features?: GraphEditorFeatures;

  /** Optional store references (for selection, debug, etc.) */
  selection?: SelectionStore | null;
  portHighlight?: PortHighlightStore | null;
  diagnostics?: DiagnosticsStore | null;
  debug?: DebugStore | null;

  /** Optional patch (for connection validation - needed by validateConnection) */
  patch?: Patch | null;

  /** Custom node types map (default: { unified: UnifiedNode }) */
  nodeTypes?: Record<string, React.ComponentType<any>>;

  /** Callback when editor is ready (for external imperative API) */
  onEditorReady?: (handle: GraphEditorCoreHandle) => void;

  /** Context menu event handlers (optional) */
  onNodeContextMenu?: NodeMouseHandler;
  onEdgeContextMenu?: EdgeMouseHandler;

  /** Edge hover event handlers (optional - for debug mode) */
  onEdgeMouseEnter?: EdgeMouseHandler;
  onEdgeMouseLeave?: EdgeMouseHandler;
}

/**
 * Imperative handle for GraphEditorCore.
 * Exposes methods for external control (add block, auto-arrange, zoom).
 */
export interface GraphEditorCoreHandle {
  autoArrange(): Promise<void>;
  zoomToFit(): Promise<void>;
}

/**
 * GraphEditorCore component.
 * Must be wrapped in ReactFlowProvider by parent.
 */
export const GraphEditorCoreInner = observer(
  forwardRef<GraphEditorCoreHandle, GraphEditorCoreProps>(
    (
      {
        adapter,
        features = {},
        selection = null,
        portHighlight = null,
        diagnostics = null,
        debug = null,
        patch = null,
        nodeTypes: customNodeTypes,
        onEditorReady,
        onNodeContextMenu,
        onEdgeContextMenu,
        onEdgeMouseEnter,
        onEdgeMouseLeave,
      },
      ref
    ) => {
      // Merge features with defaults
      const mergedFeatures = useMemo(() => ({ ...DEFAULT_FEATURES, ...features }), [features]);

      // ReactFlow state with explicit types
      const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
      const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
      const [isLayouting, setIsLayouting] = useState(false);
      const { fitView } = useReactFlow();

      // Refs for stable access to latest state
      const nodesRef = useRef(nodes);
      const edgesRef = useRef(edges);
      nodesRef.current = nodes;
      edgesRef.current = edges;

      // Node types - default to unified node
      const nodeTypes = useMemo(() => {
        if (customNodeTypes) return customNodeTypes;
        return { unified: UnifiedNodeComponent };
      }, [customNodeTypes]);

      // Context value for child components
      const contextValue: GraphEditorContextValue = useMemo(
        () => ({
          adapter,
          enableParamEditing: mergedFeatures.enableParamEditing,
          enableDebugMode: mergedFeatures.enableDebugMode,
          enableContextMenus: mergedFeatures.enableContextMenus,
          selection,
          portHighlight,
          diagnostics,
          debug,
        }),
        [adapter, mergedFeatures, selection, portHighlight, diagnostics, debug]
      );

      // -------------------------------------------------------------------------
      // Event Handlers - Adapter Integration
      // -------------------------------------------------------------------------

      /**
       * Handle ReactFlow node changes (drag, remove).
       * Persists position changes to adapter.
       */
      const handleNodesChange = useCallback(
        (changes: any[]) => {
          // Apply changes to local state first
          onNodesChange(changes);

          // Persist position changes to adapter
          for (const change of changes) {
            if (change.type === 'position' && change.position && change.dragging === false) {
              // Drag ended - persist to adapter
              adapter.setBlockPosition(change.id, change.position);
            } else if (change.type === 'remove') {
              // Node removed - persist to adapter
              adapter.removeBlock(change.id);
            }
          }
        },
        [onNodesChange, adapter]
      );

      /**
       * Handle ReactFlow edge changes (remove).
       * Persists to adapter.
       */
      const handleEdgesChange = useCallback(
        (changes: any[]) => {
          // Apply changes to local state first
          onEdgesChange(changes);

          // Persist edge removals to adapter
          for (const change of changes) {
            if (change.type === 'remove') {
              adapter.removeEdge(change.id);
            }
          }
        },
        [onEdgesChange, adapter]
      );

      /**
       * Handle new edge connections.
       * Validates and persists to adapter.
       */
      const handleConnect = useCallback(
        (connection: Connection) => {
          if (!connection.source || !connection.target) return;
          if (!connection.sourceHandle || !connection.targetHandle) return;

          // Add edge via adapter
          adapter.addEdge(
            connection.source,
            connection.sourceHandle,
            connection.target,
            connection.targetHandle
          );
        },
        [adapter]
      );

      /**
       * Validate connection before allowing it.
       * Uses patch + registry for type checking.
       */
      const isValidConnection = useCallback(
        (connection: Connection) => {
          if (!connection.source || !connection.target) return false;
          if (!patch) return true; // No patch - skip validation

          const result = validateConnection(
            connection.source,
            connection.sourceHandle || '',
            connection.target,
            connection.targetHandle || '',
            patch
          );
          return result.valid;
        },
        [patch]
      );

      // -------------------------------------------------------------------------
      // Selection Handlers
      // -------------------------------------------------------------------------

      const handleNodeClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
          if (selection) {
            // Cast to any to handle both BlockId and InternalBlockId
            selection.selectBlock(node.id as any);
          }
        },
        [selection]
      );

      const handleEdgeClick = useCallback(
        (_event: React.MouseEvent, edge: Edge) => {
          if (selection) {
            selection.selectEdge(edge.id);
          }
        },
        [selection]
      );

      const handlePaneClick = useCallback(() => {
        if (selection) {
          selection.clearSelection();
        }
      }, [selection]);

      // -------------------------------------------------------------------------
      // Auto-Arrange (ELK Layout)
      // -------------------------------------------------------------------------

      const handleAutoArrange = useCallback(async () => {
        if (isLayouting) return;
        if (nodesRef.current.length === 0) return;

        setIsLayouting(true);

        try {
          // Single node - just zoom to it
          if (nodesRef.current.length === 1) {
            setTimeout(() => fitView({ padding: 0.1 }), 50);
            return;
          }

          // Multiple nodes - run ELK layout
          const { nodes: layoutedNodes } = await getLayoutedElements(
            nodesRef.current,
            edgesRef.current
          );
          setNodes(layoutedNodes);

          // Persist positions to adapter
          for (const node of layoutedNodes) {
            adapter.setBlockPosition(node.id, node.position);
          }

          setTimeout(() => fitView({ padding: 0.1 }), 50);
        } catch (error) {
          if (diagnostics) {
            diagnostics.log({
              level: 'error',
              message: `Auto-arrange failed: ${error instanceof Error ? error.message : String(error)}`,
              data: { error },
            });
          } else {
            console.error('Auto-arrange failed:', error);
          }
        } finally {
          setIsLayouting(false);
        }
      }, [isLayouting, setNodes, fitView, adapter, diagnostics]);

      // -------------------------------------------------------------------------
      // Imperative Handle
      // -------------------------------------------------------------------------

      useImperativeHandle(ref, () => ({
        autoArrange: handleAutoArrange,
        zoomToFit: async () => {
          fitView({ padding: 0.1 });
        },
      }));

      useEffect(() => {
        if (onEditorReady && ref && typeof ref !== 'function') {
          onEditorReady(ref.current!);
        }
      }, [onEditorReady, ref]);

      // -------------------------------------------------------------------------
      // MobX Reaction - Sync Adapter Changes to ReactFlow
      // -------------------------------------------------------------------------

      useEffect(() => {
        const disposer = reaction(
          () => ({
            blockCount: adapter.blocks.size,
            edgeCount: adapter.edges.length,
            // Track structural changes
            blockIds: Array.from(adapter.blocks.keys()).join(','),
            edgeIds: adapter.edges.map((e) => e.id).join(','),
          }),
          () => {
            // Adapter changed - reconcile nodes/edges
            const { nodes: reconciledNodes, edges: reconciledEdges } = reconcileNodesFromAdapter(
              adapter,
              nodesRef.current,
              (blockId) => adapter.getBlockPosition(blockId)
            );

            setNodes(reconciledNodes);
            setEdges(reconciledEdges);
          },
          {
            fireImmediately: true, // Run immediately to populate initial nodes/edges
          }
        );

        return disposer;
      }, [adapter, setNodes, setEdges]);

      // -------------------------------------------------------------------------
      // Render
      // -------------------------------------------------------------------------

      return (
        <GraphEditorProvider value={contextValue}>
          <div className="graph-editor-core" style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onPaneClick={handlePaneClick}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              maxZoom={4}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              snapToGrid={false}
              deleteKeyCode="Delete"
            >
              <Background color="#4ecdc4" gap={16} />
              <Controls />
              {mergedFeatures.enableMinimap && <MiniMap />}
            </ReactFlow>
          </div>
        </GraphEditorProvider>
      );
    }
  )
);

GraphEditorCoreInner.displayName = 'GraphEditorCoreInner';

/**
 * GraphEditorCore with ReactFlowProvider wrapper.
 * This is the main export.
 */
export const GraphEditorCore = forwardRef<GraphEditorCoreHandle, GraphEditorCoreProps>(
  (props, ref) => {
    const { ReactFlowProvider } = require('reactflow');
    return (
      <ReactFlowProvider>
        <GraphEditorCoreInner {...props} ref={ref} />
      </ReactFlowProvider>
    );
  }
);

GraphEditorCore.displayName = 'GraphEditorCore';
