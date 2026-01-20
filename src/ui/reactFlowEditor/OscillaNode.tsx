/**
 * OscillaNode - Custom ReactFlow node component for Oscilla blocks.
 *
 * Renders port-specific handles for proper multi-port connections.
 * Each input/output port gets its own Handle with unique ID.
 * Handles are color-coded by payload type with type tooltips.
 */

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { OscillaNodeData, PortData } from './nodes';
import type { DefaultSource } from '../../types';

/**
 * Format a default source for display in tooltip.
 */
function formatDefaultSource(ds: DefaultSource): string {
  if (ds.blockType === 'TimeRoot') {
    return `Default: TimeRoot.${ds.output}`;
  }

  if (ds.blockType === 'Const' && ds.params?.value !== undefined) {
    // Format the value nicely
    const value = ds.params.value;
    if (typeof value === 'number') {
      return `Default: ${value}`;
    } else if (Array.isArray(value)) {
      return `Default: [${value.join(', ')}]`;
    } else if (typeof value === 'object' && value !== null) {
      return `Default: ${JSON.stringify(value)}`;
    }
    return `Default: ${String(value)}`;
  }

  // Generic block default
  return `Default: ${ds.blockType}.${ds.output}`;
}

/**
 * Get indicator color based on default source type.
 */
function getIndicatorColor(ds: DefaultSource): string {
  if (ds.blockType === 'TimeRoot') {
    return '#2196F3'; // Blue for TimeRoot
  }
  return '#4CAF50'; // Green for other blocks (including Const)
}

/**
 * Build tooltip text for a port.
 */
function buildPortTooltip(port: PortData, isInput: boolean): string {
  const parts: string[] = [];

  // Port label and type
  parts.push(`${port.label}: ${port.typeTooltip}`);

  // Default source info for inputs
  if (isInput && port.defaultSource) {
    parts.push(formatDefaultSource(port.defaultSource));
  }

  // Connection status
  parts.push(port.isConnected ? 'Connected' : 'Not connected');

  return parts.join('\n');
}

/**
 * Custom node component that renders handles for each port.
 * Handles are color-coded by payload type.
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
      {/* Input Handles (Left Side) with Labels and Type Colors */}
      {data.inputs.map((input, index) => {
        const topPercent = ((index + 1) * 100) / (data.inputs.length + 1);
        return (
          <React.Fragment key={`input-${input.id}`}>
            {/* Port Label */}
            <div
              style={{
                position: 'absolute',
                left: '-8px',
                top: `${topPercent}%`,
                transform: 'translate(-100%, -50%)',
                fontSize: '11px',
                color: '#aaa',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                paddingRight: '4px',
              }}
            >
              {input.label}
            </div>

            {/* Handle */}
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              style={{
                top: `${topPercent}%`,
                background: input.isConnected ? input.typeColor : '#1e1e1e',
                width: '16px',
                height: '16px',
                border: `2px solid ${input.typeColor}`,
                borderRadius: '50%',
              }}
              title={buildPortTooltip(input, true)}
            />

            {/* Default Source Indicator (only for unconnected ports with defaults) */}
            {!input.isConnected && input.defaultSource && (
              <div
                style={{
                  position: 'absolute',
                  left: '-3px',
                  top: `calc(${topPercent}% - 12px)`,
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
        );
      })}

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

      {/* Port Labels Summary (removed to reduce clutter) */}
      <div style={{ fontSize: '11px', color: '#666', textAlign: 'center' }}>
        {data.inputs.length > 0 && `${data.inputs.length} in`}
        {data.inputs.length > 0 && data.outputs.length > 0 && ' • '}
        {data.outputs.length > 0 && `${data.outputs.length} out`}
      </div>

      {/* Output Handles (Right Side) with Labels and Type Colors */}
      {data.outputs.map((output, index) => {
        const topPercent = ((index + 1) * 100) / (data.outputs.length + 1);
        return (
          <React.Fragment key={`output-${output.id}`}>
            {/* Port Label */}
            <div
              style={{
                position: 'absolute',
                right: '-8px',
                top: `${topPercent}%`,
                transform: 'translate(100%, -50%)',
                fontSize: '11px',
                color: '#aaa',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                paddingLeft: '4px',
              }}
            >
              {output.label}
            </div>

            {/* Handle */}
            <Handle
              type="source"
              position={Position.Right}
              id={output.id}
              style={{
                top: `${topPercent}%`,
                background: output.isConnected ? output.typeColor : '#1e1e1e',
                width: '16px',
                height: '16px',
                border: `2px solid ${output.typeColor}`,
                borderRadius: '50%',
              }}
              title={buildPortTooltip(output, false)}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};
