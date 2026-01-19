/**
 * OscillaNode - Custom ReactFlow node component for Oscilla blocks.
 *
 * Renders port-specific handles for proper multi-port connections.
 * Each input/output port gets its own Handle with unique ID.
 * Input ports show default source indicators when applicable.
 */

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { OscillaNodeData, PortData } from './nodes';
import type { DefaultSource } from '../../types';

/**
 * Format a default source for display in tooltip.
 */
function formatDefaultSource(ds: DefaultSource): string {
  switch (ds.kind) {
    case 'constant':
      // Format the value nicely
      const value = ds.value;
      if (typeof value === 'number') {
        return `Default: ${value}`;
      } else if (Array.isArray(value)) {
        return `Default: [${value.join(', ')}]`;
      } else if (typeof value === 'object' && value !== null) {
        return `Default: ${JSON.stringify(value)}`;
      }
      return `Default: ${String(value)}`;
    case 'rail':
      return `Default: ${ds.railId} rail`;
    case 'none':
      return 'No default';
  }
}

/**
 * Get indicator color based on default source kind.
 */
function getIndicatorColor(ds: DefaultSource): string {
  switch (ds.kind) {
    case 'constant':
      return '#4CAF50'; // Green for constants
    case 'rail':
      return '#2196F3'; // Blue for rails
    default:
      return 'transparent';
  }
}

/**
 * Custom node component that renders handles for each port.
 */
export const OscillaNode: React.FC<NodeProps<OscillaNodeData>> = ({ data }) => {
  return (
    <div
      style={{
        padding: '10px 15px',
        borderRadius: '5px',
        border: '2px solid #555',
        background: '#1e1e1e',
        color: '#e0e0e0',
        minWidth: '180px',
        fontSize: '14px',
      }}
    >
      {/* Input Handles (Left Side) with Default Indicators */}
      {data.inputs.map((input, index) => (
        <React.Fragment key={`input-${input.id}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={input.id}
            style={{
              top: `${((index + 1) * 100) / (data.inputs.length + 1)}%`,
              background: '#4a90e2',
              width: '10px',
              height: '10px',
              border: '2px solid #1e1e1e',
            }}
            title={
              input.defaultSource && input.defaultSource.kind !== 'none'
                ? `${input.label} - ${formatDefaultSource(input.defaultSource)}`
                : input.label
            }
          />
          {/* Default Source Indicator */}
          {input.defaultSource && input.defaultSource.kind !== 'none' && (
            <div
              style={{
                position: 'absolute',
                left: '-3px',
                top: `calc(${((index + 1) * 100) / (data.inputs.length + 1)}% - 12px)`,
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: getIndicatorColor(input.defaultSource),
                pointerEvents: 'none',
              }}
              title={formatDefaultSource(input.defaultSource)}
            />
          )}
        </React.Fragment>
      ))}

      {/* Node Label */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 'bold',
          marginBottom: '8px',
        }}
      >
        {data.label}
      </div>

      {/* Port Labels */}
      <div style={{ fontSize: '11px', color: '#999' }}>
        {data.inputs.length > 0 && (
          <div style={{ marginBottom: '4px' }}>
            Inputs: {data.inputs.map((i) => i.label).join(', ')}
          </div>
        )}
        {data.outputs.length > 0 && (
          <div>Outputs: {data.outputs.map((o) => o.label).join(', ')}</div>
        )}
      </div>

      {/* Output Handles (Right Side) */}
      {data.outputs.map((output, index) => (
        <Handle
          key={`output-${output.id}`}
          type="source"
          position={Position.Right}
          id={output.id}
          style={{
            top: `${((index + 1) * 100) / (data.outputs.length + 1)}%`,
            background: '#f39c12',
            width: '10px',
            height: '10px',
            border: '2px solid #1e1e1e',
          }}
          title={output.label}
        />
      ))}
    </div>
  );
};
