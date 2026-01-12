/**
 * Block Inspector Component (React)
 *
 * Detailed view of selected block OR block type preview.
 * Shows ports, connections, parameters, and default sources.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../stores';
import { colors } from '../theme';
import { getBlockDefinition, type BlockDef } from '../../blocks/registry';
import type { Block, Patch } from '../../graph/Patch';
import type { BlockId, DefaultSource } from '../../types';
import type { SignalType } from '../../core/canonical-types';

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
  switch (source.kind) {
    case 'rail':
      return `rail:${source.railId}`;
    case 'constant':
      return `${JSON.stringify(source.value)}`;
    case 'none':
      return '(none)';
  }
}

/**
 * Block Inspector component.
 */
export const BlockInspector = observer(function BlockInspector() {
  const { previewType, selectedBlockId } = rootStore.selection;
  const patch = rootStore.patch.patch;

  // Preview mode takes precedence
  if (previewType) {
    return <TypePreview type={previewType} />;
  }

  // Block selection mode
  if (!selectedBlockId || !patch) {
    return <NoSelection />;
  }

  const block = patch.blocks.get(selectedBlockId);
  if (!block) {
    return <NoSelection />;
  }

  // Check if block is timeRoot
  if (block.role?.kind === 'timeRoot') {
    return <TimeRootBlock />;
  }

  return <BlockDetails block={block} patch={patch} />;
});

/**
 * No selection state
 */
function NoSelection() {
  return (
    <div style={{ padding: '16px', color: colors.textSecondary }}>
      <p>Select a block to inspect.</p>
    </div>
  );
}

/**
 * TimeRoot block (hidden system block)
 */
function TimeRootBlock() {
  return (
    <div style={{ padding: '16px', color: colors.textSecondary }}>
      <p>System block (hidden)</p>
      <p style={{ fontSize: '12px', marginTop: '8px' }}>
        Time root blocks are system-managed and not shown in most views.
      </p>
    </div>
  );
}

/**
 * Block type preview (from library)
 */
interface TypePreviewProps {
  type: string;
}

function TypePreview({ type }: TypePreviewProps) {
  const typeInfo = getBlockDefinition(type);

  if (!typeInfo) {
    return (
      <div style={{ padding: '16px', color: colors.error }}>
        <p>Unknown block type: {type}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
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
                    fontStyle: input.defaultSource?.kind === 'rail' ? 'italic' : 'normal'
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

/**
 * Block instance details
 */
interface BlockDetailsProps {
  block: Block;
  patch: Patch;
}

function BlockDetails({ block, patch }: BlockDetailsProps) {
  const typeInfo = getBlockDefinition(block.type);

  if (!typeInfo) {
    return (
      <div style={{ padding: '16px', color: colors.error }}>
        <p>Unknown block type: {block.type}</p>
      </div>
    );
  }

  // Get connected edges
  const incomingEdges = patch.edges.filter(e => e.to.blockId === block.id);
  const connectedInputPorts = new Set(incomingEdges.map(e => e.to.slotId));

  return (
    <div style={{ padding: '16px' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>
        {block.label || typeInfo.label}
      </h3>
      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>
        {typeInfo.type}
      </p>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Inputs
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'none' }}>
          {typeInfo.inputs.map((port) => {
            const isConnected = connectedInputPorts.has(port.id);
            const hasDefaultSource = port.defaultSource !== undefined;
            const connectedEdge = incomingEdges.find(e => e.to.slotId === port.id);

            return (
              <li key={port.id} style={{ marginBottom: '8px', fontSize: '13px' }}>
                <div>
                  <strong>{port.label}</strong>
                  <span style={{ color: colors.textSecondary }}> ({formatSignalType(port.type)})</span>
                </div>
                {isConnected && connectedEdge && (
                  <div style={{
                    marginLeft: '16px',
                    fontSize: '12px',
                    color: colors.primary,
                    fontFamily: "'Courier New', monospace"
                  }}>
                    ← {connectedEdge.from.blockId}.{connectedEdge.from.slotId}
                  </div>
                )}
                {!isConnected && hasDefaultSource && (
                  <div style={{
                    marginLeft: '16px',
                    fontSize: '12px',
                    color: colors.textSecondary
                  }}>
                    (not connected)
                    <div style={{
                      fontStyle: port.defaultSource?.kind === 'rail' ? 'italic' : 'normal',
                      color: port.defaultSource?.kind === 'rail' ? colors.primary : colors.textSecondary
                    }}>
                      Default: {formatDefaultSource(port.defaultSource!)}
                    </div>
                  </div>
                )}
                {!isConnected && !hasDefaultSource && (
                  <div style={{
                    marginLeft: '16px',
                    fontSize: '12px',
                    color: colors.textMuted
                  }}>
                    (not connected)
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Outputs
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'none' }}>
          {typeInfo.outputs.map((port) => {
            const outgoingEdges = patch.edges.filter(e => e.from.blockId === block.id && e.from.slotId === port.id);

            return (
              <li key={port.id} style={{ marginBottom: '8px', fontSize: '13px' }}>
                <div>
                  <strong>{port.label}</strong>
                  <span style={{ color: colors.textSecondary }}> ({formatSignalType(port.type)})</span>
                </div>
                {outgoingEdges.length > 0 && (
                  <div style={{
                    marginLeft: '16px',
                    fontSize: '12px',
                    color: colors.primary,
                    fontFamily: "'Courier New', monospace"
                  }}>
                    {outgoingEdges.map((edge, idx) => (
                      <div key={idx}>
                        → {edge.to.blockId}.{edge.to.slotId}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {block.params && Object.keys(block.params).length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
            Configuration
          </h4>
          <pre
            style={{
              margin: 0,
              padding: '8px',
              backgroundColor: colors.bgPanel,
              borderRadius: '4px',
              fontSize: '12px',
              overflow: 'auto',
            }}
          >
            {JSON.stringify(block.params, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
