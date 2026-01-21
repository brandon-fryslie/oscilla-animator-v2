/**
 * SimpleDebugPanel - Minimal Debug Value Display
 *
 * Fixed bottom-right panel that shows runtime values for hovered edges.
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
import type { EdgeValueResult } from '../../services/DebugService';
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
}

/**
 * SimpleDebugPanel component.
 * Shows current value for hovered edge in bottom-right corner.
 */
export const SimpleDebugPanel: React.FC<SimpleDebugPanelProps> = ({
  edgeValue,
  edgeLabel,
  enabled,
}) => {
  if (!enabled) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 320,
        background: 'rgba(16, 24, 40, 0.95)',
        border: '1px solid rgba(78, 205, 196, 0.3)',
        borderRadius: 8,
        padding: 16,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        color: '#e2e8f0',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
        pointerEvents: 'none', // Don't block interactions
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12, color: '#4ecdc4' }}>
        Debug Probe
      </div>

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
