/**
 * Composite Editor
 *
 * Editor for creating and editing composite blocks.
 * Uses GraphEditorCore for the internal graph canvas.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import type { NodeMouseHandler, EdgeMouseHandler } from 'reactflow';
import {
  ContentCopy as DuplicateIcon,
  Delete as DeleteIcon,
  LinkOff as DisconnectIcon,
  ArrowBack as SourceIcon,
  ArrowForward as TargetIcon,
  Output as ExposeIcon,
  VisibilityOff as UnexposeIcon,
} from '@mui/icons-material';
import { useStores } from '../../stores';
import type { InternalBlockId } from '../../blocks/composite-types';
import { GraphEditorCore, type GraphEditorCoreHandle } from '../graphEditor/GraphEditorCore';
import { CompositeStoreAdapter } from '../graphEditor/CompositeStoreAdapter';
import { ContextMenu, type ContextMenuItem } from '../reactFlowEditor/ContextMenu';
import { CompositeEditorDslSidebar } from './CompositeEditorDslSidebar';
import { useEditor, type EditorHandle } from '../editorCommon';
import './CompositeEditor.css';

/**
 * Main composite editor component.
 * Provides UI for:
 * - Internal graph editing (add/connect/remove blocks)
 * - Port exposure configuration
 * - DSL text editing (HCL)
 * - Metadata editing (name, label, category)
 * - Save/cancel workflow
 */
