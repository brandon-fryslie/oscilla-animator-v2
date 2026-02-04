/**
 * ErrorBadge - Visual error indicator for graph nodes
 *
 * Displays a red circle badge with error count in the top-right corner of nodes.
 * Shows warnings with orange badges. Clicking the badge could open details (future).
 */

import React from 'react';
import type { Diagnostic } from '../../diagnostics/types';

interface ErrorBadgeProps {
  /** Diagnostics to display */
  diagnostics: Diagnostic[];
  /** Position relative to node (default: top-right) */
  position?: { x: number; y: number };
  /** Size of badge (default: 18px) */
  size?: number;
}

/**
 * Determines badge color and severity based on diagnostics.
 */
function getBadgeStyle(diagnostics: Diagnostic[]): { bg: string; border: string; shadow: string; label: string } {
  const hasError = diagnostics.some(d => d.severity === 'error' || d.severity === 'fatal');
  const hasWarning = diagnostics.some(d => d.severity === 'warn');

  if (hasError) {
    return {
      bg: '#ef4444',
      border: '#dc2626',
      shadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
      label: 'error',
    };
  }

  if (hasWarning) {
    return {
      bg: '#f59e0b',
      border: '#d97706',
      shadow: '0 2px 4px rgba(245, 158, 11, 0.4)',
      label: 'warning',
    };
  }

  // Info/hint (shouldn't show badge, but just in case)
  return {
    bg: '#60a5fa',
    border: '#3b82f6',
    shadow: '0 2px 4px rgba(96, 165, 250, 0.4)',
    label: 'info',
  };
}

/**
 * ErrorBadge component.
 * Renders a circular badge with count and tooltip.
 */
export const ErrorBadge: React.FC<ErrorBadgeProps> = ({
  diagnostics,
  position = { x: 0, y: 0 },
  size = 18,
}) => {
  if (diagnostics.length === 0) {
    return null;
  }

  // Filter to only errors and warnings (don't show badge for info/hint)
  const significantDiags = diagnostics.filter(
    d => d.severity === 'error' || d.severity === 'fatal' || d.severity === 'warn'
  );

  if (significantDiags.length === 0) {
    return null;
  }

  const count = significantDiags.length;
  const style = getBadgeStyle(significantDiags);

  // Build tooltip text
  const tooltip = significantDiags
    .slice(0, 5) // Limit to first 5 for tooltip
    .map(d => `${d.severity.toUpperCase()}: ${d.message}`)
    .join('\n') + (significantDiags.length > 5 ? `\n...and ${significantDiags.length - 5} more` : '');

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'all',
        cursor: 'pointer',
        zIndex: 10,
      }}
      title={tooltip}
      onClick={(e) => {
        e.stopPropagation();
        // Future: open diagnostic details panel
        console.log('Diagnostics:', significantDiags);
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: style.bg,
          border: `2px solid ${style.border}`,
          boxShadow: style.shadow,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.6,
          fontWeight: 'bold',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          userSelect: 'none',
        }}
      >
        {count}
      </div>
    </div>
  );
};
