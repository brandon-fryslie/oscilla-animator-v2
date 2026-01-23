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
  portHighlight: ReturnType<typeof useStores>['portHighlight']
): React.CSSProperties | undefined {
  const { hoveredPort, isPortCompatible } = portHighlight;

  // Don't highlight if no port is hovered
  if (!hoveredPort) return undefined;

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
        padding: '12px 16px',
        borderRadius: '10px',
        border: '1px solid rgba(78, 205, 196, 0.2)',
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
        color: '#e2e8f0',
        minWidth: '180px',
        fontSize: '13px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
        backdropFilter: 'blur(4px)',
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
                background: input.isConnected 
                  ? input.typeColor 
                  : `linear-gradient(135deg, ${input.typeColor}40 0%, #1a1a2e 100%)`,
                width: '14px',
                height: '14px',
                border: `2px solid ${input.typeColor}`,
                borderRadius: '50%',
                boxShadow: isSelected 
                  ? `0 0 12px 3px ${input.typeColor}80, inset 0 0 4px ${input.typeColor}` 
                  : input.isConnected 
                    ? `0 0 6px 1px ${input.typeColor}40`
                    : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
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
          fontWeight: 600,
          marginBottom: '6px',
          fontSize: '14px',
          letterSpacing: '0.3px',
          color: '#f1f5f9',
        }}
      >
        {data.label}
      </div>

      {/* Port Labels Summary (removed to reduce clutter) */}
      <div style={{ 
        fontSize: '10px', 
        color: '#64748b', 
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}>
        {data.inputs.length > 0 && (
          <span style={{ 
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}>
            <span style={{ opacity: 0.7 }}>◀</span> {data.inputs.length}
          </span>
        )}
        {data.inputs.length > 0 && data.outputs.length > 0 && (
          <span style={{ color: '#334155' }}>•</span>
        )}
        {data.outputs.length > 0 && (
          <span style={{ 
            color: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}>
            {data.outputs.length} <span style={{ opacity: 0.7 }}>▶</span>
          </span>
        )}
      </div>

      {/* Parameter Controls */}
      {data.params.length > 0 && (
        <div
          style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(100, 116, 139, 0.2)',
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
                background: output.isConnected 
                  ? output.typeColor 
                  : `linear-gradient(135deg, ${output.typeColor}40 0%, #1a1a2e 100%)`,
                width: '14px',
                height: '14px',
                border: `2px solid ${output.typeColor}`,
                borderRadius: '50%',
                boxShadow: isSelected 
                  ? `0 0 12px 3px ${output.typeColor}80, inset 0 0 4px ${output.typeColor}` 
                  : output.isConnected 
                    ? `0 0 6px 1px ${output.typeColor}40`
                    : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
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
