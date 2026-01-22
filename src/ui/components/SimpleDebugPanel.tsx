/**
 * SimpleDebugPanel - Minimal Debug Value Display
 *
 * Fixed bottom-right panel that shows runtime values for hovered edges.
 * Also displays mapping errors when debug system is not fully operational.
 *
 * LIMITATION: Only works for Signal edges (scalar values).
 * Field edges (arrays/buffers) don't show values because:
 * - Fields use `materialize` steps, not `evalSig` steps
 * - Displaying arrays requires visualization (histogram, min/max, spatial view)
 * - Field support deferred until after field refactor
 *
 * See: .agent_planning/debug-probe/README.md
 */

import React from 'react';
import type { EdgeValueResult, DebugServiceStatus } from '../../services/DebugService';
import type { SignalType } from '../../core/canonical-types';

/**
 * Format a numeric value based on its signal type.
 *
 * Sprint 1: Basic formatting (float, phase, color).
 * Sprint 2: Will add all signal types from spec.
 */
function formatValue(value: number, type: SignalType): string {
  const payload = type.payload;

  switch (payload) {
    case 'phase':
      // Phase is 0..1, display as percentage
      return `${(value * 100).toFixed(1)}%`;

    case 'color':
      // Color is packed RGB, display as hex
      // For now, just show the raw number (proper color unpacking in Sprint 2)
      return `#${Math.floor(value).toString(16).padStart(6, '0')}`;

    case 'float':
    case 'int':
      // Numeric values, show 2 decimal places
      return value.toFixed(2);

    default:
      // Unknown type, show raw value
      return value.toFixed(3);
  }
}

/**
 * Format signal type for display.
 */
function formatType(type: SignalType): string {
  return `Signal:${type.payload}`;
}

export interface SimpleDebugPanelProps {
  /** Edge value to display, or null if no edge hovered */
  edgeValue: EdgeValueResult | null;

  /** Edge identifier for display (e.g., "from.port → to.port") */
  edgeLabel?: string | null;

  /** Whether panel is enabled */
  enabled: boolean;

  /** Debug service status for error display */
  status?: DebugServiceStatus | null;
}

/**
 * SimpleDebugPanel component.
 * Shows current value for hovered edge in bottom-right corner.
 * Displays mapping errors if debug system is not healthy.
 */
export const SimpleDebugPanel: React.FC<SimpleDebugPanelProps> = ({
  edgeValue,
  edgeLabel,
  enabled,
  status,
}) => {
  if (!enabled) {
    return null;
  }

  // Show error banner if there are unmapped edges
  const hasErrors = status && !status.isHealthy && status.unmappedEdges.length > 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 360,
        background: 'rgba(16, 24, 40, 0.95)',
        border: hasErrors 
          ? '1px solid rgba(239, 68, 68, 0.5)' 
          : '1px solid rgba(78, 205, 196, 0.3)',
        borderRadius: 8,
        padding: 16,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        color: '#e2e8f0',
        boxShadow: hasErrors 
          ? '0 4px 12px rgba(239, 68, 68, 0.2)' 
          : '0 4px 12px rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
        pointerEvents: 'none', // Don't block interactions
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12, color: '#4ecdc4' }}>
        Debug Probe
      </div>

      {/* Error Banner */}
      {hasErrors && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 6,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ 
            color: '#ef4444', 
            fontWeight: 600, 
            fontSize: 12, 
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>⚠</span>
            MAPPING ERROR
          </div>
          <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 6 }}>
            Failed to map {status!.unmappedEdges.length} edge{status!.unmappedEdges.length > 1 ? 's' : ''}:
          </div>
          <div style={{ 
            maxHeight: 80, 
            overflowY: 'auto', 
            fontSize: 10, 
            fontFamily: 'monospace',
            color: '#fda4af',
          }}>
            {status!.unmappedEdges.slice(0, 5).map((edge, idx) => (
              <div key={idx} style={{ marginBottom: 2 }}>
                {edge.fromBlockId}.{edge.fromPort} → {edge.toBlockId}.{edge.toPort}
              </div>
            ))}
            {status!.unmappedEdges.length > 5 && (
              <div style={{ color: '#fca5a5', fontStyle: 'italic' }}>
                ...and {status!.unmappedEdges.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {status && (
        <div style={{ 
          fontSize: 11, 
          color: '#64748b', 
          marginBottom: 10,
          paddingBottom: 10,
          borderBottom: '1px solid rgba(100, 116, 139, 0.2)',
        }}>
          <span style={{ color: status.isHealthy ? '#4ade80' : '#fbbf24' }}>
            {status.totalEdgesMapped}
          </span>
          {' '}edges mapped
          {status.totalPortsMapped > 0 && (
            <>
              {' • '}
              <span style={{ color: '#4ade80' }}>{status.totalPortsMapped}</span>
              {' '}ports
            </>
          )}
        </div>
      )}

      {edgeValue ? (
        <>
          {edgeLabel && (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#94a3b8' }}>
              {edgeLabel}
            </div>
          )}
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#94a3b8' }}>Type: </span>
            <span style={{ color: '#fbbf24', fontFamily: 'monospace' }}>
              {formatType(edgeValue.type)}
            </span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#94a3b8' }}>Value: </span>
            <span style={{ color: '#4ecdc4', fontWeight: 600, fontSize: 16 }}>
              {formatValue(edgeValue.value, edgeValue.type)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Slot: {edgeValue.slotId}
          </div>
        </>
      ) : (
        <div style={{ color: '#64748b', fontStyle: 'italic' }}>
          Hover an edge to inspect its value
        </div>
      )}
    </div>
  );
};
