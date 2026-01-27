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
import { getBlockDefinition, type BlockDef, type InputDef, type OutputDef, BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';
import './BlockInspector.css';
import type { Block, Patch, Edge, PortRef } from '../../graph/Patch';
import type { BlockId, PortId, DefaultSource, UIControlHint } from '../../types';
import type { CombineMode } from '../../types';
import type { SignalType } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../../core/canonical-types';
import {
  NumberInput as MuiNumberInput,
  TextInput as MuiTextInput,
  SelectInput as MuiSelectInput,
  CheckboxInput as MuiCheckboxInput,
  ColorInput as MuiColorInput,
  SliderWithInput,
} from './common';
import { validateCombineMode } from '../../compiler/passes-v2/combine-utils';
import { ConnectionPicker } from './ConnectionPicker';
import { AddressRegistry } from '../../graph/address-registry';
import { SuggestionProvider } from '../../expr/suggestions';
import type { Suggestion, OutputSuggestion } from '../../expr/suggestions';
import { AutocompleteDropdown } from '../expression-editor/AutocompleteDropdown';
import { getCursorPosition, adjustPositionForViewport } from '../expression-editor/cursorPosition';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a SignalType for display.
 */
function formatSignalType(type: SignalType | undefined): string {
  if (type == undefined) {
    throw new Error("ERROR: BlockInspector.formatSignalType: Type is undefined.")
  }
  return type.payload.kind;
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
 * Check if two signal types are compatible for wiring.
 * Payload types must match. Payload-generic blocks use BlockPayloadMetadata.
 */
function areTypesCompatible(sourceType: SignalType | undefined, targetType: SignalType | undefined): boolean {
  // Handle undefined types
  if (!sourceType || !targetType) return false;
  // Payload types must match
  return sourceType.payload === targetType.payload;
}

/**
 * Get slider min value for Const default source editor.
 * Priority: inputDef.uiHint > inputDef.defaultSource.params.value-based > type-based defaults
 */
function getConstSliderMin(inputDef: InputDef | undefined, portType: SignalType | undefined): number {
  // Check uiHint first
  const hint = inputDef?.uiHint;
  if (hint && 'min' in hint && hint.min !== undefined) {
    return hint.min;
  }
  // Type-based defaults
  switch (portType?.payload.kind) {
    case 'int': return 0;
    case 'float': return 0;
    default: return 0;
  }
}

/**
 * Get slider max value for Const default source editor.
 * Priority: inputDef.uiHint > type-based defaults
 */
function getConstSliderMax(inputDef: InputDef | undefined, portType: SignalType | undefined): number {
  // Check uiHint first
  const hint = inputDef?.uiHint;
  if (hint && 'max' in hint && hint.max !== undefined) {
    return hint.max;
  }
  // Type-based defaults
  switch (portType?.payload.kind) {
    case 'int': return 100;  // Reasonable default for integers
    case 'float': return 1;
    default: return 1;
  }
}

/**
 * Get slider step value for Const default source editor.
 * Priority: inputDef.uiHint > type-based defaults
 */
function getConstSliderStep(inputDef: InputDef | undefined, portType: SignalType | undefined): number {
  // Check uiHint first
  const hint = inputDef?.uiHint;
  if (hint && 'step' in hint && hint.step !== undefined) {
    return hint.step;
  }
  // Type-based defaults
  switch (portType?.payload.kind) {
    case 'int': return 1;
    case 'float': return 0.01;
    default: return 0.01;
  }
}

/**
 * Get valid block types for use as default sources.
 * A valid default source block:
 * - Must NOT be stateful (capability !== 'state')
 * - Must have at least one output
 * - Must have at least one output compatible with the target port type
 */
function getValidDefaultSourceBlockTypes(portType: SignalType): { blockType: string; label: string; outputs: readonly OutputDef[] }[] {
  const validBlocks: { blockType: string; label: string; outputs: readonly OutputDef[] }[] = [];

  for (const [blockType, def] of BLOCK_DEFS_BY_TYPE.entries()) {
    // Skip stateful blocks
    if (def.capability === 'state') continue;

    // Must have at least one output
    if (Object.keys(def.outputs).length === 0) continue;

    // Must have at least one type-compatible output
    const hasCompatibleOutput = Object.values(def.outputs).some(output => areTypesCompatible(output.type, portType));
    if (!hasCompatibleOutput) continue;

    validBlocks.push({
      blockType: def.type,
      label: def.label || "",
      outputs: Object.values(def.outputs),
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


/**
 * Get valid combine modes for a payload type.
 * Filters modes based on type compatibility.
 */
function getValidCombineModes(payload: string): CombineMode[] {
  const allModes: CombineMode[] = ['last', 'first', 'sum', 'average', 'max', 'min', 'mul', 'layer', 'or', 'and'];

  return allModes.filter(mode => {
    // For signal world (most common for ports)
    const result = validateCombineMode(mode, 'signal', payload);
    return result.valid;
  });
}

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
  };
  return labels[mode] ?? mode;
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

const PortInspectorStandalone = observer(function PortInspectorStandalone({ portRef, block, blockDef, patch }: PortInspectorStandaloneProps) {
  const { selection, patch: patchStore } = useStores();
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
    ? (instancePort?.defaultSource ?? inputDef.defaultSource)
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
          Signal Type
        </h4>
        <div style={{
          padding: '8px',
          background: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '13px',
        }}>
          {formatSignalType(portDef.type!)}
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
            options={getValidCombineModes(portDef.type.payload.kind).map(mode => ({
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
          portType={inputDef.type!}
          currentDefaultSource={effectiveDefaultSource}
          registryDefaultSource={inputDef.defaultSource}
          isConnected={isConnected}
          inputDef={inputDef}
        />
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
// Edge Inspector
// =============================================================================

interface EdgeInspectorProps {
  edge: Edge;
  patch: Patch;
}

function EdgeInspector({ edge, patch }: EdgeInspectorProps) {
  const { selection } = useStores();
  const sourceBlock = patch.blocks.get(edge.from.blockId as BlockId);
  const targetBlock = patch.blocks.get(edge.to.blockId as BlockId);

  const handleSourceClick = useCallback(() => {
    selection.selectBlock(edge.from.blockId as BlockId);
  }, [selection, edge.from.blockId]);

  const handleTargetClick = useCallback(() => {
    selection.selectBlock(edge.to.blockId as BlockId);
  }, [selection, edge.to.blockId]);

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
          {Object.entries(typeInfo.inputs).map(([inputId, input]) => {
            const hasDefaultSource = input.defaultSource !== undefined;
            return (
              <li key={inputId} style={{ marginBottom: '8px', fontSize: '13px' }}>
                <div>
                  <strong>{input.label}</strong>: {formatSignalType(input.type!)}
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
          {Object.entries(typeInfo.outputs).map(([outputId, output]) => (
            <li key={outputId} style={{ marginBottom: '4px', fontSize: '13px' }}>
              <strong>{output.label}</strong>: {formatSignalType(output.type!)}
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
});

// =============================================================================
// Display Name Editor
// =============================================================================

interface DisplayNameEditorProps {
  block: Block;
  typeInfo: BlockDef;
}

const DisplayNameEditor = observer(function DisplayNameEditor({ block, typeInfo }: DisplayNameEditorProps) {
  const { patch: patchStore } = useStores();
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
      patchStore.updateBlockDisplayName(block.id, newName);
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
  portId: string;
  isConnected: boolean;
  connectedEdge?: Edge;
  patch: Patch;
  onClick: () => void;
}

const PortItem = observer(function PortItem({ port, portId, blockId, isConnected, connectedEdge, patch, onClick }: PortItemProps) {
  const { selection } = useStores();
  const hasDefaultSource = port.defaultSource !== undefined;

  const handleSourceClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (connectedEdge) {
      selection.selectBlock(connectedEdge.from.blockId as BlockId);
    }
  }, [connectedEdge]);

  // Find the derived default source block if it exists
  const derivedBlockId = hasDefaultSource && !isConnected
    ? getDerivedDefaultSourceId(blockId, portId)
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
          <span style={{ color: colors.textSecondary }}> ({formatSignalType(port.type!)})</span>
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
              portLabel={port.label || ""}
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
  const { patch: patchStore } = useStores();
  const [localValue, setLocalValue] = useState(String(value));

  // Sync local value when prop changes
  React.useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleBlur = useCallback(() => {
    const parsed = typeof value === 'number' ? parseFloat(localValue) : localValue;

    if (typeof value === 'number') {
      if (!isNaN(parsed as number) && parsed !== value) {
        patchStore.updateBlockParams(derivedBlockId, { value: parsed });
      } else if (isNaN(parsed as number)) {
        setLocalValue(String(value));
      }
    } else {
      if (parsed !== value) {
        patchStore.updateBlockParams(derivedBlockId, { value: parsed });
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
          <span style={{ color: colors.textSecondary }}> ({formatSignalType(port.type!)})</span>
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
  portRef: PortRef;
  block: Block;
  typeInfo: BlockDef;
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
  const { selection } = useStores();
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
    ? (instancePort?.defaultSource ?? inputPort.defaultSource)
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
          Signal Type
        </h4>
        <div style={{
          padding: '8px',
          background: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '13px',
        }}>
          {formatSignalType(port.type!)}
        </div>
      </div>

      {isInput && inputPort && (
        <>
          {inputPort.optional && (
            <div style={{ marginBottom: '16px', fontSize: '12px', color: colors.textSecondary }}>
              Optional port
            </div>
          )}

          {/* Show default source editor for ALL input ports - whether connected or not */}
          {effectiveDefaultSource && (
            <PortDefaultSourceEditor
              blockId={block.id}
              portId={portRef.portId}
              portType={inputPort.type!}
              currentDefaultSource={effectiveDefaultSource}
              registryDefaultSource={inputPort.defaultSource}
              isConnected={isConnected}
              inputDef={inputPort}
            />
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
  portType: SignalType;
  currentDefaultSource: DefaultSource;
  registryDefaultSource?: DefaultSource;
  isConnected?: boolean;
  inputDef?: InputDef;  // For accessing uiHint
}

const PortDefaultSourceEditor = observer(function PortDefaultSourceEditor({
  blockId,
  portId,
  portType,
  currentDefaultSource,
  registryDefaultSource,
  isConnected,
  inputDef,
}: PortDefaultSourceEditorProps) {
  const { patch: patchStore } = useStores();
  const validBlockTypes = getValidDefaultSourceBlockTypes(portType);

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

  const handleParamChange = useCallback((paramKey: string, value: unknown) => {
    const newDefaultSource: DefaultSource = {
      ...currentDefaultSource,
      params: {
        ...currentParams,
        [paramKey]: value,
      },
    };

    patchStore.updateInputPort(blockId, portId, { defaultSource: newDefaultSource });
  }, [blockId, portId, currentDefaultSource, currentParams]);

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

  // Special handling for Const block - show direct slider for value param
  const isConstBlock = currentBlockType === 'Const';
  const payloadType = portType.payload;

  // Parse constValue based on payload type
  const parseConstValue = (raw: unknown): unknown => {
    if (raw === undefined || raw === null) {
      // Return sensible defaults based on type
      switch (payloadType.kind) {
        case 'bool': return false;
        case 'int': return 0;
        case 'float': return 0;
        case 'vec2': return { x: 0, y: 0 };
        case 'color': return { r: 0, g: 0, b: 0, a: 1 };
        default: return 0;
      }
    }

    // If it's a string, try to parse it as JSON (for complex types)
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw; // Return raw if parse fails
      }
    }

    return raw;
  };

  const constValue = isConstBlock ? parseConstValue(currentParams.value) : 0;

  // Special handling for TimeRoot block - show output dropdown
  const isTimeRootBlock = currentBlockType === 'TimeRoot';
  const timeRootOutputs = ['tMs', 'phaseA', 'phaseB', 'pulse', 'palette', 'energy'];

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

      {/* Const Block - Type-Aware Value Editor */}
      {isConstBlock && (
        <div style={{ marginBottom: '12px' }}>
          {payloadType.kind === 'float' && (
            <SliderWithInput
              label="Value"
              value={constValue as number}
              onChange={(value) => handleParamChange('value', value)}
              min={getConstSliderMin(inputDef, portType)}
              max={getConstSliderMax(inputDef, portType)}
              step={getConstSliderStep(inputDef, portType)}
            />
          )}
          {payloadType.kind === 'int' && (
            <SliderWithInput
              label="Value"
              value={constValue as number}
              onChange={(value) => handleParamChange('value', value)}
              min={getConstSliderMin(inputDef, portType) ?? 0}
              max={getConstSliderMax(inputDef, portType) ?? 100}
              step={1}
            />
          )}
          {payloadType.kind === 'bool' && (
            <MuiCheckboxInput
              checked={!!constValue}
              onChange={(value) => handleParamChange('value', value)}
            />
          )}
          {payloadType.kind === 'vec2' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <SliderWithInput
                label="X"
                value={(constValue as any)?.x ?? 0}
                min={-1000}
                max={1000}
                step={1}
                onChange={(v) => handleParamChange('value', { ...((constValue as any) || {}), x: v })}
              />
              <SliderWithInput
                label="Y"
                value={(constValue as any)?.y ?? 0}
                min={-1000}
                max={1000}
                step={1}
                onChange={(v) => handleParamChange('value', { ...((constValue as any) || {}), y: v })}
              />
            </div>
          )}
          {payloadType.kind === 'color' && (
            <MuiColorInput
              value={
                typeof constValue === 'string'
                  ? constValue
                  : (constValue as any)?.toHexString?.() ?? '#000000'
              }
              onChange={(value) => handleParamChange('value', value)}
            />
          )}
          {(payloadType.kind === 'shape' || payloadType.kind === 'cameraProjection') && (
            <div style={{ padding: '8px', backgroundColor: colors.bgPanel, borderRadius: '4px', fontSize: '12px', color: colors.textSecondary }}>
              {payloadType.kind === 'shape' && '⚙️ Shape values are configured via geometry properties'}
              {payloadType.kind === 'cameraProjection' && '⚙️ Camera projection values are configured via projection properties'}
            </div>
          )}
          {payloadType.kind !== 'float' && payloadType.kind !== 'int' && payloadType.kind !== 'bool' && payloadType.kind !== 'vec2' && payloadType.kind !== 'color' && payloadType.kind !== 'shape' && payloadType.kind !== 'cameraProjection' && (
            <SliderWithInput
              label="Value"
              value={constValue as number}
              onChange={(value) => handleParamChange('value', value)}
              min={-100}
              max={100}
              step={0.1}
            />
          )}
        </div>
      )}

      {/* TimeRoot Block - Output Selector */}
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

      {/* Other Blocks - Output Port Selector and Params */}
      {!isConstBlock && !isTimeRootBlock && (
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

          {/* Params Editor - for blocks with inputs */}
          {currentBlockDef && currentBlockDef.inputs && Object.keys(currentBlockDef.inputs).length > 0 && (
            <div>
              <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
                Parameters
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(currentBlockDef.inputs).map(([inputId, input]) => {
                  const paramValue = currentParams[inputId] ?? input.value;
                  return (
                    <DefaultSourceParamField
                      key={inputId}
                      paramKey={inputId}
                      paramLabel={input.label || ""}
                      value={paramValue}
                      uiHint={input.uiHint}
                      onChange={(value) => handleParamChange(inputId, value)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});

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

const DefaultSourceParamField = observer(function DefaultSourceParamField({
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
});


// =============================================================================
// Params Editor
// =============================================================================

interface ParamsEditorProps {
  block: Block;
  typeInfo: BlockDef;
  patch: Patch;
}

const ParamsEditor = observer(function ParamsEditor({ block, typeInfo, patch }: ParamsEditorProps) {
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
            patch={patch}
          />
        ))}
      </div>
    </div>
  );
});

// =============================================================================
// =============================================================================
// Expression Editor (for Expression DSL blocks)
// =============================================================================

interface ExpressionEditorProps {
  blockId: BlockId;
  value: string;
  patch: Patch;
}

/**
 * Extract current identifier prefix from expression at cursor position.
 * Scans backward from cursor to find alphanumeric+underscore sequence.
 *
 * Returns { prefix: string, startOffset: number } or null if not in identifier.
 */
function extractIdentifierPrefix(value: string, cursorPos: number): { prefix: string; startOffset: number } | null {
  if (cursorPos === 0) return null;

  let start = cursorPos - 1;
  // Scan backward while we see identifier chars
  while (start >= 0 && /[a-zA-Z0-9_]/.test(value[start])) {
    start--;
  }

  // If we stopped at a dot, check if it's part of block.port syntax
  const identifierStart = start + 1;
  if (identifierStart >= cursorPos) {
    return null; // No identifier chars before cursor
  }

  const prefix = value.substring(identifierStart, cursorPos);
  return { prefix, startOffset: identifierStart };
}

/**
 * Detect if cursor is after a dot (block.port context).
 * Returns the block name if found, otherwise null.
 */
function detectBlockContext(value: string, cursorPos: number): string | null {
  if (cursorPos === 0) return null;

  // Check if immediately after a dot
  if (value[cursorPos - 1] === '.') {
    // Scan backward to find the block name
    let start = cursorPos - 2;
    while (start >= 0 && /[a-zA-Z0-9_]/.test(value[start])) {
      start--;
    }
    const blockName = value.substring(start + 1, cursorPos - 1);
    return blockName || null;
  }

  // Check if we're in the middle of typing a port name after a dot
  const identifierPrefix = extractIdentifierPrefix(value, cursorPos);
  if (identifierPrefix && identifierPrefix.startOffset > 0 && value[identifierPrefix.startOffset - 1] === '.') {
    // Scan backward from the dot to find block name
    let start = identifierPrefix.startOffset - 2;
    while (start >= 0 && /[a-zA-Z0-9_]/.test(value[start])) {
      start--;
    }
    const blockName = value.substring(start + 1, identifierPrefix.startOffset - 1);
    return blockName || null;
  }

  return null;
}

/**
 * Insert suggestion into textarea at current cursor position.
 * Replaces the prefix and positions cursor appropriately.
 */
function insertSuggestion(
  textarea: HTMLTextAreaElement,
  suggestion: Suggestion,
  filterPrefix: string,
  prefixStartOffset: number
): void {
  const text = textarea.value;
  const before = text.substring(0, prefixStartOffset);
  const after = text.substring(textarea.selectionStart);

  let insertText = suggestion.label;
  let cursorOffset = insertText.length;

  // For functions, position cursor inside parens
  if (suggestion.type === 'function') {
    cursorOffset = insertText.length - 1; // Before closing paren
  }

  // For blocks, add a dot to trigger port completion
  if (suggestion.type === 'block') {
    insertText += '.';
    cursorOffset = insertText.length; // After the dot
  }

  const newValue = before + insertText + after;
  const newCursorPos = prefixStartOffset + cursorOffset;

  // Update textarea
  textarea.value = newValue;
  textarea.selectionStart = newCursorPos;
  textarea.selectionEnd = newCursorPos;

  // Trigger change event
  const event = new Event('input', { bubbles: true });
  textarea.dispatchEvent(event);
}

const ExpressionEditor = observer(function ExpressionEditor({ blockId, value, patch }: ExpressionEditorProps) {
  const { patch: patchStore, diagnostics: diagnosticsStore } = useStores();
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [filterPrefix, setFilterPrefix] = useState('');
  const [blockContext, setBlockContext] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [filteredSuggestions, setFilteredSuggestions] = useState<readonly Suggestion[]>([]);

  // Create SuggestionProvider (recreate when patch changes)
  const suggestionProvider = useMemo(() => {
    const registry = AddressRegistry.buildFromPatch(patch);
    return new SuggestionProvider(patch, registry);
  }, [patch]);

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Get expression-related errors for this block
  const expressionError = useMemo(() => {
    const allDiagnostics = diagnosticsStore.activeDiagnostics;
    const blockErrors = allDiagnostics.filter(
      (diag) =>
        diag.primaryTarget.kind === 'block' &&
        diag.primaryTarget.blockId === blockId &&
        (diag.code === 'E_EXPR_SYNTAX' || diag.code === 'E_EXPR_TYPE' || diag.code === 'E_EXPR_COMPILE')
    );
    return blockErrors.length > 0 ? blockErrors[0] : null;
  }, [blockId, diagnosticsStore.activeDiagnostics]);

  // Update suggestions when filter or context changes
  useEffect(() => {
    if (!showAutocomplete) {
      setFilteredSuggestions([]);
      return;
    }

    let suggestions: readonly Suggestion[];

    if (blockContext) {
      // Port completion context
      suggestions = suggestionProvider.suggestBlockPorts(blockContext);
      if (filterPrefix) {
        suggestions = suggestionProvider.filterSuggestions(filterPrefix, 'port').filter(s => s.type === 'port');
      }
    } else if (filterPrefix) {
      // Identifier completion context - exclude self
      suggestions = suggestionProvider.filterSuggestions(filterPrefix, undefined, blockId);
    } else {
      // Ctrl+Space - show all (except ports) - exclude self
      suggestions = suggestionProvider.filterSuggestions('', undefined, blockId);
    }

    setFilteredSuggestions(suggestions);
    setSuggestionIndex(0); // Reset selection
  }, [showAutocomplete, filterPrefix, blockContext, suggestionProvider]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length > 500) return; // Character limit
    setLocalValue(newValue);

    const textarea = e.target;
    const cursor = textarea.selectionStart;
    setCursorPosition(cursor);

    // Check for block.port context
    const blockCtx = detectBlockContext(newValue, cursor);
    setBlockContext(blockCtx);

    // Extract identifier prefix
    const identifierData = extractIdentifierPrefix(newValue, cursor);
    if (identifierData) {
      setFilterPrefix(identifierData.prefix);
      setShowAutocomplete(true);

      // Calculate dropdown position
      if (textareaRef.current) {
        const pos = getCursorPosition(textareaRef.current, cursor);
        const adjusted = adjustPositionForViewport(pos, 200, 250);
        setDropdownPosition(adjusted);
      }
    } else if (blockCtx) {
      // After dot, but no port name yet
      setFilterPrefix('');
      setShowAutocomplete(true);

      if (textareaRef.current) {
        const pos = getCursorPosition(textareaRef.current, cursor);
        const adjusted = adjustPositionForViewport(pos, 200, 250);
        setDropdownPosition(adjusted);
      }
    } else {
      setShowAutocomplete(false);
      setFilterPrefix('');
    }
  }, []);

  const handleBlur = useCallback(() => {
    // Delay to allow dropdown click to register
    setTimeout(() => {
      if (localValue !== value) {
        patchStore.updateBlockParams(blockId, { expression: localValue });
      }
    }, 200);
  }, [blockId, localValue, value, patchStore]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredSuggestions[suggestionIndex];
        if (selected && textareaRef.current) {
          const identifierData = extractIdentifierPrefix(localValue, cursorPosition);
          const prefixStartOffset = identifierData?.startOffset ?? cursorPosition;
          insertSuggestion(textareaRef.current, selected, filterPrefix, prefixStartOffset);
          setShowAutocomplete(false);
          setFilterPrefix('');
          setBlockContext(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        setFilterPrefix('');
        setBlockContext(null);
        return;
      }
    }

    // Ctrl+Space to force show autocomplete
    if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
      e.preventDefault();
      setShowAutocomplete(true);
      setFilterPrefix('');
      setBlockContext(null);
      if (textareaRef.current) {
        const pos = getCursorPosition(textareaRef.current, textareaRef.current.selectionStart);
        const adjusted = adjustPositionForViewport(pos, 200, 250);
        setDropdownPosition(adjusted);
      }
      return;
    }

    // Ctrl/Cmd+Enter: trigger immediate update (blur will save)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.currentTarget.blur();
    }
  }, [showAutocomplete, filteredSuggestions, suggestionIndex, filterPrefix, localValue, cursorPosition]);

  const handleSelectSuggestion = useCallback((suggestion: Suggestion) => {
    if (textareaRef.current) {
      const identifierData = extractIdentifierPrefix(localValue, cursorPosition);
      const prefixStartOffset = identifierData?.startOffset ?? cursorPosition;
      insertSuggestion(textareaRef.current, suggestion, filterPrefix, prefixStartOffset);

      // Wire vararg connection for output suggestions
      if (suggestion.type === 'output') {
        const outputSugg = suggestion as OutputSuggestion;

        // Get existing refs connections to calculate sortKey
        const block = patch.blocks.get(blockId);
        const refsPort = block?.inputPorts.get('refs');
        const existingConnections = refsPort?.varargConnections ?? [];
        const maxSortKey = existingConnections.length > 0
          ? Math.max(...existingConnections.map(c => c.sortKey))
          : -1;

        // Wire the connection
        patchStore.addVarargConnection(
          blockId,
          'refs',
          outputSugg.sourceAddress,
          maxSortKey + 1
        );
      }

      setShowAutocomplete(false);
      setFilterPrefix('');
      setBlockContext(null);
      textareaRef.current.focus();
    }
  }, [localValue, cursorPosition, filterPrefix, blockId, patch, patchStore]);

  const hasError = expressionError !== null;

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>
        Expression
      </label>
      <textarea
        ref={textareaRef}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="e.g., sin(in0 * 2) + 0.5"
        rows={3}
        maxLength={500}
        style={{
          width: '100%',
          padding: '8px',
          border: `1px solid ${hasError ? colors.error : colors.border}`,
          borderRadius: '4px',
          backgroundColor: colors.bgPanel,
          color: colors.textPrimary,
          fontFamily: 'monospace',
          fontSize: '12px',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ fontSize: '10px', color: colors.textSecondary, textAlign: 'right', marginTop: '2px' }}>
        {localValue.length} / 500
      </div>
      {hasError && (
        <div style={{
          fontSize: '11px',
          color: colors.error,
          marginTop: '4px',
          padding: '4px 8px',
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          borderRadius: '4px',
          borderLeft: `3px solid ${colors.error}`,
        }}>
          {expressionError.message}
        </div>
      )}

      {/* Autocomplete Dropdown */}
      <AutocompleteDropdown
        suggestions={filteredSuggestions}
        selectedIndex={suggestionIndex}
        onSelect={handleSelectSuggestion}
        isVisible={showAutocomplete}
        position={dropdownPosition}
        onClose={() => {
          setShowAutocomplete(false);
          setFilterPrefix('');
          setBlockContext(null);
        }}
      />
    </div>
  );
});


// Individual Param Field
// =============================================================================

interface ParamFieldProps {
  blockId: BlockId;
  paramKey: string;
  value: unknown;
  typeInfo: BlockDef;
  patch: Patch;
}

const ParamField = observer(function ParamField({ blockId, paramKey, value, typeInfo, patch }: ParamFieldProps) {
  const { patch: patchStore } = useStores();
  // Special case: Expression block with expression parameter
  // Render multiline textarea instead of single-line text input
  if (typeInfo.type === 'Expression' && paramKey === 'expression') {
    return <ExpressionEditor blockId={blockId} value={String(value ?? '')} patch={patch} />;
  }


  // Find uiHint if this param corresponds to an input
  const inputDef = typeInfo.inputs[paramKey];
  const uiHint = inputDef?.uiHint;

  const handleChange = useCallback((newValue: unknown) => {
    patchStore.updateBlockParams(blockId, { [paramKey]: newValue });
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
