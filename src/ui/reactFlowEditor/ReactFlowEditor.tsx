/**
 * ReactFlowEditor Component
 *
 * Alternative node editor using ReactFlow library.
 * Now a thin wrapper around GraphEditorCore with PatchStoreAdapter.
 *
 * Provides:
 * - PatchStoreAdapter for graph data
 * - Context menus (block, edge, port)
 * - Debug panel integration
 * - Auto-arrange button
 * - All editor chrome and UI
 */

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Panel, type NodeMouseHandler, type EdgeMouseHandler } from 'reactflow';
import { Button } from '@mui/material';
import { useStores } from '../../stores';
import { useSettings } from '../../settings';
import { editorSettings } from '../../settings/tokens/editor-settings';
import type { BlockId, PortId } from '../../types';
import type { EditorHandle } from '../editorCommon';
import { GraphEditorCore, type GraphEditorCoreHandle } from '../graphEditor/GraphEditorCore';
import type { PortContextMenuRequest } from '../graphEditor/GraphEditorContext';
import { PatchStoreAdapter } from '../graphEditor/PatchStoreAdapter';
import { BlockContextMenu } from './menus/BlockContextMenu';
import { EdgeContextMenu } from './menus/EdgeContextMenu';
import { PortContextMenu } from './menus/PortContextMenu';
import { EdgeInfoPopover } from './EdgeInfoPopover';
import { usePinPopoverState } from './BasePopover';
import './ReactFlowEditor.css';

export interface ReactFlowEditorHandle {
  addBlock(blockType: string, options?: { displayName?: string; position?: { x: number; y: number } }): Promise<string>;
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

function isEdgePathTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('.react-flow__edge-path, .react-flow__edge-interaction') != null;
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

