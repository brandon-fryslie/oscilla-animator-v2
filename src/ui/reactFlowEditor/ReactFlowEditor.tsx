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
import { Panel, type Node, type Edge, type NodeMouseHandler, type EdgeMouseHandler } from 'reactflow';
import { Button } from '@mui/material';
import { useStores } from '../../stores';
import { useSettings } from '../../settings';
import { editorSettings } from '../../settings/tokens/editor-settings';
import type { BlockId, PortId } from '../../types';
import type { EditorHandle } from '../editorCommon';
import { GraphEditorCore, type GraphEditorCoreHandle } from '../graphEditor/GraphEditorCore';
import { PatchStoreAdapter } from '../graphEditor/PatchStoreAdapter';
import { useGraphEditor } from '../graphEditor/GraphEditorContext';
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
    portHighlight,
  } = useStores();

  // Editor settings
  const [settings] = useSettings(editorSettings);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  // Ref to GraphEditorCore imperative handle
  const coreRef = useRef<GraphEditorCoreHandle>(null);

  // Create PatchStoreAdapter
  const adapter = useMemo(
    () => new PatchStoreAdapter(patchStore, layoutStore),
    [patchStore, layoutStore]
  );

  // Port context menu handler - called from UnifiedNode
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

  // Expose port context menu handler via global store for UnifiedNode access
  useEffect(() => {
    window.__reactFlowPortContextMenu = handlePortContextMenu;
    return () => {
      delete window.__reactFlowPortContextMenu;
    };
  }, [handlePortContextMenu]);

  // Navigate to block helper - centers and selects block
  const navigateToBlock = useCallback(
    (blockId: BlockId) => {
      selection.selectBlock(blockId);
      // TODO: Add setCenter functionality to GraphEditorCore if needed
    },
    [selection]
  );

  // Create handle for EditorContext
  useEffect(() => {
    if (!coreRef.current) return;

    const handle: ReactFlowEditorHandle = {
      async addBlock(blockId: BlockId, blockType: string): Promise<void> {
        // Add block via adapter (which uses patchStore)
        adapter.addBlock(blockType, { x: 100, y: 100 });
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

  // Build edge label for debug panel
  const edgeLabel = useMemo(() => {
    if (!debug.hoveredEdgeId) return null;

    const edge = adapter.edges.find((e) => e.id === debug.hoveredEdgeId);
    if (!edge) return null;

    return `${edge.sourceBlockId}:${edge.sourcePortId} → ${edge.targetBlockId}:${edge.targetPortId}`;
  }, [debug.hoveredEdgeId, adapter.edges]);

  return (
    <>
      <div className="react-flow-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
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
          patch={patchStore.patch}
        />

        {/* Auto-Arrange Button Panel */}
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

        {/* Debug Panel (Sprint 1: Debug Probe) */}
        <SimpleDebugPanel
          edgeValue={debug.edgeValue}
          edgeLabel={edgeLabel}
          enabled={debug.enabled}
          status={debug.status}
        />
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
