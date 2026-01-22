/**
 * OscillaNode - Custom ReactFlow node component for Oscilla blocks.
 *
 * Renders port-specific handles for proper multi-port connections.
 * Each input/output port gets its own Handle with unique ID.
 * Handles are color-coded by payload type with type tooltips.
 * Supports port hover highlighting for compatible ports.
 * Shows detailed port info popover on hover.
 */

import React, { useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { observer } from 'mobx-react-lite';
import type { OscillaNodeData, PortData } from './nodes';
import type { DefaultSource, PortId, BlockId } from '../../types';
import { useStores } from '../../stores';
import { ParameterControl } from './ParameterControls';
import { PortInfoPopover } from './PortInfoPopover';

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
 * Get highlight style for a port based on compatibility.
 */
function getPortHighlightStyle(
  blockId: BlockId,
  portId: PortId,
  isConnected: boolean,
  portHighlight: ReturnType<typeof useStores>['portHighlight']
): React.CSSProperties | undefined {
  const { hoveredPort, isPortCompatible } = portHighlight;

  // Don't highlight if no port is hovered
  if (!hoveredPort) return undefined;

  // Don't highlight connected ports
  if (isConnected) return undefined;

  // Check if this port is compatible
  const isCompatible = isPortCompatible(blockId, portId);

  if (isCompatible) {
    // Green glow for compatible ports
    return {
      boxShadow: '0 0 12px 4px #4ade80',
      filter: 'brightness(1.3)',
    };
  } else {
    // Gray out incompatible ports
    return {
      opacity: 0.3,
    };
  }
}

/** State for hovered port popover */
interface HoveredPortState {
  port: PortData;
  isInput: boolean;
  anchorEl: HTMLElement;
}

/**
 * Custom node component that renders handles for each port.
 * Handles are color-coded by payload type.
 */
export const OscillaNode: React.FC<NodeProps<OscillaNodeData>> = observer(({ data }) => {
  const { selection, portHighlight } = useStores();
  const { selectedPort } = selection;
  const { setHoveredPort, clearHoveredPort } = portHighlight;

  // Track hovered port for popover
  const [hoveredPortState, setHoveredPortState] = useState<HoveredPortState | null>(null);

  const handlePortClick = useCallback(
    (portId: PortId, e: React.MouseEvent) => {
      e.stopPropagation();
      selection.selectPort(data.blockId, portId);
    },
    [data.blockId, selection]
  );

  const handlePortContextMenu = useCallback(
    (portId: PortId, isInput: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      // Call global handler exposed by ReactFlowEditor
      const handler = (window as any).__reactFlowPortContextMenu;
      if (handler) {
        handler(data.blockId as BlockId, portId, isInput, e);
      }
    },
    [data.blockId]
  );

  const handlePortMouseEnter = useCallback(
    (port: PortData, isInput: boolean, e: React.MouseEvent) => {
      const direction = isInput ? 'input' : 'output';
      setHoveredPort(data.blockId, port.id as PortId, direction);
      setHoveredPortState({
        port,
        isInput,
        anchorEl: e.currentTarget as HTMLElement,
      });
    },
    [data.blockId, setHoveredPort]
  );

  const handlePortMouseLeave = useCallback(() => {
    clearHoveredPort();
    setHoveredPortState(null);
  }, [clearHoveredPort]);

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
        const isSelected =
          selectedPort?.blockId === data.blockId && selectedPort?.portId === input.id;
        const highlightStyle = getPortHighlightStyle(
          data.blockId,
          input.id as PortId,
          input.isConnected,
          portHighlight
        );

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
                color: isSelected ? '#fff' : '#aaa',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                paddingRight: '4px',
                fontWeight: isSelected ? 'bold' : 'normal',
              }}
            >
              {input.label}
            </div>

            {/* Handle */}
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              onClick={(e) => handlePortClick(input.id as PortId, e)}
              onContextMenu={(e) => handlePortContextMenu(input.id as PortId, true, e)}
              onMouseEnter={(e) => handlePortMouseEnter(input, true, e)}
              onMouseLeave={handlePortMouseLeave}
              style={{
                top: `${topPercent}%`,
                background: input.isConnected ? input.typeColor : '#1e1e1e',
                width: '16px',
                height: '16px',
                border: `2px solid ${input.typeColor}`,
                borderRadius: '50%',
                boxShadow: isSelected ? `0 0 8px 2px ${input.typeColor}` : undefined,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                ...highlightStyle,
              }}
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

      {/* Parameter Controls */}
      {data.params.length > 0 && (
        <div
          style={{
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid #333',
          }}
        >
          {data.params.map((param) => (
            <ParameterControl
              key={param.id}
              blockId={data.blockId}
              paramId={param.id}
              label={param.label}
              value={param.value}
              hint={param.hint}
            />
          ))}
        </div>
      )}

      {/* Output Handles (Right Side) with Labels and Type Colors */}
      {data.outputs.map((output, index) => {
        const topPercent = ((index + 1) * 100) / (data.outputs.length + 1);
        const isSelected =
          selectedPort?.blockId === data.blockId && selectedPort?.portId === output.id;
        const highlightStyle = getPortHighlightStyle(
          data.blockId,
          output.id as PortId,
          output.isConnected,
          portHighlight
        );

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
                color: isSelected ? '#fff' : '#aaa',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                paddingLeft: '4px',
                fontWeight: isSelected ? 'bold' : 'normal',
              }}
            >
              {output.label}
            </div>

            {/* Handle */}
            <Handle
              type="source"
              position={Position.Right}
              id={output.id}
              onClick={(e) => handlePortClick(output.id as PortId, e)}
              onContextMenu={(e) => handlePortContextMenu(output.id as PortId, false, e)}
              onMouseEnter={(e) => handlePortMouseEnter(output, false, e)}
              onMouseLeave={handlePortMouseLeave}
              style={{
                top: `${topPercent}%`,
                background: output.isConnected ? output.typeColor : '#1e1e1e',
                width: '16px',
                height: '16px',
                border: `2px solid ${output.typeColor}`,
                borderRadius: '50%',
                boxShadow: isSelected ? `0 0 8px 2px ${output.typeColor}` : undefined,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                ...highlightStyle,
              }}
            />
          </React.Fragment>
        );
      })}

      {/* Port Info Popover - rendered once for whichever port is hovered */}
      <PortInfoPopover
        port={hoveredPortState?.port ?? null}
        isInput={hoveredPortState?.isInput ?? true}
        anchorEl={hoveredPortState?.anchorEl ?? null}
        blockId={data.blockId}
      />
    </div>
  );
});