    async addBlock(blockType: string, options?: { displayName?: string; position?: { x: number; y: number } }): Promise<string> {
      return handle.addBlock(blockType, options);
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
 * Inner component that wraps GraphEditorCore with ReactFlowEditor-specific UI.
 */
const ReactFlowEditorInner: React.FC<ReactFlowEditorProps> = observer(({
  onEditorReady,
}) => {
  // Get stores from context
  const {
    patch: patchStore,
    selection,
    diagnostics,
    debug,
    layout: layoutStore,
    frontend,
    portHighlight,
  } = useStores();

  // Editor settings
  const [settings] = useSettings(editorSettings);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const edgePopover = usePinPopoverState<{ edgeId: string }>({
    isSame: (a, b) => a.edgeId === b.edgeId,
  });

  // Ref to GraphEditorCore imperative handle
  const coreRef = useRef<GraphEditorCoreHandle>(null);

  // Create PatchStoreAdapter
  const adapter = useMemo(
    () => new PatchStoreAdapter(patchStore, layoutStore, frontend),
    [patchStore, layoutStore, frontend]
  );

  // Port context menu handler - called from UnifiedNode via GraphEditorContext
  const handlePortContextMenu = useCallback(
    ({ blockId, portId, isInput, position }: PortContextMenuRequest) => {
      setContextMenu({
        type: 'port',
        blockId: blockId as BlockId,
        portId: portId as PortId,
        isInput,
        position,
      });
    },
    []
  );

  // Navigate to block helper - centers and selects block
  const navigateToBlock = useCallback(
    (blockId: BlockId) => {
      selection.selectBlock(blockId);
    },
    [selection]
  );

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

  // Edge hover handlers (for debug mode)
  const handleEdgeMouseEnter = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      if (!isEdgePathTarget(event.target)) return;
      debug.setHoveredEdge(edge.id);
      edgePopover.setHover({
        data: { edgeId: edge.id },
        anchorPosition: { top: event.clientY + 12, left: event.clientX + 12 },
      });
    },
    [debug, edgePopover]
  );

  const handleEdgeMouseLeave = useCallback<EdgeMouseHandler>(
    (_event, edge) => {
      debug.setHoveredEdge(null);
      if (edgePopover.hovered?.data.edgeId === edge.id) {
        edgePopover.clearHover();
      }
    },
    [debug, edgePopover]
  );

  const handleEdgeClick = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      if (debug.consumeSuppressNextEdgePopoverPin()) {
        return;
      }
      edgePopover.togglePinned({
        data: { edgeId: edge.id },
        anchorPosition: { top: event.clientY + 12, left: event.clientX + 12 },
      });
      debug.setSelectedDebugEdge(edge.id);
    },
    [debug, edgePopover]
  );

  // Close context menu on pane click
  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
    edgePopover.clearPinned();
    debug.setSelectedDebugEdge(null);
  }, [debug, edgePopover]);

  // Drag-and-drop handlers for dropping blocks from BlockLibrary
  const handleDropOnCanvas = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const blockType = event.dataTransfer.getData('application/oscilla-block-type');
      if (!blockType) return;

      const flowPos = coreRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const bounds = event.currentTarget.getBoundingClientRect();
      const fallbackPos = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      const position = {
        x: (flowPos?.x ?? fallbackPos.x) - 75,
        y: (flowPos?.y ?? fallbackPos.y) - 30,
      };

      const blockId = adapter.addBlock(blockType, position);
      selection.selectBlock(blockId);
    },
    [adapter, selection]
  );

  const handleDragOverCanvas = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleWrapperMouseMove = useCallback((event: React.MouseEvent) => {
    if (edgePopover.mode !== 'hover') return;
    if (isEdgePathTarget(event.target)) return;
    // [LAW:single-enforcer] Edge-hover popover visibility is enforced at the editor boundary.
    edgePopover.clearHover();
    debug.setHoveredEdge(null);
  }, [edgePopover, debug]);

  // Create handle for EditorContext
  useEffect(() => {
    if (!coreRef.current) return;

    const handle: ReactFlowEditorHandle = {
      async addBlock(blockType: string, options?: { displayName?: string; position?: { x: number; y: number } }): Promise<string> {
        const pos = options?.position ?? { x: 100, y: 100 };
        const blockId = adapter.addBlock(blockType, pos);
        if (options?.displayName) {
          adapter.updateBlockDisplayName?.(blockId, options.displayName);
        }
        return blockId;
      },

      async removeBlock(blockId: BlockId): Promise<void> {
        adapter.removeBlock(blockId);
      },

      async zoomToFit(): Promise<void> {
        await coreRef.current!.zoomToFit();
      },

      async autoArrange(): Promise<void> {
        await coreRef.current!.autoArrange();
      },
    };

    // Create adapter and notify parent
    const editorAdapter = createReactFlowEditorAdapter(handle);
    onEditorReady?.(editorAdapter);
  }, [onEditorReady, adapter]);

  const edgeLabelForId = useCallback((edgeId: string | null): string | null => {
    if (!edgeId) return null;
    const edge = adapter.edges.find((e) => e.id === edgeId);
    if (!edge) return null;
    return `${edge.sourceBlockId}:${edge.sourcePortId} → ${edge.targetBlockId}:${edge.targetPortId}`;
  }, [adapter.edges]);

  const lensSuppressesEdgePopover = Boolean(
    edgePopover.active?.data.edgeId
    && debug.hoveredLensEdgeId === edgePopover.active.data.edgeId,
  );
  const portSuppressesEdgePopover = debug.portPopoverActive;

  // [LAW:dataflow-not-control-flow] Popover source resolution is data-driven (pinned over hovered).
  const activeEdgePopover = (lensSuppressesEdgePopover || portSuppressesEdgePopover)
    ? null
    : edgePopover.active;
  const activeEdgePopoverPinned = edgePopover.mode === 'pinned';
  const activeEdgePopoverLabel = edgeLabelForId(activeEdgePopover?.data.edgeId ?? null);

  return (
    <>
      <div
        className="react-flow-wrapper"
        style={{ width: '100%', height: '100%', position: 'relative' }}
        onDrop={handleDropOnCanvas}
        onDragOver={handleDragOverCanvas}
        onMouseMove={handleWrapperMouseMove}
      >
        <GraphEditorCore
          ref={coreRef}
          adapter={adapter}
          features={{
            enableParamEditing: true,
            enableDebugMode: true,
            enableContextMenus: true,
            enableAutoArrange: true,
            enableMinimap: settings.showMinimap,
          }}
          selection={selection}
          portHighlight={portHighlight}
          diagnostics={diagnostics}
          debug={debug}
          frontend={frontend}
          patch={patchStore.patch}
          onNodeContextMenu={handleNodeContextMenu}
          onEdgeContextMenu={handleEdgeContextMenu}
          onPortContextMenu={handlePortContextMenu}
          onEdgeClick={handleEdgeClick}
          onEdgeMouseEnter={handleEdgeMouseEnter}
          onEdgeMouseLeave={handleEdgeMouseLeave}
          onPaneClick={handlePaneClick}
        >
          {/* Auto-Arrange Button Panel - rendered inside ReactFlow context */}
          <Panel position="top-left" className="react-flow-panel">
            <Button
              variant="outlined"
              size="small"
              onClick={() => coreRef.current?.autoArrange()}
              sx={{
                textTransform: 'none',
                fontSize: '0.75rem',
                borderColor: '#0f3460',
                color: '#eee',
                '&:hover': {
                  borderColor: '#4ecdc4',
                  background: 'rgba(78, 205, 196, 0.1)',
                },
              }}
            >
              Auto Arrange
            </Button>
          </Panel>

          {/* Debug Mode Toggle Panel */}
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
        </GraphEditorCore>

        {debug.enabled && (
          <EdgeInfoPopover
            edgeId={activeEdgePopover?.data.edgeId ?? null}
            edgeLabel={activeEdgePopoverLabel}
            anchorPosition={activeEdgePopover?.anchorPosition ?? null}
            pinned={activeEdgePopoverPinned}
            onClose={() => edgePopover.closeAll()}
          />
        )}

      </div>

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
  return <ReactFlowEditorInner onEditorReady={onEditorReady} />;
};
