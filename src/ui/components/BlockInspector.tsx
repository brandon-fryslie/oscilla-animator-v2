/**
 * Block Inspector Component (React)
 *
 * Detailed view of selected block OR block type preview.
 * Shows ports, connections, parameters, and default sources.
 * Supports editing of displayName and block params.
 */

import React, { useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../stores';
import { colors } from '../theme';
import { getBlockDefinition, type BlockDef, type InputDef, type OutputDef, BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';
import './BlockInspector.css';
import type { Block, Patch, Edge, PortRef } from '../../graph/Patch';
import type { BlockId, PortId, DefaultSource, UIControlHint } from '../../types';
import type { SignalType } from '../../core/canonical-types';
import {
  NumberInput as MuiNumberInput,
  TextInput as MuiTextInput,
  SelectInput as MuiSelectInput,
  CheckboxInput as MuiCheckboxInput,
  ColorInput as MuiColorInput,
  SliderWithInput,
} from './common';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a SignalType for display.
 */
function formatSignalType(type: SignalType): string {
  return type.payload;
}

/**
 * Format a DefaultSource for display.
 */
function formatDefaultSource(source: DefaultSource): string {
  if (source.blockType === 'TimeRoot') {
    return `TimeRoot.${source.output}`;
  }
  if (source.blockType === 'Const' && source.params?.value !== undefined) {
    return `${JSON.stringify(source.params.value)}`;
  }
  return `${source.blockType}.${source.output}`;
}

/**
 * Generate the deterministic ID for a derived default source block.
 * Must match the pattern in pass1-default-sources.ts
 */
function getDerivedDefaultSourceId(blockId: BlockId, portId: string): BlockId {
  return `_ds_${blockId}_${portId}` as BlockId;
}

/**
 * Get valid block types for use as default sources.
 * A valid default source block:
 * - Must NOT be stateful (capability !== 'state')
 * - Must have at least one output
 */
function getValidDefaultSourceBlockTypes(portType: SignalType): { blockType: string; label: string; outputs: readonly OutputDef[] }[] {
  const validBlocks: { blockType: string; label: string; outputs: readonly OutputDef[] }[] = [];

  for (const [blockType, def] of BLOCK_DEFS_BY_TYPE.entries()) {
    // Skip stateful blocks
    if (def.capability === 'state') continue;

    // Must have at least one output
    if (def.outputs.length === 0) continue;

    // For now, include all non-stateful blocks with outputs
    // Type compatibility checking is simplified - '???' payload is polymorphic
    validBlocks.push({
      blockType: def.type,
      label: def.label,
      outputs: def.outputs,
    });
  }

  // Sort by label for easier selection
  return validBlocks.sort((a, b) => a.label.localeCompare(b.label));
}


// =============================================================================
// Main Inspector Component
// =============================================================================

/**
 * Block Inspector component.
 */
export const BlockInspector = observer(function BlockInspector() {
  const { previewType, selectedBlockId, selectedEdgeId, selectedPort } = rootStore.selection;
  const patch = rootStore.patch.patch;

  // Determine content based on selection state
  let content: React.ReactNode;

  // Preview mode takes precedence
  if (previewType) {
    content = <TypePreview type={previewType} />;
  } else if (selectedPort && patch) {
    // Port selection mode
    const block = patch.blocks.get(selectedPort.blockId as BlockId);
    const blockDef = block ? getBlockDefinition(block.type) : null;
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


// =============================================================================
// Port Inspector Panel (Top-Level)
// =============================================================================

interface PortInspectorStandaloneProps {
  portRef: PortRef;
  block: Block;
  blockDef: BlockDef;
  patch: Patch;
}

function PortInspectorStandalone({ portRef, block, blockDef, patch }: PortInspectorStandaloneProps) {
  const inputDef = blockDef.inputs.find(p => p.id === portRef.portId);
  const outputDef = blockDef.outputs.find(p => p.id === portRef.portId);
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

  const handleViewBlock = useCallback(() => {
    rootStore.selection.selectBlock(block.id);
  }, [block.id]);

  const handleDisconnect = useCallback((edgeId: string) => {
    rootStore.patch.removeEdge(edgeId);
  }, []);

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
          Signal Type
        </h4>
        <div style={{
          padding: '8px',
          background: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '13px',
        }}>
          {formatSignalType(portDef.type)}
        </div>
      </div>

      {isInput && inputDef && inputDef.defaultSource && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
            Default Source
          </h4>
          <div style={{
            padding: '8px',
            background: colors.bgPanel,
            borderRadius: '4px',
            fontSize: '13px',
            fontStyle: inputDef.defaultSource.blockType === 'TimeRoot' ? 'italic' : 'normal',
            color: inputDef.defaultSource.blockType === 'TimeRoot' ? colors.primary : colors.textPrimary,
          }}>
            {formatDefaultSource(inputDef.defaultSource)}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          {isInput ? 'Connection' : `Connections (${connectedEdges.length})`}
        </h4>

        {connectedEdges.length === 0 && (
          <div style={{ color: colors.textMuted, fontSize: '13px' }}>
            Not connected
          </div>
        )}

        {isInput && connectedEdges.map((edge, idx) => {
          const sourceBlock = patch.blocks.get(edge.from.blockId as BlockId);
          return (
            <div key={idx} style={{ marginBottom: '8px' }}>
              <div
                onClick={() => rootStore.selection.selectBlock(edge.from.blockId as BlockId)}
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
              onClick={() => rootStore.selection.selectBlock(edge.to.blockId as BlockId)}
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
}


// =============================================================================
// Edge Inspector
// =============================================================================

interface EdgeInspectorProps {
  edge: Edge;
  patch: Patch;
}

function EdgeInspector({ edge, patch }: EdgeInspectorProps) {
  const sourceBlock = patch.blocks.get(edge.from.blockId as BlockId);
  const targetBlock = patch.blocks.get(edge.to.blockId as BlockId);

  const handleSourceClick = useCallback(() => {
    rootStore.selection.selectBlock(edge.from.blockId as BlockId);
  }, [edge.from.blockId]);

  const handleTargetClick = useCallback(() => {
    rootStore.selection.selectBlock(edge.to.blockId as BlockId);
  }, [edge.to.blockId]);

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
        [EDGE]
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Source
        </h4>
        <div
          onClick={handleSourceClick}
          style={{
            padding: '8px 12px',
            background: colors.bgPanel,
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          <span style={{ color: colors.primary, textDecoration: 'underline' }}>
            {sourceBlock?.displayName || sourceBlock?.type || edge.from.blockId}
          </span>
          <span style={{ color: colors.textSecondary }}>.{edge.from.slotId}</span>
        </div>
      </div>

      <div style={{ marginBottom: '16px', textAlign: 'center', color: colors.textSecondary }}>
        ↓
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Target
        </h4>
        <div
          onClick={handleTargetClick}
          style={{
            padding: '8px 12px',
            background: colors.bgPanel,
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          <span style={{ color: colors.primary, textDecoration: 'underline' }}>
            {targetBlock?.displayName || targetBlock?.type || edge.to.blockId}
          </span>
          <span style={{ color: colors.textSecondary }}>.{edge.to.slotId}</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Type Preview (from library)
// =============================================================================

interface TypePreviewProps {
  type: string;
}

function TypePreview({ type }: TypePreviewProps) {
  const typeInfo = getBlockDefinition(type);

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
          {typeInfo.inputs.map((input) => {
            const hasDefaultSource = input.defaultSource !== undefined;
            return (
              <li key={input.id} style={{ marginBottom: '8px', fontSize: '13px' }}>
                <div>
                  <strong>{input.label}</strong>: {formatSignalType(input.type)}
                  {input.optional && (
                    <span style={{ color: colors.textSecondary }}> (optional)</span>
                  )}
                </div>
                {hasDefaultSource && (
                  <div style={{
                    marginLeft: '16px',
                    fontSize: '12px',
                    color: colors.textSecondary,
                    fontStyle: input.defaultSource?.blockType === 'TimeRoot' ? 'italic' : 'normal'
                  }}>
                    Default: {formatDefaultSource(input.defaultSource!)}
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
          {typeInfo.outputs.map((output) => (
            <li key={output.id} style={{ marginBottom: '4px', fontSize: '13px' }}>
              <strong>{output.label}</strong>: {formatSignalType(output.type)}
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

const BlockDetails = observer(function BlockDetails({ block, patch }: BlockDetailsProps) {
  const typeInfo = getBlockDefinition(block.type);
  const [selectedPort, setSelectedPort] = useState<PortRef | null>(null);

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
      <DisplayNameEditor block={block} typeInfo={typeInfo} />

      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>
        {typeInfo.type}
      </p>

      {/* Inputs */}
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Inputs
        </h4>
        <ul style={{ margin: 0, paddingLeft: '0', listStyle: 'none' }}>
          {typeInfo.inputs.map((port) => {
            const isConnected = connectedInputPorts.has(port.id);
            const connectedEdge = incomingEdges.find(e => e.to.slotId === port.id);

            return (
              <PortItem
                key={port.id}
                port={port}
                kind="input"
                blockId={block.id}
                isConnected={isConnected}
                connectedEdge={connectedEdge}
                patch={patch}
                onClick={() => setSelectedPort({ blockId: block.id, portId: port.id as PortId })}
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
          {typeInfo.outputs.map((port) => {
            const portEdges = outgoingEdges.filter(e => e.from.slotId === port.id);

            return (
              <OutputPortItem
                key={port.id}
                port={port}
                edges={portEdges}
                patch={patch}
                onClick={() => setSelectedPort({ blockId: block.id, portId: port.id as PortId })}
              />
            );
          })}
        </ul>
      </div>

      {/* Editable Parameters */}
      <ParamsEditor block={block} typeInfo={typeInfo} />
    </div>
  );
});

// =============================================================================
// Display Name Editor
// =============================================================================

interface DisplayNameEditorProps {
  block: Block;
  typeInfo: BlockDef;
}

const DisplayNameEditor = observer(function DisplayNameEditor({ block, typeInfo }: DisplayNameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(block.displayName || '');

  const handleDoubleClick = useCallback(() => {
    setEditValue(block.displayName || '');
    setIsEditing(true);
  }, [block.displayName]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    const newName = editValue.trim() || null;
    if (newName !== block.displayName) {
      rootStore.patch.updateBlockDisplayName(block.id, newName);
    }
  }, [block.id, block.displayName, editValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setEditValue(block.displayName || '');
      setIsEditing(false);
    }
  }, [block.displayName]);

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        placeholder={typeInfo.label}
        style={{
          margin: '0 0 8px',
          fontSize: '18px',
          fontWeight: 'bold',
          background: colors.bgPanel,
          border: `1px solid ${colors.primary}`,
          borderRadius: '4px',
          padding: '4px 8px',
          color: colors.textPrimary,
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <h3
      onDoubleClick={handleDoubleClick}
      style={{
        margin: '0 0 8px',
        fontSize: '18px',
        cursor: 'pointer',
      }}
      title="Double-click to edit"
    >
      {block.displayName || typeInfo.label}
    </h3>
  );
});

// =============================================================================
// Port Items
// =============================================================================

interface PortItemProps {
  port: InputDef;
  kind: 'input';
  blockId: BlockId;
  isConnected: boolean;
  connectedEdge?: Edge;
  patch: Patch;
  onClick: () => void;
}

const PortItem = observer(function PortItem({ port, blockId, isConnected, connectedEdge, patch, onClick }: PortItemProps) {
  const hasDefaultSource = port.defaultSource !== undefined;

  const handleSourceClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (connectedEdge) {
      rootStore.selection.selectBlock(connectedEdge.from.blockId as BlockId);
    }
  }, [connectedEdge]);

  // Find the derived default source block if it exists
  const derivedBlockId = hasDefaultSource && !isConnected
    ? getDerivedDefaultSourceId(blockId, port.id)
    : null;

  const derivedBlock = derivedBlockId ? patch.blocks.get(derivedBlockId) : undefined;

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
          <span style={{ color: colors.textSecondary }}> ({formatSignalType(port.type)})</span>
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
          {port.defaultSource!.blockType === 'Const' && derivedBlock ? (
            <DefaultSourceEditor
              derivedBlockId={derivedBlockId!}
              value={derivedBlock.params.value}
              portLabel={port.label}
            />
          ) : (
            <div style={{
              fontStyle: port.defaultSource?.blockType === 'TimeRoot' ? 'italic' : 'normal',
              color: port.defaultSource?.blockType === 'TimeRoot' ? colors.primary : colors.textSecondary
            }}>
              Default: {formatDefaultSource(port.defaultSource!)}
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
});

// =============================================================================
// Default Source Editor
// =============================================================================

interface DefaultSourceEditorProps {
  derivedBlockId: BlockId;
  value: unknown;
  portLabel: string;
}

const DefaultSourceEditor = observer(function DefaultSourceEditor({
  derivedBlockId,
  value,
  portLabel
}: DefaultSourceEditorProps) {
  const [localValue, setLocalValue] = useState(String(value));

  // Sync local value when prop changes
  React.useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleBlur = useCallback(() => {
    const parsed = typeof value === 'number' ? parseFloat(localValue) : localValue;

    if (typeof value === 'number') {
      if (!isNaN(parsed as number) && parsed !== value) {
        rootStore.patch.updateBlockParams(derivedBlockId, { value: parsed });
      } else if (isNaN(parsed as number)) {
        setLocalValue(String(value));
      }
    } else {
      if (parsed !== value) {
        rootStore.patch.updateBlockParams(derivedBlockId, { value: parsed });
      }
    }
  }, [localValue, value, derivedBlockId]);

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
});

interface OutputPortItemProps {
  port: OutputDef;
  edges: Edge[];
  patch: Patch;
  onClick: () => void;
}

function OutputPortItem({ port, edges, patch, onClick }: OutputPortItemProps) {
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
          <span style={{ color: colors.textSecondary }}> ({formatSignalType(port.type)})</span>
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
                rootStore.selection.selectBlock(edge.to.blockId as BlockId);
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
  portRef: PortRef;
  block: Block;
  typeInfo: BlockDef;
  patch: Patch;
  onBack: () => void;
}

function PortInspector({ portRef, block, typeInfo, patch, onBack }: PortInspectorProps) {
  // Find port definition
  const inputPort = typeInfo.inputs.find(p => p.id === portRef.portId);
  const outputPort = typeInfo.outputs.find(p => p.id === portRef.portId);
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
          Signal Type
        </h4>
        <div style={{
          padding: '8px',
          background: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '13px',
        }}>
          {formatSignalType(port.type)}
        </div>
      </div>

      {isInput && inputPort && (
        <>
          {inputPort.optional && (
            <div style={{ marginBottom: '16px', fontSize: '12px', color: colors.textSecondary }}>
              Optional port
            </div>
          )}

          {inputPort.defaultSource && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
                Default Source
              </h4>
              <div style={{
                padding: '8px',
                background: colors.bgPanel,
                borderRadius: '4px',
                fontSize: '13px',
                fontStyle: inputPort.defaultSource.blockType === 'TimeRoot' ? 'italic' : 'normal',
                color: inputPort.defaultSource.blockType === 'TimeRoot' ? colors.primary : colors.textPrimary,
              }}>
                {formatDefaultSource(inputPort.defaultSource)}
              </div>
            </div>
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
              onClick={() => rootStore.selection.selectBlock(edge.from.blockId as BlockId)}
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
              onClick={() => rootStore.selection.selectBlock(edge.to.blockId as BlockId)}
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

const backButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  padding: '4px 8px',
  color: colors.textPrimary,
  cursor: 'pointer',
  fontSize: '12px',
};

// =============================================================================
// Params Editor
// =============================================================================

interface ParamsEditorProps {
  block: Block;
  typeInfo: BlockDef;
}

const ParamsEditor = observer(function ParamsEditor({ block, typeInfo }: ParamsEditorProps) {
  const params = block.params || {};
  const paramKeys = Object.keys(params);

  // Filter out internal params that shouldn't be shown
  const editableParams = paramKeys.filter(key => {
    // Hide payloadType - it's set by normalizer
    if (key === 'payloadType') return false;
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
          />
        ))}
      </div>
    </div>
  );
});

// =============================================================================
// Individual Param Field
// =============================================================================

interface ParamFieldProps {
  blockId: BlockId;
  paramKey: string;
  value: unknown;
  typeInfo: BlockDef;
}

const ParamField = observer(function ParamField({ blockId, paramKey, value, typeInfo }: ParamFieldProps) {
  // Find uiHint if this param corresponds to an input
  const inputDef = typeInfo.inputs.find(i => i.id === paramKey);
  const uiHint = inputDef?.uiHint;

  const handleChange = useCallback((newValue: unknown) => {
    rootStore.patch.updateBlockParams(blockId, { [paramKey]: newValue });
  }, [blockId, paramKey]);

  // Render based on uiHint or inferred type
  if (uiHint) {
    return (
      <div>
        <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
          {paramKey}
        </label>
        <HintedControl hint={uiHint} value={value} onChange={handleChange} />
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
          size="small"
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
          size="small"
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
        size="small"
      />
    </div>
  );
});

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
      const options = (hint as any).options as { value: string; label: string }[];
      return (
        <MuiSelectInput
          value={String(value)}
          onChange={onChange}
          options={options}
          size="small"
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
          size="small"
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
          size="small"
        />
      );
  }
}
