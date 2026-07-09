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
import { reaction, runInAction } from 'mobx';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeTypes,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { GraphDataAdapter, BlockLike, EdgeLike } from './types';
import {
  GraphEditorProvider,
  type GraphEditorContextValue,
  type PortContextMenuHandler,
} from './GraphEditorContext';
import { reconcileNodesFromAdapter, type UnifiedNodeData } from './nodeDataTransform';
import { copyBlocks, pasteClipboard } from './graph-clipboard';
import type { ClipboardStore } from '../../stores/ClipboardStore';
import { UnifiedNode as UnifiedNodeComponent } from './UnifiedNode';
import { OscillaEdge } from '../reactFlowEditor/OscillaEdge';
import type { OscillaEdgeData } from '../reactFlowEditor/nodes';
import { getLayoutedElements } from '../reactFlowEditor/layout';
import type { TypeOracle } from './type-oracle';
import { verdictPermits } from './type-oracle';
import type { EdgeDecorator } from './edge-decorations';
// import { ErrorBadgeOverlay } from './ErrorBadgeOverlay'; // DISABLED: Errors now shown in port popovers
import type { SelectionStore } from '../../stores/SelectionStore';
import type { PortHighlightStore } from '../../stores/PortHighlightStore';
import type { DiagnosticsStore } from '../../stores/DiagnosticsStore';
import type { DebugStore } from '../../stores/DebugStore';
import { blockId } from '../../types';
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
  /**
   * The editor's shared clipboard buffer. When provided, copy/paste keys operate
   * on it; where a mount omits it (e.g. the composite editor) copy/paste is inert
   * while duplicate — which needs no buffer — still works. [LAW:composability]
   */
  clipboard?: ClipboardStore | null;
  portHighlight?: PortHighlightStore | null;
  diagnostics?: DiagnosticsStore | null;
  debug?: DebugStore | null;

  /**
   * The era's type authority for wiring legality. Every mount supplies one — a V1
   * oracle, a scene oracle, or the explicit permissive oracle — so the drag gate
   * always asks the oracle and never falls back to "permit everything" implicitly.
   */
  oracle: TypeOracle;

  /**
   * The era's authority on an edge's transform chain (V1 lenses / pillar transform
   * blocks). Every mount supplies one — a V1 decorator, a scene decorator, or the
   * explicit empty decorator — so the edge renderer reads decorations through the
   * seam and never past it into a store. [LAW:one-source-of-truth]
   */
  decorator: EdgeDecorator;

  /** Custom node types map (default: { unified: UnifiedNode }) */
  nodeTypes?: NodeTypes;

  /** Callback when editor is ready (for external imperative API) */
  onEditorReady?: (handle: GraphEditorCoreHandle) => void;

  /** Context menu event handlers (optional) */
  onNodeContextMenu?: NodeMouseHandler;
  onEdgeContextMenu?: EdgeMouseHandler;
  onEdgeClick?: EdgeMouseHandler;
  onPortContextMenu?: PortContextMenuHandler;

  /** Edge hover event handlers (optional - for debug mode) */
  onEdgeMouseEnter?: EdgeMouseHandler;
  onEdgeMouseLeave?: EdgeMouseHandler;

  /** Pane click handler (optional - for closing context menus) */
  onPaneClick?: (event: React.MouseEvent) => void;

  /** Children rendered inside ReactFlow (for Panel components, etc.) */
  children?: React.ReactNode;
}

/**
 * Imperative handle for GraphEditorCore.
 * Exposes methods for external control (add block, auto-arrange, zoom).
 */
export interface GraphEditorCoreHandle {
  autoArrange(): Promise<void>;
  zoomToFit(): Promise<void>;
  screenToFlowPosition(position: { x: number; y: number }): { x: number; y: number };
}

/** Offset a `duplicate` places its copies from the originals (graph units). */
const DUPLICATE_OFFSET = 32;

