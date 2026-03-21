/**
 * Block Inspector Component (React)
 *
 * Detailed view of selected block OR block type preview.
 * Shows ports, connections, parameters, and default sources.
 * Supports editing of displayName and block params.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { colors } from '../theme';
import { getAnyBlockDefinition, type AnyBlockDef, type InputDef, type OutputDef, BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';
import './BlockInspector.css';
import type { Block, Patch, Edge } from '../../graph/Patch';
import type { BlockId, PortId, DefaultSource, UIControlHint, PortEndpointRef } from '../../types';
import type { CombineMode } from '../../types';
import {
  formatDefaultSourceLabel,
  isConstLiteralDefaultSource,
  isTimeDefaultSource,
} from '../defaultSourcePresentation';
import { formatValueType } from './typeFormatters';
import {
  NumberInput as MuiNumberInput,
  TextInput as MuiTextInput,
  SelectInput as MuiSelectInput,
  CheckboxInput as MuiCheckboxInput,
  ColorInput as MuiColorInput,
  SliderWithInput,
} from './common';
import { ConnectionPicker } from './ConnectionPicker';
import { DisplayNameEditor } from './DisplayNameEditor';
import { EdgeInspector } from './EdgeInspector';
import { SharedExpressionEditor } from './SharedExpressionEditor';
import { getBlockParamEditor } from '../block-ui';
import type { BindingControlDescriptor } from '../../stores/FrontendResultStore';
import {
  getValidCombineModesForType,
  getValidDefaultSourceBlockTypes,
} from '../authoring/semanticQueries';

// =============================================================================
// Helper Functions
// =============================================================================

function authoredControlToDefaultSource(block: Block, portId: string): DefaultSource | undefined {
  const source = block.inputPorts.get(portId)?.authoredControl?.source;
  if (!source) return undefined;
  return {
    blockType: source.blockType,
    output: source.outputPortId,
    params: { ...source.params },
  };
}

function effectiveInputDefaultSource(block: Block, portId: string, inputDef: InputDef | undefined): DefaultSource | undefined {
  return authoredControlToDefaultSource(block, portId)
    ?? block.inputPorts.get(portId)?.defaultSource
    ?? inputDef?.defaultSource;
}

// =============================================================================
// Main Inspector Component
// =============================================================================

/**
 * Block Inspector component.
 */
export const BlockInspector = observer(function BlockInspector() {
  const { selection, patch: patchStore } = useStores();
  const { previewType, selectedBlockId, selectedEdgeId, selectedPort } = selection;
  const patch = patchStore.patch;

  // Determine content based on selection state
  let content: React.ReactNode;

  // Preview mode takes precedence
  if (previewType) {
    content = <TypePreview type={previewType} />;
  } else if (selectedPort && patch) {
    // Port selection mode
    const block = patch.blocks.get(selectedPort.blockId as BlockId);
    const blockDef = block ? getAnyBlockDefinition(block.type) : null;
    if (block && blockDef) {
      content = (
        <PortInspectorStandalone
          portRef={selectedPort}
          block={block}
          blockDef={blockDef}
          patch={patch}
        />
      );
    } else {
      content = <NoSelection />;
    }
  } else if (selectedEdgeId && patch) {
    // Edge selection mode
    const edge = patch.edges.find(e => e.id === selectedEdgeId);
    if (edge) {
      content = <EdgeInspector edge={edge} patch={patch} />;
    } else {
      content = <NoSelection />;
    }
  } else if (!selectedBlockId || !patch) {
    // No selection
    content = <NoSelection />;
  } else {
    const block = patch.blocks.get(selectedBlockId);
    if (!block) {
      content = <NoSelection />;
    } else if (block.role?.kind === 'timeRoot') {
      // TimeRoot block
      content = <TimeRootBlock />;
    } else {
      // Regular block
      content = <BlockDetails block={block} patch={patch} />;
    }
  }

  // Wrap all content in scrollable container
  return (
    <div className="block-inspector">
      <div className="block-inspector__content">
        {content}
      </div>
    </div>
  );
});

// =============================================================================
// No Selection State
// =============================================================================

function NoSelection() {
  return (
    <div style={{ color: colors.textSecondary }}>
      <p>Select a block or port to inspect.</p>
    </div>
  );
}

// =============================================================================
// TimeRoot Block (Hidden System Block)
// =============================================================================

function TimeRootBlock() {
  return (
    <div style={{ color: colors.textSecondary }}>
      <p>System block (hidden)</p>
      <p style={{ fontSize: '12px', marginTop: '8px' }}>
        Time root blocks are system-managed and not shown in most views.
      </p>
    </div>
  );
}


/**
 * Get valid combine modes for a payload type.
 * Filters modes based on type compatibility.
 */
/**
 * Format combine mode for display.
 */
function formatCombineMode(mode: CombineMode): string {
  const labels: Record<CombineMode, string> = {
    last: 'Last (default)',
    first: 'First',
    sum: 'Sum',
    average: 'Average',
    max: 'Maximum',
    min: 'Minimum',
    mul: 'Multiply',
    layer: 'Layer',
    or: 'OR (boolean)',
    and: 'AND (boolean)',
    collect: 'Collect',
    array: 'Array',
  };
  return labels[mode] ?? mode;
}


