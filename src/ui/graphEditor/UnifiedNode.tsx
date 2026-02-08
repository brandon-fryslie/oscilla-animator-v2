/**
 * UnifiedNode - Shared node component for all graph editors
 *
 * Replaces both OscillaNode (main editor) and InternalBlockNode (composite editor).
 * Uses GraphEditorContext to access adapter and feature flags.
 *
 * Key features:
 * - Type-colored port handles
 * - Port labels with positioning
 * - Inline parameter editing (conditional on feature flag)
 * - Default source editing (conditional on feature flag)
 * - DisplayName editing (conditional on adapter support)
 * - Port hover popover
 * - Port context menu
 *
 * ARCHITECTURAL: No direct store imports - uses context for adapter and stores.
 */

import React, { useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { observer } from 'mobx-react-lite';
import { useGraphEditor } from './GraphEditorContext';
import { useStores } from '../../stores';
import type { UnifiedNodeData, PortData } from './nodeDataTransform';
import type { DefaultSource, PortId, BlockId } from '../../types';
import { ParameterControl, DefaultSourceControl } from '../reactFlowEditor/ParameterControls';
import { PortInfoPopover } from '../reactFlowEditor/PortInfoPopover';
import { DisplayNameEditor } from '../components/DisplayNameEditor';
import {
  formatProvenanceTooltip,
  formatCanonicalTypeTooltip,
  getAdapterBadgeLabel,
  getUnresolvedWarning,
} from './portTooltipFormatters';

/**
 * Format a default source for display in tooltip.
 */
function formatDefaultSource(ds: DefaultSource): string {
  if (ds.blockType === 'TimeRoot') {
    return `Default: TimeRoot.${ds.output}`;
  }

  if (ds.blockType === 'Const' && ds.params?.value !== undefined) {
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

  return `Default: ${ds.blockType}.${ds.output}`;
}

/**
 * Get indicator color based on default source type.
 */
function getIndicatorColor(ds: DefaultSource): string {
  if (ds.blockType === 'TimeRoot') {
    return '#2196F3'; // Blue for TimeRoot
  }
  return '#4CAF50'; // Green for other blocks
}

/**
 * Get highlight style for a port based on compatibility.
 */
function getPortHighlightStyle(
  blockId: BlockId,
  portId: PortId,
  portHighlight: ReturnType<typeof useGraphEditor>['portHighlight']
): React.CSSProperties | undefined {
  if (!portHighlight) return undefined;

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

/**
 * Port diagnostic state.
 * Priority: error > warning > selected > none
 */
type PortState = 'error' | 'warning' | 'selected' | 'none';

/**
 * Get port diagnostic/selection state for styling.
 * Checks diagnostics store for errors/warnings, then selection store.
 */
function getPortState(
  blockId: BlockId,
  portId: PortId,
  diagnosticsStore: ReturnType<typeof useStores>['diagnostics'],
  selectedPort: { blockId: BlockId; portId: PortId } | null
): PortState {
  // Check diagnostics (error takes priority over warning)
  const diagnostics = diagnosticsStore.getDiagnosticsForPort(blockId, portId);
  const hasError = diagnostics.some(d => d.severity === 'error' || d.severity === 'fatal');
  const hasWarning = diagnostics.some(d => d.severity === 'warn');

  if (hasError) return 'error';
  if (hasWarning) return 'warning';

  // Check selection
  if (selectedPort?.blockId === blockId && selectedPort?.portId === portId) {
    return 'selected';
  }

  return 'none';
}

/** State for hovered port popover */
interface HoveredPortState {
  port: PortData;
  isInput: boolean;
  anchorEl: HTMLElement;
}

/**
 * UnifiedNode - Adapter-powered node component.
 */
export const UnifiedNode: React.FC<NodeProps<UnifiedNodeData>> = observer(({ data }) => {
  const { adapter, enableParamEditing, selection, portHighlight } = useGraphEditor();
  const { diagnostics } = useStores();

  // Track hovered port for popover
  const [hoveredPortState, setHoveredPortState] = useState<HoveredPortState | null>(null);

  // Check adapter capabilities
  const canEditParams = enableParamEditing && typeof adapter.updateBlockParams === 'function';
  const canEditDisplayName = typeof adapter.updateBlockDisplayName === 'function';
  const canEditDefaultSource = typeof adapter.updateInputPort === 'function';

  // Port click handler
  const handlePortClick = useCallback(
    (portId: PortId, e: React.MouseEvent) => {
      e.stopPropagation();
      if (selection) {
        selection.selectPort(data.blockId as BlockId, portId);
      }
    },
    [data.blockId, selection]
  );

  // Port context menu handler
  const handlePortContextMenu = useCallback(
    (portId: PortId, isInput: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      // Call global handler exposed by parent editor
      const handler = window.__reactFlowPortContextMenu;
      if (handler) {
        handler(data.blockId as BlockId, portId, isInput, e);
      }
    },
    [data.blockId]
  );

  // Port hover handlers
  const handlePortMouseEnter = useCallback(
    (port: PortData, isInput: boolean, e: React.MouseEvent) => {
      if (portHighlight) {
        const direction = isInput ? 'input' : 'output';
        portHighlight.setHoveredPort(data.blockId as BlockId, port.id as PortId, direction);
      }
      setHoveredPortState({
        port,
        isInput,
        anchorEl: e.currentTarget as HTMLElement,
      });
    },
    [data.blockId, portHighlight]
  );

  const handlePortMouseLeave = useCallback(() => {
    if (portHighlight) {
      portHighlight.clearHoveredPort();
    }
    setHoveredPortState(null);
  }, [portHighlight]);

  const selectedPort = selection?.selectedPort;

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
      {/* Input Handles (Left Side) */}
      {data.inputs.map((input, index) => {
        const topPercent = ((index + 1) * 100) / (data.inputs.length + 1);
        const isSelected =
          selectedPort?.blockId === data.blockId && selectedPort?.portId === input.id;
        const highlightStyle = getPortHighlightStyle(
          data.blockId as BlockId,
          input.id as PortId,
          portHighlight
        );

        // Get port state (error, warning, selected, none)
        const portState = getPortState(
          data.blockId as BlockId,
          input.id as PortId,
          diagnostics,
          selectedPort
        );

        // Map state to CSS animation class
        const animationClass =
          portState === 'error'
            ? 'port-error'
            : portState === 'warning'
              ? 'port-warning'
              : portState === 'selected'
                ? 'port-selected'
                : undefined;

        // Compute boxShadow based on state (error/warning override compatibility)
        let boxShadow: string;
        if (portState === 'error' || portState === 'warning') {
          // Animation handles glow — no inline boxShadow override
          boxShadow = 'none';
        } else if (isSelected) {
          boxShadow = `0 0 12px 3px ${input.typeColor}80, inset 0 0 4px ${input.typeColor}`;
        } else if (input.isConnected) {
          boxShadow = `0 0 6px 1px ${input.typeColor}40`;
        } else {
          boxShadow = 'none';
        }

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
              className={animationClass}
              style={{
                top: `${topPercent}%`,
                background: input.isConnected
                  ? input.typeColor
                  : `linear-gradient(135deg, ${input.typeColor}40 0%, #1a1a2e 100%)`,
                width: '14px',
                height: '14px',
                border: `2px solid ${input.typeColor}`,
                borderRadius: '50%',
                boxShadow,
                cursor: 'pointer',
                transition: animationClass ? 'none' : 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                ...highlightStyle,
              }}
            />

            {/* Default Source Indicator */}
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
                title={[
                  formatProvenanceTooltip(input.provenance),
                  input.resolvedType ? formatCanonicalTypeTooltip(input.resolvedType) : input.typeTooltip,
                ].join('\n\n')}
              />
            )}

            {/* Adapter Badge */}
            {input.provenance && getAdapterBadgeLabel(input.provenance) && (
              <div
                style={{
                  position: 'absolute',
                  left: '-18px',
                  top: `calc(${topPercent}% - 4px)`,
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  background: '#f59e0b',
                  color: '#fff',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  fontWeight: 'bold',
                }}
                title={formatProvenanceTooltip(input.provenance)}
              >
                {getAdapterBadgeLabel(input.provenance)}
              </div>
            )}

            {/* Unresolved Warning */}
            {input.provenance && getUnresolvedWarning(input.provenance) && (
              <div
                style={{
                  position: 'absolute',
                  left: '-18px',
                  top: `calc(${topPercent}% - 4px)`,
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  fontWeight: 'bold',
                }}
                title={formatProvenanceTooltip(input.provenance)}
              >
                {getUnresolvedWarning(input.provenance)}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Node Label with Inline Editing */}
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
        {canEditDisplayName ? (
          <DisplayNameEditor
            blockId={data.blockId as BlockId}
            currentDisplayName={data.displayName}
            fallbackLabel={data.label}
            style={{
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '0.3px',
              color: '#f1f5f9',
            }}
            editStyle={{
              fontSize: '14px',
              fontWeight: 600,
              background: '#1a1a2e',
              color: '#f1f5f9',
              textAlign: 'center',
            }}
            errorStyle={{
              fontSize: '10px',
            }}
          />
        ) : (
          // No editing - just display name
          <span>{data.displayName}</span>
        )}
      </div>

      {/* Port Count Summary */}
      <div
        style={{
          fontSize: '10px',
          color: '#64748b',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {data.inputs.length > 0 && (
          <span
            style={{
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <span style={{ opacity: 0.7 }}>◀</span> {data.inputs.length}
          </span>
        )}
        {data.inputs.length > 0 && data.outputs.length > 0 && (
          <span style={{ color: '#334155' }}>•</span>
        )}
        {data.outputs.length > 0 && (
          <span
            style={{
              color: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            {data.outputs.length} <span style={{ opacity: 0.7 }}>▶</span>
          </span>
        )}
      </div>

      {/* Parameter Controls (conditional on feature flag) */}
      {canEditParams && data.params.length > 0 && (
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
              blockId={data.blockId as BlockId}
              paramId={param.id}
              label={param.label}
              value={param.value}
              hint={param.hint}
            />
          ))}
        </div>
      )}

      {/* Default Source Controls (conditional on feature flag) */}
      {canEditDefaultSource &&
        (() => {
          const editableDefaults = data.inputs.filter(
            (input) => !input.isConnected && input.defaultSource?.blockType === 'Const'
          );
          if (editableDefaults.length === 0) return null;
          return (
            <div
              style={{
                marginTop: data.params.length > 0 ? '8px' : '10px',
                paddingTop: data.params.length > 0 ? '8px' : '10px',
                borderTop: data.params.length > 0 ? 'none' : '1px solid rgba(100, 116, 139, 0.2)',
              }}
            >
              {editableDefaults.map((input) => (
                <DefaultSourceControl
                  key={`default-${input.id}`}
                  blockId={data.blockId as BlockId}
                  portId={input.id}
                  portLabel={input.label}
                  defaultSource={input.defaultSource!}
                  hint={input.uiHint}
                />
              ))}
            </div>
          );
        })()}

      {/* Output Handles (Right Side) */}
      {data.outputs.map((output, index) => {
        const topPercent = ((index + 1) * 100) / (data.outputs.length + 1);
        const isSelected =
          selectedPort?.blockId === data.blockId && selectedPort?.portId === output.id;
        const highlightStyle = getPortHighlightStyle(
          data.blockId as BlockId,
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

      {/* Port Info Popover */}
      <PortInfoPopover
        port={hoveredPortState?.port ?? null}
        isInput={hoveredPortState?.isInput ?? true}
        anchorEl={hoveredPortState?.anchorEl ?? null}
        blockId={data.blockId as BlockId}
      />
    </div>
  );
});