/**
 * True while focus is in a text field, so editor shortcuts (mod+C/V/D/A) cede to
 * the browser's own text editing there and never hijack a param edit.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function stableParamsSignature(params: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(',');
}

function blockSignature(block: BlockLike): string {
  const inputSig = Array.from(block.inputPorts.values())
    .map((port) => `${port.id}:${port.typeDisplay?.compatibilityToken ?? ''}:${port.decorations?.length ?? 0}:${port.controls?.length ?? 0}`)
    .join(';');
  const outputSig = Array.from(block.outputPorts.values())
    .map((port) => `${port.id}:${port.typeDisplay?.compatibilityToken ?? ''}`)
    .join(';');

  return [
    block.id,
    block.type,
    block.displayName,
    stableParamsSignature(block.params),
    inputSig,
    outputSig,
  ].join('|');
}

function edgeSignature(edge: EdgeLike): string {
  return [
    edge.id,
    edge.sourceBlockId,
    edge.sourcePortId,
    edge.targetBlockId,
    edge.targetPortId,
  ].join(':');
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
        clipboard = null,
        portHighlight = null,
        diagnostics = null,
        debug = null,
        oracle,
        decorator,
        nodeTypes: customNodeTypes,
        onEditorReady,
        onNodeContextMenu,
        onEdgeContextMenu,
        onEdgeClick,
        onPortContextMenu,
        onEdgeMouseEnter,
        onEdgeMouseLeave,
        onPaneClick,
        children,
      },
      ref
    ) => {
      // Merge features with defaults
      const mergedFeatures = useMemo(() => ({ ...DEFAULT_FEATURES, ...features }), [features]);

      // ReactFlow state with explicit types
      const [nodes, setNodes, onNodesChange] = useNodesState<UnifiedNodeData>([]);
      const [edges, setEdges, onEdgesChange] = useEdgesState<OscillaEdgeData>([]);
      const [isLayouting, setIsLayouting] = useState(false);
      const [isInitialized, setIsInitialized] = useState(false);
      const reactFlowApi = useReactFlow();
      const { fitView } = reactFlowApi;

      // Refs for stable access to latest state
      const nodesRef = useRef(nodes);
      const edgesRef = useRef(edges);
      const warnedInvalidEdgeIdsRef = useRef<Set<string>>(new Set());
      const fitViewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      nodesRef.current = nodes;
      edgesRef.current = edges;

      const scheduleFitView = useCallback(() => {
        if (fitViewTimeoutRef.current) {
          clearTimeout(fitViewTimeoutRef.current);
        }
        fitViewTimeoutRef.current = setTimeout(() => {
          fitViewTimeoutRef.current = null;
          fitView({ padding: 0.1 });
        }, 50);
      }, [fitView]);

      const reportUiError = useCallback((message: string, error: unknown, level: 'warn' | 'error' = 'error') => {
        // [LAW:single-enforcer] GraphEditorCore routes UI operation failures through diagnostics boundary.
        diagnostics?.log({
          level,
          message,
          data: { error },
        });
      }, [diagnostics]);

      const diagnosticsGetter = useCallback(
        (edge: EdgeLike) => {
          if (!diagnostics) return [];
          return diagnostics.getDiagnosticsForEdge({
            from: { blockId: edge.sourceBlockId, slotId: edge.sourcePortId },
            to: { blockId: edge.targetBlockId, slotId: edge.targetPortId },
          });
        },
        [diagnostics]
      );

      const projectGraphSnapshot = useCallback(
        (current: Node[]) => {
          const projected = reconcileNodesFromAdapter(
            adapter,
            current,
            (blockId) => adapter.getBlockPosition(blockId),
            diagnosticsGetter,
          );

          // [LAW:no-shared-mutable-globals] Prune warning cache to current edge IDs
          // so long-running sessions cannot accumulate stale warning keys.
          const liveEdgeIds = new Set(adapter.edges.map((edge) => edge.id));
          for (const warnedId of warnedInvalidEdgeIdsRef.current) {
            if (!liveEdgeIds.has(warnedId)) {
              warnedInvalidEdgeIdsRef.current.delete(warnedId);
            }
          }

          if (diagnostics && projected.droppedInvalidEdgeIds.length > 0) {
            for (const edgeId of projected.droppedInvalidEdgeIds) {
              if (warnedInvalidEdgeIdsRef.current.has(edgeId)) continue;
              warnedInvalidEdgeIdsRef.current.add(edgeId);
              diagnostics.log({
                level: 'warn',
                message: `Dropped invalid edge '${edgeId}' from graph projection (missing source/target handle).`,
              });
            }
          }

          return projected;
        },
        [adapter, diagnostics, diagnosticsGetter]
      );

      // Node types - default to unified node
      const nodeTypes = useMemo(() => {
        if (customNodeTypes) return customNodeTypes;
        return { unified: UnifiedNodeComponent };
      }, [customNodeTypes]);

      // Edge types - use custom OscillaEdge for lens visualization
      const edgeTypes = useMemo(() => ({
        oscilla: OscillaEdge,
      }), []);

      // Context value for child components
      const contextValue: GraphEditorContextValue = useMemo(
        () => ({
          adapter,
          decorator,
          enableParamEditing: mergedFeatures.enableParamEditing,
          enableDebugMode: mergedFeatures.enableDebugMode,
          enableContextMenus: mergedFeatures.enableContextMenus,
          // [LAW:no-shared-mutable-globals] Port context menu dispatch is
          // owned by editor context instead of window-level mutable globals.
          onPortContextMenu,
          selection,
          portHighlight,
          diagnostics,
          debug,
        }),
        [adapter, decorator, mergedFeatures, onPortContextMenu, selection, portHighlight, diagnostics, debug]
      );

      // -------------------------------------------------------------------------
      // Event Handlers - Adapter Integration
      // -------------------------------------------------------------------------

      /**
       * Handle ReactFlow node changes (drag, remove).
       * Persists position changes to adapter.
       */
      const handleNodesChange = useCallback(
        (changes: NodeChange[]) => {
          // Apply changes to local state first
          onNodesChange(changes);

          // Persist structural changes to the adapter as ONE mobx action, so a
          // multi-node delete (or multi-node drag-end) lands as a single authored
          // edit — hence one undo checkpoint, not one per node. [LAW:no-mode-explosion]
          runInAction(() => {
            for (const change of changes) {
              if (change.type === 'position' && change.position && change.dragging === false) {
                // Drag ended - persist to adapter
                adapter.setBlockPosition(change.id, change.position);
              } else if (change.type === 'remove') {
                // Node removed - persist to adapter (edge cleanup is the store's job)
                adapter.removeBlock(change.id);
              }
            }
          });
        },
        [onNodesChange, adapter]
      );

      /**
       * Handle ReactFlow edge changes (remove).
       * Persists to adapter.
       */
      const handleEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
          // Apply changes to local state first
          onEdgesChange(changes);

          // One action for the whole batch — a multi-edge delete is one checkpoint.
          runInAction(() => {
            for (const change of changes) {
              if (change.type === 'remove') {
                adapter.removeEdge(change.id);
              }
            }
          });
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
       * Validate a connection before allowing it. The oracle is the single
       * authority; both eras supply one, so a wire is judged by exactly what that
       * era's compiler accepts — no "no patch → permit everything" escape hatch.
       * [LAW:one-source-of-truth] [LAW:dataflow-not-control-flow]
       */
      const isValidConnection = useCallback(
        (connection: Connection) => {
          if (!connection.source || !connection.target) return false;
          if (!connection.sourceHandle || !connection.targetHandle) return false;
          return verdictPermits(
            oracle.canConnect(
              { blockId: connection.source, portId: connection.sourceHandle },
              { blockId: connection.target, portId: connection.targetHandle },
            ),
          );
        },
        [oracle]
      );

      // -------------------------------------------------------------------------
      // Selection Handlers
      // -------------------------------------------------------------------------

      const handleNodeClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
          if (selection) {
            selection.selectBlock(blockId(node.id));
          }
        },
        [selection]
      );

      const handleEdgeClick = useCallback<EdgeMouseHandler>(
        (event, edge) => {
          if (selection) {
            selection.selectEdge(edge.id);
          }
          if (onEdgeClick) {
            onEdgeClick(event, edge);
          }
        },
        [selection, onEdgeClick]
      );

      const handlePaneClick = useCallback((event: React.MouseEvent) => {
        if (selection) {
          selection.clearSelection();
        }
        // Call custom handler if provided
        if (onPaneClick) {
          onPaneClick(event);
        }
      }, [selection, onPaneClick]);

      // -----------------------------------------------------------------------
      // Core editing: multi-select, clipboard, duplicate (era-neutral)
      //
      // These act through the neutral adapter seam, so BOTH eras get them from
      // this one core. ReactFlow owns the interactive selection set (marquee /
      // shift-click); these handlers read `node.selected` from it and, after a
      // paste, write the new selection back. [LAW:one-source-of-truth]
      // -----------------------------------------------------------------------

      const selectedNodeIds = useCallback(
        () => nodesRef.current.filter((node) => node.selected).map((node) => node.id),
        [],
      );

      /** Make exactly `ids` the selection, and follow the first as the inspector's primary. */
      const selectNodes = useCallback(
        (ids: readonly string[]) => {
          const idSet = new Set(ids);
          setNodes((current) => current.map((node) => ({ ...node, selected: idSet.has(node.id) })));
          selection?.selectBlock(ids.length > 0 ? blockId(ids[0]) : null);
        },
        [setNodes, selection],
      );

      const handleCopy = useCallback(() => {
        if (!clipboard) return;
        const clip = copyBlocks(adapter, selectedNodeIds());
        if (clip) clipboard.copy(clip);
      }, [clipboard, adapter, selectedNodeIds]);

      const handlePaste = useCallback(() => {
        if (!clipboard?.content) return;
        const newIds = pasteClipboard(adapter, clipboard.content, clipboard.nextPasteOffset());
        selectNodes(newIds);
      }, [clipboard, adapter, selectNodes]);

      const handleDuplicate = useCallback(() => {
        // Duplicate is copy-then-paste at a fixed offset — no clipboard involved,
        // so it works even where no clipboard store is wired. [LAW:composability]
        const clip = copyBlocks(adapter, selectedNodeIds());
        if (!clip) return;
        const newIds = pasteClipboard(adapter, clip, { dx: DUPLICATE_OFFSET, dy: DUPLICATE_OFFSET });
        selectNodes(newIds);
      }, [adapter, selectedNodeIds, selectNodes]);

      const handleSelectAll = useCallback(() => {
        setNodes((current) => current.map((node) => ({ ...node, selected: true })));
      }, [setNodes]);

      const handleDeselectAll = useCallback(() => {
        setNodes((current) => current.map((node) => ({ ...node, selected: false })));
        selection?.clearSelection();
      }, [setNodes, selection]);

      const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
          // A text field owns its own copy/paste/select-all; never hijack it.
          if (isEditableTarget(event.target)) return;
          const mod = event.metaKey || event.ctrlKey;
          const key = event.key.toLowerCase();

          if (mod && key === 'c') { event.preventDefault(); handleCopy(); }
          else if (mod && key === 'v') { event.preventDefault(); handlePaste(); }
          else if (mod && key === 'd') { event.preventDefault(); handleDuplicate(); }
          else if (mod && key === 'a') { event.preventDefault(); handleSelectAll(); }
          else if (key === 'escape') { handleDeselectAll(); }
        },
        [handleCopy, handlePaste, handleDuplicate, handleSelectAll, handleDeselectAll],
      );

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
            // fitView will be called by the dedicated effect after render
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

          // fitView will be called by the dedicated effect after render
        } catch (error) {
          reportUiError(`Auto-arrange failed: ${error instanceof Error ? error.message : String(error)}`, error, 'error');
        } finally {
          setIsLayouting(false);
        }
      }, [isLayouting, setNodes, fitView, adapter, reportUiError]);

      // -------------------------------------------------------------------------
      // Imperative Handle
      // -------------------------------------------------------------------------

      useImperativeHandle(ref, () => ({
        autoArrange: handleAutoArrange,
        zoomToFit: async () => {
          fitView({ padding: 0.1 });
        },
        screenToFlowPosition: (position) => {
          // [LAW:single-enforcer] Coordinate-space conversion belongs at the graph boundary.
          const api = reactFlowApi as unknown as {
            screenToFlowPosition?: (p: { x: number; y: number }) => { x: number; y: number };
            project?: (p: { x: number; y: number }) => { x: number; y: number };
          };
          if (typeof api.screenToFlowPosition === 'function') {
            return api.screenToFlowPosition(position);
          }
          if (typeof api.project === 'function') {
            return api.project(position);
          }
          return position;
        },
      }));

      useEffect(() => {
        if (onEditorReady && ref && typeof ref !== 'function') {
          onEditorReady(ref.current!);
        }
      }, [onEditorReady, ref]);

      // -------------------------------------------------------------------------
      // Initial Layout - Compute ELK layout BEFORE first render (no flash)
      // -------------------------------------------------------------------------

      const layoutDoneRef = useRef(false);

      useEffect(() => {
        let cancelled = false;

        async function initializeLayout() {
          // Already done
          if (layoutDoneRef.current) return;

          // Empty: wait for blocks to load (don't initialize yet)
          if (adapter.blocks.size === 0) {
            return;
          }

          // Build nodes/edges
          const { nodes: initialNodes, edges: initialEdges } = projectGraphSnapshot([]);

          // Single node: just center it
          if (initialNodes.length === 1) {
            initialNodes[0].position = { x: 100, y: 100 };
            adapter.setBlockPosition(initialNodes[0].id, initialNodes[0].position);
            if (!cancelled) {
              layoutDoneRef.current = true;
              setNodes(initialNodes);
              setEdges(initialEdges);
              setIsInitialized(true);
              scheduleFitView();
            }
            return;
          }

          // Compute ELK layout (async)
          try {
            const { nodes: layoutedNodes } = await getLayoutedElements(initialNodes, initialEdges);

            if (cancelled) return;

            // Persist positions to adapter
            for (const node of layoutedNodes) {
              adapter.setBlockPosition(node.id, node.position);
            }

            // Set state - first render will show correct positions
            layoutDoneRef.current = true;
            setNodes(layoutedNodes);
            setEdges(initialEdges);
            setIsInitialized(true);
            scheduleFitView();
          } catch (error) {
            const message = `Initial layout failed, using grid fallback: ${
              error instanceof Error ? error.message : String(error)
            }`;
            reportUiError(message, error, 'warn');

            // Grid fallback
            let x = 100, y = 100;
            for (const node of initialNodes) {
              node.position = { x, y };
              adapter.setBlockPosition(node.id, { x, y });
              x += 250;
              if (x > 1000) { x = 100; y += 150; }
            }

            if (!cancelled) {
              layoutDoneRef.current = true;
              setNodes(initialNodes);
              setEdges(initialEdges);
              setIsInitialized(true);
            }
          }
        }

        initializeLayout();

        return () => {
          cancelled = true;
          if (fitViewTimeoutRef.current) {
            clearTimeout(fitViewTimeoutRef.current);
            fitViewTimeoutRef.current = null;
          }
        };
      }, [adapter, adapter.blocks.size, setNodes, setEdges, projectGraphSnapshot, scheduleFitView, reportUiError]);

      // -------------------------------------------------------------------------
      // MobX Reaction - Sync Adapter Changes to ReactFlow (after initialization)
      // -------------------------------------------------------------------------

      useEffect(() => {
        // Don't run reaction until initial layout is done
        if (!isInitialized) return;

        const disposer = reaction(
          () => ({
            // [LAW:one-source-of-truth] Graph sync key derives from adapter state only.
            blockSignature: Array.from(adapter.blocks.values()).map(blockSignature).join('||'),
            edgeSignature: adapter.edges.map(edgeSignature).join('||'),
            // Track data-only changes (port types, default sources from frontend snapshot)
            dataVersion: adapter.dataVersion ?? 0,
          }),
          () => {
            // Adapter changed - reconcile nodes/edges
            const { nodes: reconciledNodes, edges: reconciledEdges } = projectGraphSnapshot(nodesRef.current);

            setNodes(reconciledNodes);
            setEdges(reconciledEdges);
          }
        );

        return disposer;
      }, [adapter, setNodes, setEdges, isInitialized, projectGraphSnapshot]);

      // -------------------------------------------------------------------------
      // Render
      // -------------------------------------------------------------------------

      // Loading state: don't render ReactFlow until layout is computed
      if (!isInitialized) {
        return (
          <div className="graph-editor-core" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a2e',
            color: '#666',
            fontSize: '0.875rem',
          }}>
            Computing layout...
          </div>
        );
      }

      return (
        <GraphEditorProvider value={contextValue}>
          <div
            className="graph-editor-core"
            style={{ width: '100%', height: '100%', outline: 'none' }}
            // Focusable so the whole copy/paste/duplicate/select flow is reachable
            // by keyboard alone once the canvas has focus. [LAW:verifiable-goals]
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              elevateEdgesOnSelect={false}
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
              edgeTypes={edgeTypes}
              fitView
              minZoom={0.1}
              maxZoom={4}
              snapToGrid={false}
              deleteKeyCode="Delete"
            >
              <Background color="#4ecdc4" gap={16} />
              <Controls />
              {mergedFeatures.enableMinimap && <MiniMap />}

              {/* Error badge overlay - DISABLED: Errors now shown in port popovers */}
              {/* {diagnostics && <ErrorBadgeOverlay diagnostics={diagnostics} />} */}

              {children}
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
    return (
      <ReactFlowProvider>
        <GraphEditorCoreInner {...props} ref={ref} />
      </ReactFlowProvider>
    );
  }
);

GraphEditorCore.displayName = 'GraphEditorCore';
