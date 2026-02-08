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
import { resolvePortStyle } from './port-style';
import { graphColors } from './graph-tokens';

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
    return graphColors.timeRootIndicator;
  }
  return graphColors.defaultSourceIndicator;
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
  selectedPort: { blockId: BlockId; portId: PortId } | null | undefined
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

        // Get port state (error, warning, selected, none)
        const portState = getPortState(
          data.blockId as BlockId,
          input.id as PortId,
          diagnostics,
          selectedPort
        );

        // Determine drag highlight state
        let dragHighlight: 'compatible' | 'incompatible' | 'none' = 'none';
        if (portHighlight?.hoveredPort) {
          dragHighlight = portHighlight.isPortCompatible(data.blockId as BlockId, input.id as PortId)
            ? 'compatible'
            : 'incompatible';
        }

        // Resolve port style
        const resolved = resolvePortStyle({
          typeColor: input.typeColor,
          isConnected: input.isConnected,
          isSelected,
          diagnosticLevel: portState === 'error' ? 'error' : portState === 'warning' ? 'warning' : 'none',
          dragHighlight,
        });

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
              className={resolved.className}
              style={{
                top: `${topPercent}%`,
                ...resolved.style,
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
                  background: graphColors.adapterBadge,
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
                  background: graphColors.unresolvedBadge,
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
              color: graphColors.portCountInput,
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <span style={{ opacity: 0.7 }}>◀</span> {data.inputs.length}
          </span>
        )}
        {data.inputs.length > 0 && data.outputs.length > 0 && (
          <span style={{ color: graphColors.portCountSeparator }}>•</span>
        )}
        {data.outputs.length > 0 && (
          <span
            style={{
              color: graphColors.portCountOutput,
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

        // Get port state (error, warning, selected, none)
        const portState = getPortState(
          data.blockId as BlockId,
          output.id as PortId,
          diagnostics,
          selectedPort
        );

        // Determine drag highlight state
        let dragHighlight: 'compatible' | 'incompatible' | 'none' = 'none';
        if (portHighlight?.hoveredPort) {
          dragHighlight = portHighlight.isPortCompatible(data.blockId as BlockId, output.id as PortId)
            ? 'compatible'
            : 'incompatible';
        }

        // Resolve port style
        const resolved = resolvePortStyle({
          typeColor: output.typeColor,
          isConnected: output.isConnected,
          isSelected,
          diagnosticLevel: portState === 'error' ? 'error' : portState === 'warning' ? 'warning' : 'none',
          dragHighlight,
        });

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
              className={resolved.className}
              style={{
                top: `${topPercent}%`,
                ...resolved.style,
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
