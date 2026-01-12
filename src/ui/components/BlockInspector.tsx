/**
 * Block Inspector Component (React)
 *
 * Detailed view of selected block OR block type preview.
 * Shows ports, connections, and parameters.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../stores';
import { colors } from '../theme';
import { getBlockDefinition, type BlockDef } from '../../blocks/registry';
import type { Block } from '../../graph/Patch';
import type { BlockId } from '../../types';
import type { SignalType } from '../../core/canonical-types';

/**
 * Format a SignalType for display.
 */
function formatSignalType(type: SignalType): string {
  return type.payload;
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
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          {typeInfo.inputs.map((input) => (
            <li key={input.id} style={{ marginBottom: '4px', fontSize: '13px' }}>
              <strong>{input.label}</strong>: {formatSignalType(input.type)}
              {input.optional && (
                <span style={{ color: colors.textSecondary }}> (optional)</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>
          Outputs
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
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
  patch: any; // TODO: Type this properly
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
          {typeInfo.inputs.map((port: any) => {
            // TODO: Show actual connections
            return (
              <li key={port.id} style={{ marginBottom: '4px', fontSize: '13px' }}>
                <strong>{port.label}</strong>
                <span style={{ color: colors.textSecondary }}> ({port.type})</span>
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
          {typeInfo.outputs.map((port: any) => {
            // TODO: Show actual connections
            return (
              <li key={port.id} style={{ marginBottom: '4px', fontSize: '13px' }}>
                <strong>{port.label}</strong>
                <span style={{ color: colors.textSecondary }}> ({port.type})</span>
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