export const CompositeEditor = observer(function CompositeEditor() {
  const { compositeEditor } = useStores();
  const graphEditorRef = useRef<GraphEditorCoreHandle>(null);

  // Right panel state
  const [activeTab, setActiveTab] = useState<'ports' | 'hcl'>('ports');
  const [panelWidth, setPanelWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);

  // Context menu state
  type ContextMenuState =
    | { type: 'block'; blockId: InternalBlockId; position: { top: number; left: number } }
    | { type: 'edge'; edgeId: string; position: { top: number; left: number } }
    | { type: 'port'; blockId: InternalBlockId; portId: string; isInput: boolean; position: { top: number; left: number } }
    | null;
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  // Create adapter for GraphEditorCore
  const adapter = useMemo(
    () => new CompositeStoreAdapter(compositeEditor),
    [compositeEditor]
  );

  // Register an EditorHandle so BlockLibrary double-click works in composite context
  const { setEditorHandle } = useEditor();
  useEffect(() => {
    if (!compositeEditor.isOpen) return;

    const handle: EditorHandle = {
      type: 'composite',
      async addBlock(blockType: string, options?: { displayName?: string; position?: { x: number; y: number } }): Promise<string> {
        const pos = options?.position ?? { x: 100, y: 100 };
        return adapter.addBlock(blockType, pos);
      },
      async removeBlock(blockId) {
        adapter.removeBlock(blockId as any);
      },
      async zoomToFit() {
        graphEditorRef.current?.zoomToFit();
      },
      async autoArrange() {
        graphEditorRef.current?.autoArrange();
      },
      getRawHandle() {
        return graphEditorRef.current;
      },
    };

    setEditorHandle(handle);
    return () => setEditorHandle(null);
  }, [compositeEditor.isOpen, adapter, setEditorHandle]);

  // Handle drop of composite to open for editing (empty state)
  const handleDropOnEmpty = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const compositeType = event.dataTransfer.getData('application/oscilla-composite-type');
      if (compositeType) {
        compositeEditor.openExisting(compositeType);
      }
    },
    [compositeEditor]
  );

  const handleDragOverEmpty = useCallback((event: React.DragEvent) => {
    // Only accept composite drops
    if (event.dataTransfer.types.includes('application/oscilla-composite-type')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  // Handle drop of blocks onto graph canvas (when editor is open)
  const handleDropOnCanvas = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const blockType = event.dataTransfer.getData('application/oscilla-block-type');
      if (!blockType) return;

      // Get drop position relative to the canvas
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left - 75, // Center the node
        y: event.clientY - reactFlowBounds.top - 30,
      };

      compositeEditor.addBlock(blockType, position);
    },
    [compositeEditor]
  );

  const handleDragOverCanvas = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  // Context menu handlers for GraphEditorCore
  const handleNodeContextMenu = useCallback<NodeMouseHandler>(
    (event, node) => {
      event.preventDefault();
      setContextMenu({
        type: 'block',
        blockId: node.id as InternalBlockId,
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

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Port context menu handler - called from UnifiedNode via window global
  const handlePortContextMenu = useCallback(
    (blockId: unknown, portId: unknown, isInput: boolean, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        type: 'port',
        blockId: blockId as InternalBlockId,
        portId: portId as string,
        isInput,
        position: { top: event.clientY, left: event.clientX },
      });
    },
    []
  );

  // Register port context menu handler on window for UnifiedNode access
  useEffect(() => {
    if (!compositeEditor.isOpen) return;
    window.__reactFlowPortContextMenu = handlePortContextMenu;
    return () => {
      delete window.__reactFlowPortContextMenu;
    };
  }, [compositeEditor.isOpen, handlePortContextMenu]);

  // Build context menu items based on what was right-clicked
  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];

    if (contextMenu.type === 'block') {
      const blockId = contextMenu.blockId;
      const block = adapter.blocks.get(blockId);
      if (!block) return [];

      const connectedEdges = adapter.edges.filter(
        (e) => e.sourceBlockId === blockId || e.targetBlockId === blockId
      );

      return [
        {
          label: 'Duplicate Block',
          icon: <DuplicateIcon fontSize="small" />,
          action: () => {
            const pos = adapter.getBlockPosition(blockId);
            adapter.addBlock(block.type, {
              x: (pos?.x ?? 100) + 40,
              y: (pos?.y ?? 100) + 40,
            });
          },
          dividerAfter: true,
        },
        {
          label: 'Disconnect All',
          icon: <DisconnectIcon fontSize="small" />,
          action: () => {
            for (const edge of connectedEdges) {
              adapter.removeEdge(edge.id);
            }
          },
          disabled: connectedEdges.length === 0,
        },
        {
          label: 'Delete Block',
          icon: <DeleteIcon fontSize="small" />,
          action: () => {
            adapter.removeBlock(blockId);
          },
          danger: true,
        },
      ];
    }

    if (contextMenu.type === 'edge') {
      const edgeId = contextMenu.edgeId;
      const edge = adapter.edges.find((e) => e.id === edgeId);
      if (!edge) return [];

      const sourceBlock = adapter.blocks.get(edge.sourceBlockId as InternalBlockId);
      const targetBlock = adapter.blocks.get(edge.targetBlockId as InternalBlockId);
      const sourceLabel = sourceBlock?.displayName || sourceBlock?.type || edge.sourceBlockId;
      const targetLabel = targetBlock?.displayName || targetBlock?.type || edge.targetBlockId;

      return [
        {
          label: `Go to Source (${sourceLabel})`,
          icon: <SourceIcon fontSize="small" />,
          action: () => {
            // Selection not available in composite editor - just close menu
          },
        },
        {
          label: `Go to Target (${targetLabel})`,
          icon: <TargetIcon fontSize="small" />,
          action: () => {
            // Selection not available in composite editor - just close menu
          },
          dividerAfter: true,
        },
        {
          label: 'Delete Connection',
          icon: <DeleteIcon fontSize="small" />,
          action: () => {
            adapter.removeEdge(edgeId);
          },
          danger: true,
        },
      ];
    }

    if (contextMenu.type === 'port') {
      const { blockId, portId, isInput } = contextMenu;
      const items: ContextMenuItem[] = [];

      if (isInput) {
        const isExposed = compositeEditor.exposedInputs.some(
          exp => exp.internalBlockId === blockId && exp.internalPortId === portId
        );
        items.push({
          label: isExposed ? 'Unexpose Input' : 'Expose as Input',
          icon: isExposed ? <UnexposeIcon fontSize="small" /> : <ExposeIcon fontSize="small" />,
          action: () => {
            if (isExposed) {
              compositeEditor.unexposeInputPort(blockId, portId);
            } else {
              compositeEditor.exposeInputPort(portId, blockId, portId);
            }
          },
        });
      } else {
        const isExposed = compositeEditor.exposedOutputs.some(
          exp => exp.internalBlockId === blockId && exp.internalPortId === portId
        );
        items.push({
          label: isExposed ? 'Unexpose Output' : 'Expose as Output',
          icon: isExposed ? <UnexposeIcon fontSize="small" /> : <ExposeIcon fontSize="small" />,
          action: () => {
            if (isExposed) {
              compositeEditor.unexposeOutputPort(blockId, portId);
            } else {
              compositeEditor.exposeOutputPort(portId, blockId, portId);
            }
          },
        });
      }

      // Disconnect edges on this port
      const connectedEdges = adapter.edges.filter((e) =>
        isInput
          ? (e.targetBlockId === blockId && e.targetPortId === portId)
          : (e.sourceBlockId === blockId && e.sourcePortId === portId)
      );
      if (connectedEdges.length > 0) {
        items.push({
          label: `Disconnect (${connectedEdges.length})`,
          icon: <DisconnectIcon fontSize="small" />,
          action: () => {
            for (const edge of connectedEdges) {
              adapter.removeEdge(edge.id);
            }
          },
        });
      }

      return items;
    }

    return [];
  }, [contextMenu, adapter]);

  // Panel resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      width: panelWidth,
    };
  }, [panelWidth]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeStartRef.current) return;

    const deltaX = resizeStartRef.current.x - e.clientX;
    const newWidth = Math.max(200, Math.min(600, resizeStartRef.current.width + deltaX));
    setPanelWidth(newWidth);
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    resizeStartRef.current = null;
  }, []);

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // If editor is not open, show empty state
  if (!compositeEditor.isOpen) {
    return (
      <div
        className="composite-editor composite-editor--empty"
        onDrop={handleDropOnEmpty}
        onDragOver={handleDragOverEmpty}
      >
        <div className="composite-editor__empty-state">
          <h2>Composite Editor</h2>
          <p>No composite is currently being edited.</p>
          <p className="composite-editor__hint">
            Drag a composite from the library to edit it, or:
          </p>
          <button
            className="composite-editor__new-btn"
            onClick={() => compositeEditor.openNew()}
          >
            Create New Composite
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="composite-editor">
      {/* Fork notice for library composites */}
      {compositeEditor.isFork && (
        <div className="composite-editor__fork-notice">
          Editing a copy of a library composite. Save will create a new user composite.
        </div>
      )}

      {/* Header with metadata and actions */}
      <div className="composite-editor__header">
        <div className="composite-editor__metadata">
          <input
            type="text"
            className="composite-editor__name-input"
            placeholder="Composite Name (e.g., SmoothNoise)"
            value={compositeEditor.metadata.name}
            onChange={(e) =>
              compositeEditor.updateMetadata({ name: e.target.value })
            }
          />
          <input
            type="text"
            className="composite-editor__label-input"
            placeholder="Display Label"
            value={compositeEditor.metadata.label}
            onChange={(e) =>
              compositeEditor.updateMetadata({ label: e.target.value })
            }
          />
          <select
            className="composite-editor__category-select"
            value={compositeEditor.metadata.category}
            onChange={(e) =>
              compositeEditor.updateMetadata({ category: e.target.value })
            }
          >
            <option value="user">User</option>
            <option value="signal">Signal</option>
            <option value="math">Math</option>
            <option value="layout">Layout</option>
            <option value="render">Render</option>
          </select>
        </div>
        <div className="composite-editor__actions">
          <button
            className="composite-editor__save-btn"
            disabled={!compositeEditor.canSave}
            onClick={() => {
              const result = compositeEditor.save();
              if (result) {
                compositeEditor.close();
              }
            }}
          >
            Save
          </button>
          <button
            className="composite-editor__cancel-btn"
            onClick={() => {
              if (compositeEditor.isDirty) {
                if (confirm('Discard unsaved changes?')) {
                  compositeEditor.reset();
                  compositeEditor.close();
                }
              } else {
                compositeEditor.close();
              }
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Validation errors */}
      {compositeEditor.validationErrors.length > 0 && (
        <div className="composite-editor__errors">
          {compositeEditor.validationErrors.map((err, idx) => (
            <div key={idx} className="composite-editor__error">
              {err.message}
            </div>
          ))}
        </div>
      )}

      {/* Main content area */}
      <div className="composite-editor__content">
        {/* Left: Internal graph canvas */}
        <div
          className="composite-editor__canvas"
          onDrop={handleDropOnCanvas}
          onDragOver={handleDragOverCanvas}
        >
          <GraphEditorCore
            ref={graphEditorRef}
            adapter={adapter}
            features={{
              enableParamEditing: false,  // User decision: composite editor only handles topology
              enableDebugMode: false,
              enableContextMenus: true,
              enableAutoArrange: true,
              enableMinimap: true,
            }}
            selection={null}
            portHighlight={null}
            diagnostics={null}
            debug={null}
            patch={null}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            onPaneClick={handlePaneClick}
          />
        </div>

        {/* Right: Tabbed panel (Exposed Ports / HCL) */}
        <div className="composite-editor__right-panel" style={{ width: panelWidth }}>
          {/* Resize handle */}
          <div
            className="composite-editor__resize-handle"
            onMouseDown={handleResizeStart}
          />

          {/* Tab headers */}
          <div className="composite-editor__tabs">
            <button
              className={`composite-editor__tab ${activeTab === 'ports' ? 'composite-editor__tab--active' : ''}`}
              onClick={() => setActiveTab('ports')}
            >
              Exposed Ports
            </button>
            <button
              className={`composite-editor__tab ${activeTab === 'hcl' ? 'composite-editor__tab--active' : ''}`}
              onClick={() => setActiveTab('hcl')}
            >
              HCL
            </button>
          </div>

          {/* Tab content */}
          <div className="composite-editor__tab-content">
            {activeTab === 'ports' && (
              <div className="composite-editor__ports">
                <div className="composite-editor__port-section">
                  <h4>Inputs</h4>
                  {compositeEditor.allInternalInputPorts.length === 0 ? (
                    <p className="composite-editor__no-ports">No input ports available</p>
                  ) : (
                    <ul className="composite-editor__port-list">
                      {compositeEditor.allInternalInputPorts.map((port) => (
                        <li
                          key={`${port.blockId}-${port.portId}`}
                          className="composite-editor__port-item"
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={port.isExposed}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  compositeEditor.exposeInputPort(
                                    port.portId,  // externalId (default = portId)
                                    port.blockId, // internalBlockId
                                    port.portId   // internalPortId
                                  );
                                } else {
                                  compositeEditor.unexposeInputPort(port.blockId, port.portId);
                                }
                              }}
                            />
                            <span className="composite-editor__port-name">
                              {port.blockType}.{port.portId}
                            </span>
                          </label>
                          {port.isExposed && (
                            <input
                              type="text"
                              className="composite-editor__port-external-id"
                              value={port.externalId || ''}
                              placeholder="External ID"
                              onChange={(e) =>
                                compositeEditor.updateExposedInputId(
                                  port.blockId,
                                  port.portId,
                                  e.target.value
                                )
                              }
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="composite-editor__port-section">
                  <h4>Outputs</h4>
                  {compositeEditor.allInternalOutputPorts.length === 0 ? (
                    <p className="composite-editor__no-ports">No output ports available</p>
                  ) : (
                    <ul className="composite-editor__port-list">
                      {compositeEditor.allInternalOutputPorts.map((port) => (
                        <li
                          key={`${port.blockId}-${port.portId}`}
                          className="composite-editor__port-item"
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={port.isExposed}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  compositeEditor.exposeOutputPort(
                                    port.portId,  // externalId (default = portId)
                                    port.blockId, // internalBlockId
                                    port.portId   // internalPortId
                                  );
                                } else {
                                  compositeEditor.unexposeOutputPort(port.blockId, port.portId);
                                }
                              }}
                            />
                            <span className="composite-editor__port-name">
                              {port.blockType}.{port.portId}
                            </span>
                          </label>
                          {port.isExposed && (
                            <input
                              type="text"
                              className="composite-editor__port-external-id"
                              value={port.externalId || ''}
                              placeholder="External ID"
                              onChange={(e) =>
                                compositeEditor.updateExposedOutputId(
                                  port.blockId,
                                  port.portId,
                                  e.target.value
                                )
                              }
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'hcl' && (
              <CompositeEditorDslSidebar store={compositeEditor} />
            )}
          </div>
        </div>
      </div>

      {/* Context menu for blocks and edges */}
      {contextMenu && (
        <ContextMenu
          items={contextMenuItems}
          anchorPosition={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});
