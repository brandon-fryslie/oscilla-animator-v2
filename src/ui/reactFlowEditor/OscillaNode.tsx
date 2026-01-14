/**
 * OscillaNode - Custom ReactFlow node component for Oscilla blocks.
 *
 * Renders port-specific handles for proper multi-port connections.
 * Each input/output port gets its own Handle with unique ID.
 */

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { OscillaNodeData } from './nodes';

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
      {/* Input Handles (Left Side) */}
      {data.inputs.map((input, index) => (
        <Handle
          key={`input-${input.id}`}
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
          title={input.label}
        />
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
