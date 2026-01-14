/**
 * ReteEditor Component
 *
 * Main visual node editor using Rete.js v2.
 * Provides pan/zoom, node creation, connection management.
 * Syncs bidirectionally with PatchStore.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NodeEditor, GetSchemes, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ReactPlugin, Presets as ReactPresets, ReactArea2D } from 'rete-react-plugin';
import {
  ConnectionPlugin,
  Presets as ConnectionPresets,
} from 'rete-connection-plugin';
import { ContextMenuPlugin, ContextMenuExtra } from 'rete-context-menu-plugin';
import { HistoryPlugin } from 'rete-history-plugin';
import { AutoArrangePlugin, Presets as ArrangePresets } from 'rete-auto-arrange-plugin';
import { MinimapPlugin, MinimapExtra } from 'rete-minimap-plugin';
import { rootStore } from '../../stores';
import {
  syncPatchToEditor,
  setupEditorToPatchSync,
  setupPatchToEditorReaction,
  setHistoryPlugin,
  pushHistoryState,
} from './sync';
import { useEditor } from './EditorContext';
import { OscillaNode } from './nodes';
import './ReteEditor.css';

// Type schemes for Rete editor
type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
type AreaExtra = ReactArea2D<Schemes> | ContextMenuExtra | MinimapExtra;

export interface ReteEditorHandle {
  editor: NodeEditor<Schemes>;
  area: AreaPlugin<Schemes, AreaExtra>;
  connection: ConnectionPlugin<Schemes, AreaExtra>;
  arrange?: any; // AutoArrangePlugin has complex type constraints
}

interface ReteEditorProps {
  onEditorReady?: (handle: ReteEditorHandle) => void;
}

export const ReteEditor: React.FC<ReteEditorProps> = ({ onEditorReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReteEditorHandle | null>(null);
  const { setEditorHandle } = useEditor();
  const [isArranging, setIsArranging] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Create editor and plugins
    const editor = new NodeEditor<Schemes>();
    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    const connection = new ConnectionPlugin<Schemes, AreaExtra>();
    const reactPlugin = new ReactPlugin<Schemes, AreaExtra>({ createRoot });
    const contextMenu = new ContextMenuPlugin<Schemes>({
      items(context, plugin) {
        // Background context menu (right-click on empty space)
        if (context === 'root') {
          return {
            searchBar: false,
            list: []
          };
        }

        // Node context menu (right-click on node)
        if (context && typeof context === 'object' && 'label' in context) {
          const node = context as OscillaNode;
          return {
            searchBar: false,
            list: [
              {
                label: 'Delete',
                key: 'delete',
                handler: () => {
                  editor.removeNode(node.id);
                }
              }
            ]
          };
        }

        return { searchBar: false, list: [] };
      }
    });

    // History plugin for undo/redo
    const history = new HistoryPlugin<Schemes>();

    // Auto-arrange plugin (using any due to type constraints)
    const arrange = new (AutoArrangePlugin as any)(area);
    arrange.addPreset((ArrangePresets.classic as any).setup());

    // Minimap plugin (using any due to type constraints)
    const minimap = new (MinimapPlugin as any)({
      minDistance: 25,
      ratio: 0.2,
    });

    // Register plugins
    editor.use(area);
    area.use(connection);
    area.use(reactPlugin);
    area.use(contextMenu);
    area.use(history);
    area.use(arrange);
    area.use(minimap);

    // Setup connection and rendering presets
    connection.addPreset(ConnectionPresets.classic.setup());
    reactPlugin.addPreset(ReactPresets.classic.setup());
    reactPlugin.addPreset(ReactPresets.minimap.setup());

    // Enable node selection
    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl(),
    });

    // Zoom at mouse position
    AreaExtensions.simpleNodesOrder(area);

    // Store history plugin for undo/redo operations
    setHistoryPlugin(history);

    // Store handle
    const handle: ReteEditorHandle = { editor, area, connection, arrange };
    editorRef.current = handle;
    setEditorHandle(handle); // Register with context for BlockLibrary access

    // Setup bidirectional sync
    setupEditorToPatchSync(handle, rootStore.patch);
    const disposeReaction = setupPatchToEditorReaction(handle, rootStore.patch);

    // Setup keyboard shortcuts for undo/redo
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when editor is visible/active
      // You could add more sophisticated logic here to check if editor tab is active

      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        // Check if undo is available
        const historyPlugin = (history as any);
        if (historyPlugin && typeof historyPlugin.undo === 'function') {
          historyPlugin.undo();
        }
      }

      // Ctrl+Y or Ctrl+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        const historyPlugin = (history as any);
        if (historyPlugin && typeof historyPlugin.redo === 'function') {
          historyPlugin.redo();
        }
      }

      // Ctrl+Shift+Z for redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        const historyPlugin = (history as any);
        if (historyPlugin && typeof historyPlugin.redo === 'function') {
          historyPlugin.redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Setup history to commit on user actions
    editor.addPipe((context) => {
      // Commit on user actions that modify the graph
      if (context.type === 'nodecreated' ||
          context.type === 'noderemoved' ||
          context.type === 'connectioncreated' ||
          context.type === 'connectionremoved') {
        // Use the pushHistoryState function which checks isSyncing
        pushHistoryState();
      }

      return context;
    });

    // Initial sync from PatchStore
    syncPatchToEditor(handle, rootStore.patch.patch);

    // Notify parent
    onEditorReady?.(handle);

    // Cleanup on unmount
    return () => {
      setEditorHandle(null);
      disposeReaction();
      window.removeEventListener('keydown', handleKeyDown);
      area.destroy();
    };
  }, [onEditorReady, setEditorHandle]);

  // Auto-arrange handler
  const handleAutoArrange = async () => {
    if (!editorRef.current || isArranging) return;

    setIsArranging(true);
    try {
      const { editor, area, arrange } = editorRef.current;
      const nodes = editor.getNodes();

      // Don't arrange if graph is empty
      if (nodes.length === 0) {
        return;
      }

      // Only arrange if single node - just center it
      if (nodes.length === 1) {
        await AreaExtensions.zoomAt(area, nodes);
        return;
      }

      // Perform layout with elkjs options
      // Configure direction (left-to-right) and spacing (100px horizontal, 80px vertical)
      if (arrange && typeof arrange.layout === 'function') {
        await arrange.layout({
          options: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT', // Left-to-right flow
            'elk.spacing.nodeNode': '100', // Horizontal spacing between nodes
            'elk.layered.spacing.nodeNodeBetweenLayers': '80', // Vertical spacing between layers
            'elk.padding': '[top=20,left=20,bottom=20,right=20]'
          }
        });
      }

      // Zoom to fit after layout
      await AreaExtensions.zoomAt(area, nodes);

      // Commit to history
      pushHistoryState();
    } catch (error) {
      console.error('Auto-arrange failed:', error);
    } finally {
      setIsArranging(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 1000,
          display: 'flex',
          gap: 8,
          padding: 8,
          background: 'rgba(0, 0, 0, 0.7)',
          borderRadius: 4,
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <button
          onClick={handleAutoArrange}
          disabled={isArranging}
          title="Auto Arrange (arrange nodes automatically)"
          style={{
            padding: '6px 12px',
            background: isArranging ? '#555' : '#333',
            color: '#fff',
            border: '1px solid #666',
            borderRadius: 4,
            cursor: isArranging ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {isArranging ? 'Arranging...' : 'Auto Arrange'}
        </button>
      </div>

      {/* Editor container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: '#1a1a2e',
          position: 'relative',
        }}
      />
    </div>
  );
};