// =============================================================================
// Port Inspector Panel (Top-Level)
// =============================================================================

interface PortInspectorStandaloneProps {
  portRef: PortEndpointRef;
  block: Block;
  blockDef: AnyBlockDef;
  patch: Patch;
}

const PortInspectorStandalone = observer(function PortInspectorStandalone({ portRef, block, blockDef, patch }: PortInspectorStandaloneProps) {
  const { selection, patch: patchStore, frontend } = useStores();
  const [showConnectionPicker, setShowConnectionPicker] = useState(false);

  const inputDef = blockDef.inputs[portRef.portId];
  const outputDef = blockDef.outputs[portRef.portId];
  const portDef = inputDef || outputDef;
  const isInput = !!inputDef;

  if (!portDef) {
    return (
      <div>
        <p style={{ color: colors.error }}>Port not found: {portRef.portId}</p>
      </div>
    );
  }

  const connectedEdges = isInput
    ? patch.edges.filter(e => e.to.blockId === block.id && e.to.slotId === portRef.portId)
    : patch.edges.filter(e => e.from.blockId === block.id && e.from.slotId === portRef.portId);

  const isConnected = connectedEdges.length > 0;

  // Get effective default source (port override or registry default)
  const instancePort = block.inputPorts.get(portRef.portId);
  const effectiveDefaultSource = isInput && inputDef
    ? effectiveInputDefaultSource(block, portRef.portId, inputDef)
    : undefined;
  const binding = isInput
    ? frontend.getInputBindingByIds(block.id, portRef.portId as PortId)
    : undefined;

  const handleViewBlock = useCallback(() => {
    selection.selectBlock(block.id);
  }, [selection, block.id]);

  const handleDisconnect = useCallback((edgeId: string) => {
    patchStore.removeEdge(edgeId);
  }, [patchStore]);

  const handleConnect = useCallback((sourceBlockId: BlockId, sourcePortId: PortId) => {
    // Determine source and target based on port direction
    if (isInput) {
      // Target is INPUT, source is OUTPUT
      patchStore.addEdge(
        { kind: 'port', blockId: sourceBlockId, slotId: sourcePortId },
        { kind: 'port', blockId: block.id, slotId: portRef.portId }
      );
    } else {
      // Target is OUTPUT, source is INPUT
      patchStore.addEdge(
        { kind: 'port', blockId: block.id, slotId: portRef.portId },
        { kind: 'port', blockId: sourceBlockId, slotId: sourcePortId }
      );
    }
    setShowConnectionPicker(false);
  }, [patchStore, isInput, block.id, portRef.portId]);

  return (
    <div>
      <div style={{
        padding: '8px 12px',
        background: isInput ? '#3b82f622' : '#f9731622',
        borderRadius: '4px',
        marginBottom: '16px',
        fontSize: '12px',
        fontWeight: '600',
        color: isInput ? '#3b82f6' : '#f97316'
      }}>
        [{isInput ? 'INPUT' : 'OUTPUT'} PORT]
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>{portDef.label}</h3>
      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>
        {portRef.portId}
      </p>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Port Type
        </h4>
        <div style={{
          padding: '8px',
          background: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '13px',
        }}>
          {formatValueType(portDef.type!)}
        </div>
      </div>

      {/* Combine Mode - only for input ports */}
      {isInput && portDef.type && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
            Combine Mode
          </h4>
          <MuiSelectInput
            value={instancePort?.combineMode ?? 'last'}
            onChange={(value) => {
              patchStore.updateInputPortCombineMode(block.id, portRef.portId as PortId, value as CombineMode);
            }}
            options={getValidCombineModesForType(
              frontend.getResolvedPortTypeByIds(block.id, portRef.portId as PortId, 'in'),
            ).map(mode => ({
              value: mode,
              label: formatCombineMode(mode)
            }))}
            size="sm"
          />
        </div>
      )}

      {/* Editable default source for input ports */}
      {isInput && inputDef && effectiveDefaultSource && (
        <PortDefaultSourceEditor
          blockId={block.id}
          portId={portRef.portId}
          currentDefaultSource={effectiveDefaultSource}
          registryDefaultSource={inputDef.defaultSource}
          isConnected={isConnected}
        />
      )}
      {binding && binding.controls.length > 0 && (
        <BindingControlsSection controls={binding.controls} />
      )}

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          {isInput ? 'Connection' : `Connections (${connectedEdges.length})`}
        </h4>

        {connectedEdges.length === 0 && !showConnectionPicker && (
          <div>
            <div style={{ color: colors.textMuted, fontSize: '13px', marginBottom: '8px' }}>
              Not connected
            </div>
            <button
              onClick={() => setShowConnectionPicker(true)}
              style={{
                padding: '6px 12px',
                background: colors.primary,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              + Connect...
            </button>
          </div>
        )}

        {showConnectionPicker && (
          <ConnectionPicker
            targetBlockId={block.id}
            targetPortId={portRef.portId as PortId}
            direction={isInput ? 'input' : 'output'}
            patch={patch}
            onSelect={handleConnect}
            onCancel={() => setShowConnectionPicker(false)}
          />
        )}

        {isInput && connectedEdges.map((edge, idx) => {
          const sourceBlock = patch.blocks.get(edge.from.blockId as BlockId);
          return (
            <div key={idx} style={{ marginBottom: '8px' }}>
              <div
                onClick={() => selection.selectBlock(edge.from.blockId as BlockId)}
                style={{
                  padding: '8px',
                  background: colors.bgPanel,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  marginBottom: '4px',
                }}
              >
                ← <span style={{ color: colors.primary, textDecoration: 'underline' }}>
                  {sourceBlock?.displayName || sourceBlock?.type || edge.from.blockId}
                </span>
                <span style={{ color: colors.textSecondary }}>.{edge.from.slotId}</span>
              </div>
              <button
                onClick={() => handleDisconnect(edge.id)}
                style={{
                  padding: '4px 8px',
                  background: colors.error,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Disconnect
              </button>
            </div>
          );
        })}

        {!isInput && connectedEdges.map((edge, idx) => {
          const targetBlock = patch.blocks.get(edge.to.blockId as BlockId);
          return (
            <div
              key={idx}
              onClick={() => selection.selectBlock(edge.to.blockId as BlockId)}
              style={{
                padding: '8px',
                background: colors.bgPanel,
                borderRadius: '4px',
                marginBottom: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              → <span style={{ color: colors.primary, textDecoration: 'underline' }}>
                {targetBlock?.displayName || targetBlock?.type || edge.to.blockId}
              </span>
              <span style={{ color: colors.textSecondary }}>.{edge.to.slotId}</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Parent Block
        </h4>
        <div style={{
          padding: '8px',
          background: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '13px',
          marginBottom: '8px',
        }}>
          {block.displayName || blockDef.label} ({block.id})
        </div>
        <button
          onClick={handleViewBlock}
          style={{
            padding: '6px 12px',
            background: colors.primary,
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          View Block
        </button>
      </div>
    </div>
  );
});


// =============================================================================
// Type Preview (from library)
// =============================================================================

interface TypePreviewProps {
  type: string;
}

function TypePreview({ type }: TypePreviewProps) {
  const typeInfo = getAnyBlockDefinition(type);

  if (!typeInfo) {
    return (
      <div style={{ color: colors.error }}>
        <p>Unknown block type: {type}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        padding: '8px 12px',
        background: colors.primary + '22',
        borderRadius: '4px',
        marginBottom: '16px',
        fontSize: '12px',
        fontWeight: '600',
        color: colors.primary
      }}>
        [TYPE PREVIEW]
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>{typeInfo.label}</h3>
      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>
        {typeInfo.type}
      </p>
      {typeInfo.description && (
        <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
          {typeInfo.description}
        </p>
      )}

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Inputs
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'none' }}>
          {Object.entries(typeInfo.inputs).map(([inputId, input]) => {
            const hasDefaultSource = input.defaultSource !== undefined;
            return (
              <li key={inputId} style={{ marginBottom: '8px', fontSize: '13px' }}>
                <div>
                  <strong>{input.label}</strong>: {formatValueType(input.type!)}
                </div>
                {hasDefaultSource && (
                  <div style={{
                    marginLeft: '16px',
                    fontSize: '12px',
                    color: colors.textSecondary,
                    fontStyle: isTimeDefaultSource(input.defaultSource!) ? 'italic' : 'normal'
                  }}>
                    Default: {formatDefaultSourceLabel(input.defaultSource!)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Outputs
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'none' }}>
          {Object.entries(typeInfo.outputs).map(([outputId, output]) => (
            <li key={outputId} style={{ marginBottom: '4px', fontSize: '13px' }}>
              <strong>{output.label}</strong>: {formatValueType(output.type!)}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: colors.bgPanel, borderRadius: '4px' }}>
        <div style={{ fontSize: '12px', color: colors.textSecondary }}>
          <strong>Form:</strong> {typeInfo.form}
        </div>
        <div style={{ fontSize: '12px', color: colors.textSecondary }}>
          <strong>Capability:</strong> {typeInfo.capability}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Block Instance Details
// =============================================================================

interface BlockDetailsProps {
  block: Block;
  patch: Patch;
}

const BlockDetails = function BlockDetails({ block, patch }: BlockDetailsProps) {
  const typeInfo = getAnyBlockDefinition(block.type);
  const [selectedPort, setSelectedPort] = useState<PortEndpointRef | null>(null);

  if (!typeInfo) {
    return (
      <div style={{ color: colors.error }}>
        <p>Unknown block type: {block.type}</p>
      </div>
    );
  }

  // Get connected edges
  const incomingEdges = patch.edges.filter(e => e.to.blockId === block.id);
  const outgoingEdges = patch.edges.filter(e => e.from.blockId === block.id);
  const connectedInputPorts = new Set(incomingEdges.map(e => e.to.slotId));

  // If a port is selected, show port inspector
  if (selectedPort) {
    return (
      <PortInspector
        portRef={selectedPort}
        block={block}
        typeInfo={typeInfo}
        patch={patch}
        onBack={() => setSelectedPort(null)}
      />
    );
  }

  return (
    <div>
      {/* Header with editable display name */}
      <BlockNameHeader block={block} typeInfo={typeInfo} />

      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>
        {typeInfo.type}
      </p>

      {/* Inputs */}
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Inputs
        </h4>
        <ul style={{ margin: 0, paddingLeft: '0', listStyle: 'none' }}>
          {Object.entries(typeInfo.inputs).map(([portId, port]) => {
            const isConnected = connectedInputPorts.has(portId);
            const connectedEdge = incomingEdges.find(e => e.to.slotId === portId);

            return (
              <PortItem
                key={portId}
                port={port}
                portId={portId}
                kind="input"
                blockId={block.id}
                isConnected={isConnected}
                connectedEdge={connectedEdge}
                patch={patch}
                onClick={() => setSelectedPort({ blockId: block.id, portId: portId as PortId })}
              />
            );
          })}
        </ul>
      </div>

      {/* Outputs */}
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Outputs
        </h4>
        <ul style={{ margin: 0, paddingLeft: '0', listStyle: 'none' }}>
          {Object.entries(typeInfo.outputs).map(([portId, port]) => {
            const portEdges = outgoingEdges.filter(e => e.from.slotId === portId);

            return (
              <OutputPortItem
                key={portId}
                port={port}
                edges={portEdges}
                patch={patch}
                onClick={() => setSelectedPort({ blockId: block.id, portId: portId as PortId })}
              />
            );
          })}
        </ul>
      </div>

      {/* Editable Parameters */}
      <ParamsEditor block={block} typeInfo={typeInfo} patch={patch} />
    </div>
  );
};

// =============================================================================
// Block Name Header (uses shared DisplayNameEditor)
// =============================================================================

interface BlockNameHeaderProps {
  block: Block;
  typeInfo: AnyBlockDef;
}

/**
 * Block name header in inspector. Uses shared DisplayNameEditor with inspector styling.
 */
function BlockNameHeader({ block, typeInfo }: BlockNameHeaderProps) {
  return (
    <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>
      <DisplayNameEditor
        blockId={block.id}
        currentDisplayName={block.displayName}
        fallbackLabel={typeInfo.label}
        style={{
          fontSize: '18px',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
        editStyle={{
          fontSize: '18px',
          fontWeight: 'bold',
          background: colors.bgPanel,
          color: colors.textPrimary,
        }}
      />
    </h3>
  );
}

// =============================================================================
// Port Items
// =============================================================================

interface PortItemProps {
  port: InputDef;
  kind: 'input';
  blockId: BlockId;
  portId: string;
  isConnected: boolean;
  connectedEdge?: Edge;
  patch: Patch;
  onClick: () => void;
}

const PortItem = function PortItem({ port, portId, blockId, isConnected, connectedEdge, patch, onClick }: PortItemProps) {
  const { selection, frontend } = useStores();
  const block = patch.blocks.get(blockId);
  const currentDefaultSource = block ? effectiveInputDefaultSource(block, portId, port) : port.defaultSource;
  const hasDefaultSource = currentDefaultSource !== undefined;
  const bindingControls = frontend.getInputBindingByIds(blockId, portId as PortId)?.controls ?? [];

  const handleSourceClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (connectedEdge) {
      selection.selectBlock(connectedEdge.from.blockId as BlockId);
    }
  }, [connectedEdge]);

  return (
    <li
      onClick={onClick}
      style={{
        marginBottom: '8px',
        fontSize: '13px',
        padding: '8px',
        background: colors.bgPanel,
        borderRadius: '4px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{port.label}</strong>
          <span style={{ color: colors.textSecondary }}> ({formatValueType(port.type!)})</span>
        </div>
        <span style={{ fontSize: '11px', color: colors.textMuted }}>→</span>
      </div>
      {isConnected && connectedEdge && (
        <div style={{
          marginTop: '4px',
          fontSize: '12px',
          color: colors.primary,
          fontFamily: "'Courier New', monospace"
        }}>
          ←{' '}
          <span
            onClick={handleSourceClick}
            style={{ textDecoration: 'underline', cursor: 'pointer' }}
          >
            {connectedEdge.from.blockId}
          </span>
          .{connectedEdge.from.slotId}
        </div>
      )}
      {!isConnected && hasDefaultSource && (
        <div style={{
          marginTop: '4px',
          fontSize: '12px',
          color: colors.textSecondary
        }}>
          <span style={{ color: colors.textMuted }}>(not connected)</span>
          {currentDefaultSource && isConstLiteralDefaultSource(currentDefaultSource) && bindingControls[0] ? (
            <DefaultSourceEditor
              control={bindingControls[0]}
              portLabel={port.label || ""}
            />
          ) : (
            <div style={{
              fontStyle: currentDefaultSource && isTimeDefaultSource(currentDefaultSource) ? 'italic' : 'normal',
              color: currentDefaultSource && isTimeDefaultSource(currentDefaultSource) ? colors.primary : colors.textSecondary
            }}>
              Default: {currentDefaultSource ? formatDefaultSourceLabel(currentDefaultSource) : 'None'}
            </div>
          )}
        </div>
      )}
      {!isConnected && !hasDefaultSource && (
        <div style={{
          marginTop: '4px',
          fontSize: '12px',
          color: colors.textMuted
        }}>
          (not connected)
        </div>
      )}
    </li>
  );
};

// =============================================================================
// Default Source Editor
// =============================================================================

interface DefaultSourceEditorProps {
  control: BindingControlDescriptor;
  portLabel: string;
}

const DefaultSourceEditor = function DefaultSourceEditor({
  control,
  portLabel
}: DefaultSourceEditorProps) {
  const { patch: patchStore } = useStores();
  const value = control.value;
  const [localValue, setLocalValue] = useState(String(value));

  // Sync local value when prop changes
  React.useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleBlur = useCallback(() => {
    const parsed = typeof value === 'number' ? parseFloat(localValue) : localValue;

    if (typeof value === 'number') {
      if (!isNaN(parsed as number) && parsed !== value) {
        patchStore.updateControlValue(control.target, parsed);
      } else if (isNaN(parsed as number)) {
        setLocalValue(String(value));
      }
    } else {
      if (parsed !== value) {
        patchStore.updateControlValue(control.target, parsed);
      }
    }
  }, [control.target, localValue, patchStore, value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setLocalValue(String(value));
      (e.target as HTMLInputElement).blur();
    }
  }, [value]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div style={{ marginTop: '4px' }}>
      <label
        style={{
          fontSize: '11px',
          color: colors.textMuted,
          display: 'block',
          marginBottom: '2px'
        }}
      >
        Default value:
      </label>
      <input
        type={typeof value === 'number' ? 'number' : 'text'}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        step={typeof value === 'number' ? 0.01 : undefined}
        placeholder={portLabel}
        style={{
          width: '100%',
          padding: '4px 6px',
          fontSize: '12px',
          background: colors.bgContent,
          border: `1px solid ${colors.border}`,
          borderRadius: '3px',
          color: colors.textPrimary,
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
};

interface OutputPortItemProps {
  port: OutputDef;
  edges: Edge[];
  patch: Patch;
  onClick: () => void;
}

function OutputPortItem({ port, edges, patch, onClick }: OutputPortItemProps) {
  const { selection } = useStores();
  return (
    <li
      onClick={onClick}
      style={{
        marginBottom: '8px',
        fontSize: '13px',
        padding: '8px',
        background: colors.bgPanel,
        borderRadius: '4px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{port.label}</strong>
          <span style={{ color: colors.textSecondary }}> ({formatValueType(port.type!)})</span>
        </div>
        <span style={{ fontSize: '11px', color: colors.textMuted }}>→</span>
      </div>
      {edges.length > 0 && (
        <div style={{
          marginTop: '4px',
          fontSize: '12px',
          color: colors.primary,
          fontFamily: "'Courier New', monospace"
        }}>
          {edges.map((edge, idx) => (
            <div
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                selection.selectBlock(edge.to.blockId as BlockId);
              }}
              style={{ cursor: 'pointer' }}
            >
              →{' '}
              <span style={{ textDecoration: 'underline' }}>
                {edge.to.blockId}
              </span>
              .{edge.to.slotId}
            </div>
          ))}
        </div>
      )}
      {edges.length === 0 && (
        <div style={{
          marginTop: '4px',
          fontSize: '12px',
          color: colors.textMuted
        }}>
          (not connected)
        </div>
      )}
    </li>
  );
}

// =============================================================================
// Port Inspector (Sub-view)
// =============================================================================

interface PortInspectorProps {
  portRef: PortEndpointRef;
  block: Block;
  typeInfo: AnyBlockDef;
  patch: Patch;
  onBack: () => void;
}

const backButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  padding: '4px 8px',
  color: colors.textPrimary,
  cursor: 'pointer',
  fontSize: '12px',
};


function PortInspector({ portRef, block, typeInfo, patch, onBack }: PortInspectorProps) {
  const { selection, frontend } = useStores();
  // Find port definition
  const inputPort = typeInfo.inputs[portRef.portId];
  const outputPort = typeInfo.outputs[portRef.portId];
  const port = inputPort || outputPort;
  const isInput = !!inputPort;

  if (!port) {
    return (
      <div>
        <button onClick={onBack} style={backButtonStyle}>← Back</button>
        <p style={{ color: colors.error }}>Port not found: {portRef.portId}</p>
      </div>
    );
  }

  // Get connections
  const incomingEdges = isInput
    ? patch.edges.filter(e => e.to.blockId === block.id && e.to.slotId === portRef.portId)
    : [];
  const outgoingEdges = !isInput
    ? patch.edges.filter(e => e.from.blockId === block.id && e.from.slotId === portRef.portId)
    : [];

  const isConnected = incomingEdges.length > 0;

  // Get effective default source (port override or registry default)
  const instancePort = block.inputPorts.get(portRef.portId);
  const effectiveDefaultSource = isInput && inputPort
    ? effectiveInputDefaultSource(block, portRef.portId, inputPort)
    : undefined;
  const binding = isInput
    ? frontend.getInputBindingByIds(block.id, portRef.portId as PortId)
    : undefined;

  return (
    <div>
      <button onClick={onBack} style={backButtonStyle}>← Back</button>

      <div style={{
        padding: '8px 12px',
        background: isInput ? '#3b82f622' : '#f9731622',
        borderRadius: '4px',
        marginBottom: '16px',
        marginTop: '16px',
        fontSize: '12px',
        fontWeight: '600',
        color: isInput ? '#3b82f6' : '#f97316'
      }}>
        [{isInput ? 'INPUT' : 'OUTPUT'} PORT]
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>{port.label}</h3>
      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>
        {portRef.portId}
      </p>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Port Type
        </h4>
        <div style={{
          padding: '8px',
          background: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '13px',
        }}>
          {formatValueType(port.type!)}
        </div>
      </div>

      {isInput && inputPort && (
        <>
          {/* Show default source editor for ALL input ports - whether connected or not */}
          {effectiveDefaultSource && (
            <PortDefaultSourceEditor
              blockId={block.id}
              portId={portRef.portId}
              currentDefaultSource={effectiveDefaultSource}
              registryDefaultSource={inputPort.defaultSource}
              isConnected={isConnected}
            />
          )}
          {binding && binding.controls.length > 0 && (
            <BindingControlsSection controls={binding.controls} />
          )}
        </>
      )}

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Connections
        </h4>
        {isInput && incomingEdges.length === 0 && (
          <div style={{ color: colors.textMuted, fontSize: '13px' }}>Not connected</div>
        )}
        {isInput && incomingEdges.map((edge, idx) => {
          const sourceBlock = patch.blocks.get(edge.from.blockId as BlockId);
          return (
            <div
              key={idx}
              onClick={() => selection.selectBlock(edge.from.blockId as BlockId)}
              style={{
                padding: '8px',
                background: colors.bgPanel,
                borderRadius: '4px',
                marginBottom: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              ←{' '}
              <span style={{ color: colors.primary, textDecoration: 'underline' }}>
                {sourceBlock?.displayName || sourceBlock?.type || edge.from.blockId}
              </span>
              <span style={{ color: colors.textSecondary }}>.{edge.from.slotId}</span>
            </div>
          );
        })}
        {!isInput && outgoingEdges.length === 0 && (
          <div style={{ color: colors.textMuted, fontSize: '13px' }}>Not connected</div>
        )}
        {!isInput && outgoingEdges.map((edge, idx) => {
          const targetBlock = patch.blocks.get(edge.to.blockId as BlockId);
          return (
            <div
              key={idx}
              onClick={() => selection.selectBlock(edge.to.blockId as BlockId)}
              style={{
                padding: '8px',
                background: colors.bgPanel,
                borderRadius: '4px',
                marginBottom: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              →{' '}
              <span style={{ color: colors.primary, textDecoration: 'underline' }}>
                {targetBlock?.displayName || targetBlock?.type || edge.to.blockId}
              </span>
              <span style={{ color: colors.textSecondary }}>.{edge.to.slotId}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// =============================================================================
// Port Default Source Editor
// =============================================================================

interface PortDefaultSourceEditorProps {
  blockId: BlockId;
  portId: string;
  currentDefaultSource: DefaultSource;
  registryDefaultSource?: DefaultSource;
  isConnected?: boolean;
}

const PortDefaultSourceEditor = observer(function PortDefaultSourceEditor({
  blockId,
  portId,
  currentDefaultSource,
  registryDefaultSource,
  isConnected,
}: PortDefaultSourceEditorProps) {
  const { patch: patchStore } = useStores();

  const validBlockTypes = useMemo(
    () => getValidDefaultSourceBlockTypes(patchStore.patch, blockId, portId as PortId),
    [patchStore.patch, blockId, portId],
  );

  // Current selection
  const currentBlockType = currentDefaultSource.blockType;
  const currentOutputPort = currentDefaultSource.output;
  const currentParams = currentDefaultSource.params || {};

  const handleBlockTypeChange = useCallback((newBlockType: string) => {
    const blockDef = BLOCK_DEFS_BY_TYPE.get(newBlockType);
    if (!blockDef) return;

    // Use first output port as default
    const firstOutputEntry = Object.entries(blockDef.outputs)[0];
    if (!firstOutputEntry) return;
    const [outputId, firstOutput] = firstOutputEntry;

    // Create new default source with default params from block definition
    const newDefaultSource: DefaultSource = {
      blockType: newBlockType,
      output: outputId,
      params: {},
    };

    patchStore.updateInputPort(blockId, portId, { defaultSource: newDefaultSource });
  }, [blockId, portId]);

  const handleOutputPortChange = useCallback((newOutputPort: string) => {
    const newDefaultSource: DefaultSource = {
      ...currentDefaultSource,
      output: newOutputPort,
    };

    patchStore.updateInputPort(blockId, portId, { defaultSource: newDefaultSource });
  }, [blockId, portId, currentDefaultSource]);

  const handleReset = useCallback(() => {
    if (registryDefaultSource) {
      // Reset to registry default by removing the override
      patchStore.updateInputPort(blockId, portId, { defaultSource: undefined });
    }
  }, [blockId, portId, registryDefaultSource]);

  const currentBlockDef = BLOCK_DEFS_BY_TYPE.get(currentBlockType);
  const hasOverride = registryDefaultSource && (
    currentBlockType !== registryDefaultSource.blockType ||
    currentOutputPort !== registryDefaultSource.output ||
    JSON.stringify(currentParams) !== JSON.stringify(registryDefaultSource.params || {})
  );

  // [LAW:one-source-of-truth] Time-source handling is keyed by block capability, not type string aliasing.
  const isTimeRootBlock = currentBlockDef?.capability === 'time';
  const timeRootOutputs = currentBlockDef ? Object.keys(currentBlockDef.outputs) : [];

  return (
    <div style={{ marginBottom: '16px', opacity: isConnected ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', color: colors.textSecondary }}>
          Default Source {isConnected && <span style={{ fontSize: '11px', fontWeight: 'normal' }}>(inactive - port connected)</span>}
        </h4>
        {hasOverride && (
          <button
            onClick={handleReset}
            style={{
              ...backButtonStyle,
              fontSize: '11px',
              padding: '2px 6px',
            }}
            title="Reset to registry default"
          >
            Reset
          </button>
        )}
      </div>

      {/* Block Type Selector - ALWAYS visible */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
          Block Type
        </label>
        <MuiSelectInput
          value={currentBlockType}
          onChange={handleBlockTypeChange}
          options={validBlockTypes.map(bt => ({ value: bt.blockType, label: bt.label || "" }))}
          size="sm"
        />
      </div>

      {/* Time source block - Output Selector */}
      {isTimeRootBlock && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
            Output
          </label>
          <MuiSelectInput
            value={currentOutputPort}
            onChange={handleOutputPortChange}
            options={timeRootOutputs.map(out => ({ value: out, label: out || "" }))}
            size="sm"
          />
        </div>
      )}

      {/* Other Blocks - Output Port Selector */}
      {!isTimeRootBlock && (
        <>
          {/* Output Port Selector */}
          {currentBlockDef && Object.keys(currentBlockDef.outputs).length > 1 && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
                Output Port
              </label>
              <MuiSelectInput
                value={currentOutputPort}
                onChange={handleOutputPortChange}
                options={Object.entries(currentBlockDef.outputs).map(([outId, out]) => ({ value: outId, label: out.label || "" }))}
                size="sm"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
});

function BindingControlsSection({ controls }: { controls: readonly BindingControlDescriptor[] }) {
  return (
    <div style={{ marginTop: '12px' }}>
      <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
        Binding Controls
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {controls.map((control) => (
          <SemanticControlField key={control.id} control={control} />
        ))}
      </div>
    </div>
  );
}

function SemanticControlField({ control }: { control: BindingControlDescriptor }) {
  const { patch } = useStores();
  const handleChange = useCallback((value: unknown) => {
    patch.updateControlValue(control.target, value);
  }, [control.target, patch]);

  return (
    <DefaultSourceParamField
      paramKey={control.id}
      paramLabel={control.label}
      value={control.value}
      uiHint={control.hint}
      onChange={handleChange}
    />
  );
}

// =============================================================================
// Default Source Param Field
// =============================================================================

interface DefaultSourceParamFieldProps {
  paramKey: string;
  paramLabel: string;
  value: unknown;
  uiHint?: UIControlHint;
  onChange: (value: unknown) => void;
}

const DefaultSourceParamField = function DefaultSourceParamField({
  paramKey,
  paramLabel,
  value,
  uiHint,
  onChange,
}: DefaultSourceParamFieldProps) {
  // Render based on uiHint or inferred type
  if (uiHint) {
    return (
      <div>
        <label style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '2px' }}>
          {paramLabel}
        </label>
        <HintedControl hint={uiHint} value={value} onChange={onChange} />
      </div>
    );
  }

  // Infer control from value type
  if (typeof value === 'boolean') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <MuiCheckboxInput
          checked={value}
          onChange={onChange}
          label={paramLabel}
        />
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div>
        <MuiNumberInput
          value={value}
          onChange={onChange}
          label={paramLabel}
          size="sm"
        />
      </div>
    );
  }

  if (typeof value === 'string') {
    return (
      <div>
        <MuiTextInput
          value={value}
          onChange={onChange}
          label={paramLabel}
          size="sm"
        />
      </div>
    );
  }

  // Fallback: text input
  return (
    <div>
      <MuiTextInput
        value={String(value ?? '')}
        onChange={onChange}
        label={paramLabel}
        size="sm"
      />
    </div>
  );
};


// =============================================================================
// Params Editor
// =============================================================================

interface ParamsEditorProps {
  block: Block;
  typeInfo: AnyBlockDef;
  patch: Patch;
}

const ParamsEditor = function ParamsEditor({ block, typeInfo, patch }: ParamsEditorProps) {
  const params = block.params || {};
  const paramKeys = Object.keys(params);

  // Filter out params that shouldn't be shown in the inspector
  const editableParams = paramKeys.filter(key => {
    // Hide payloadType - it's set by normalizer
    if (key === 'payloadType') return false;
    // Hide params that are exposed as ports — those are already editable
    // on the node via DefaultSourceControl (single source of truth)
    const inputDef = typeInfo.inputs[key];
    if (inputDef && inputDef.exposedAsPort !== false) return false;
    return true;
  });

  if (editableParams.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
        Configuration
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {editableParams.map(key => (
          <ParamField
            key={key}
            blockId={block.id}
            paramKey={key}
            value={params[key]}
            typeInfo={typeInfo}
            patch={patch}
          />
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// =============================================================================
// Expression Editor (for Expression DSL blocks)
// =============================================================================

interface ExpressionEditorProps {
  blockId: BlockId;
  value: string;
  patch: Patch;
}

const ExpressionEditor = function ExpressionEditor({ blockId, value, patch }: ExpressionEditorProps) {
  return (
    <SharedExpressionEditor
      blockId={blockId}
      value={value}
      patch={patch}
      showPopOutButton
      maxLength={4000}
    />
  );
};


// Individual Param Field
// =============================================================================

interface ParamFieldProps {
  blockId: BlockId;
  paramKey: string;
  value: unknown;
  typeInfo: AnyBlockDef;
  patch: Patch;
}

const ParamField = function ParamField({ blockId, paramKey, value, typeInfo, patch }: ParamFieldProps) {
  const { patch: patchStore } = useStores();
  if (getBlockParamEditor(typeInfo, paramKey).kind === 'expression-editor') {
    return <ExpressionEditor blockId={blockId} value={String(value ?? '')} patch={patch} />;
  }

  // Find uiHint if this param corresponds to an input
  const inputDef = typeInfo.inputs[paramKey];
  const uiHint = inputDef?.uiHint;

  const handleChange = useCallback((newValue: unknown) => {
    patchStore.updateBlockParams(blockId, { [paramKey]: newValue });
  }, [blockId, paramKey]);

  // Render based on uiHint or inferred type
  // Only use numeric hints (slider/int/float) when value is actually a number
  const hintIsNumeric = uiHint && (uiHint.kind === 'slider' || uiHint.kind === 'int' || uiHint.kind === 'float');
  const useHint = uiHint && (!hintIsNumeric || typeof value === 'number');
  if (useHint) {
    return (
      <div>
        <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
          {paramKey}
        </label>
        <HintedControl hint={uiHint!} value={value} onChange={handleChange} />
      </div>
    );
  }

  // Infer control from value type
  if (typeof value === 'boolean') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <MuiCheckboxInput
          checked={value}
          onChange={handleChange}
          label={paramKey}
        />
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div>
        <MuiNumberInput
          value={value}
          onChange={handleChange}
          label={paramKey}
          size="sm"
        />
      </div>
    );
  }

  if (typeof value === 'string') {
    return (
      <div>
        <MuiTextInput
          value={value}
          onChange={handleChange}
          label={paramKey}
          size="sm"
        />
      </div>
    );
  }

  // Object/array - show as JSON for now
  if (typeof value === 'object' && value !== null) {
    return (
      <div>
        <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
          {paramKey}
        </label>
        <pre style={{
          margin: 0,
          padding: '8px',
          backgroundColor: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '11px',
          overflow: 'auto',
        }}>
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    );
  }

  // Fallback: text input
  return (
    <div>
      <MuiTextInput
        value={String(value ?? '')}
        onChange={handleChange}
        label={paramKey}
        size="sm"
      />
    </div>
  );
};

// =============================================================================
// Control Components
// =============================================================================

interface HintedControlProps {
  hint: UIControlHint;
  value: unknown;
  onChange: (value: unknown) => void;
}

function HintedControl({ hint, value, onChange }: HintedControlProps) {
  switch (hint.kind) {
    case 'slider':
      return (
        <SliderWithInput
          label=""
          value={value as number}
          min={hint.min}
          max={hint.max}
          step={hint.step}
          onChange={onChange}
        />
      );
    case 'int':
      return (
        <SliderWithInput
          label=""
          value={value as number}
          min={hint.min ?? 0}
          max={hint.max ?? 10000}
          step={hint.step ?? 1}
          onChange={onChange}
        />
      );
    case 'float':
      return (
        <SliderWithInput
          label=""
          value={value as number}
          min={hint.min ?? 0}
          max={hint.max ?? 1}
          step={hint.step ?? 0.01}
          onChange={onChange}
        />
      );
    case 'select': {
      const options = hint.options;
      return (
        <MuiSelectInput
          value={String(value)}
          onChange={onChange}
          options={options}
          size="sm"
        />
      );
    }
    case 'boolean':
      return (
        <MuiCheckboxInput
          checked={!!value}
          onChange={onChange}
        />
      );
    case 'color':
      return (
        <MuiColorInput
          value={String(value || '#000000')}
          onChange={onChange}
        />
      );
    case 'text':
      return (
        <MuiTextInput
          value={String(value ?? '')}
          onChange={onChange}
          size="sm"
        />
      );
    case 'xy': {
      const xy = value as { x?: number; y?: number } | undefined;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <SliderWithInput
            label="X"
            value={xy?.x ?? 0}
            min={-1000}
            max={1000}
            step={1}
            onChange={(v) => onChange({ ...xy, x: v })}
          />
          <SliderWithInput
            label="Y"
            value={xy?.y ?? 0}
            min={-1000}
            max={1000}
            step={1}
            onChange={(v) => onChange({ ...xy, y: v })}
          />
        </div>
      );
    }
    default:
      return (
        <MuiTextInput
          value={String(value ?? '')}
          onChange={onChange}
          size="sm"
        />
      );
  }
}
