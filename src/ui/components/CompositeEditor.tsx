/**
 * Composite Editor
 *
 * Editor for creating and editing composite blocks.
 * Uses GraphEditorCore for the internal graph canvas.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { GraphEditorCore, type GraphEditorCoreHandle } from '../graphEditor/GraphEditorCore';
import { CompositeStoreAdapter } from '../graphEditor/CompositeStoreAdapter';
import { CompositeEditorDslSidebar } from './CompositeEditorDslSidebar';
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

  // Create adapter for GraphEditorCore
  const adapter = useMemo(
    () => new CompositeStoreAdapter(compositeEditor),
    [compositeEditor]
  );

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
            // No stores needed for composite editor (no selection, debug, etc.)
            selection={null}
            portHighlight={null}
            diagnostics={null}
            debug={null}
            patch={null}
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
    </div>
  );
});
