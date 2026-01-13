/**
 * ReteEditor Component
 *
 * Main visual node editor using Rete.js v2.
 * Provides pan/zoom, node creation, connection management.
 * Syncs bidirectionally with PatchStore.
 */

import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { NodeEditor, GetSchemes, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ReactPlugin, Presets as ReactPresets, ReactArea2D } from 'rete-react-plugin';
import {
  ConnectionPlugin,
  Presets as ConnectionPresets,
} from 'rete-connection-plugin';
import { ContextMenuPlugin, ContextMenuExtra } from 'rete-context-menu-plugin';
import { rootStore } from '../../stores';
import { syncPatchToEditor, setupEditorToPatchSync, setupPatchToEditorReaction } from './sync';
import { useEditor } from './EditorContext';
import { OscillaNode } from './nodes';

// Type schemes for Rete editor
type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
type AreaExtra = ReactArea2D<Schemes> | ContextMenuExtra;

export interface ReteEditorHandle {
  editor: NodeEditor<Schemes>;
  area: AreaPlugin<Schemes, AreaExtra>;
  connection: ConnectionPlugin<Schemes, AreaExtra>;
}

interface ReteEditorProps {
  onEditorReady?: (handle: ReteEditorHandle) => void;
}

export const ReteEditor: React.FC<ReteEditorProps> = ({ onEditorReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReteEditorHandle | null>(null);
  const { setEditorHandle } = useEditor();

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

    // Register plugins
    editor.use(area);
    area.use(connection);
    area.use(reactPlugin);
    area.use(contextMenu);

    // Setup connection and rendering presets
    connection.addPreset(ConnectionPresets.classic.setup());
    reactPlugin.addPreset(ReactPresets.classic.setup());

    // Enable node selection
    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl(),
    });

    // Zoom at mouse position
    AreaExtensions.simpleNodesOrder(area);

    // Store handle
    const handle: ReteEditorHandle = { editor, area, connection };
    editorRef.current = handle;
    setEditorHandle(handle); // Register with context for BlockLibrary access

    // Setup bidirectional sync
    setupEditorToPatchSync(handle, rootStore.patch);
    const disposeReaction = setupPatchToEditorReaction(handle, rootStore.patch);

    // Initial sync from PatchStore
    syncPatchToEditor(handle, rootStore.patch.patch);

    // Notify parent
    onEditorReady?.(handle);

    // Cleanup on unmount
    return () => {
      setEditorHandle(null);
      disposeReaction();
      area.destroy();
    };
  }, [onEditorReady, setEditorHandle]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#1a1a2e',
        position: 'relative',
      }}
    />
  );
};
