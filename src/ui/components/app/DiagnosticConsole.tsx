/**
 * DiagnosticConsole - Diagnostics Display Component
 *
 * Displays active diagnostics with severity filtering.
 *
 * Features:
 * - Reactive updates via MobX (observes DiagnosticsStore)
 * - Severity icons (❌/⚠️/ℹ️/💡)
 * - Formatted target display
 * - Severity filtering
 * - Auto-scroll to new diagnostics
 *
 * Architecture:
 * - DiagnosticConsole: Main container (observer)
 * - DiagnosticRow: Single diagnostic display
 * - Uses MobX observer pattern for reactivity
 */

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../../stores';
import type { Diagnostic, Severity, TargetRef } from '../../../diagnostics/types';

// =============================================================================
// DiagnosticConsole Component
// =============================================================================

/**
 * DiagnosticConsole displays all active diagnostics.
 *
 * MobX observer: Re-renders when diagnostics change.
 */
export const DiagnosticConsole: React.FC = observer(() => {
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  // Get active diagnostics (reactive - triggers re-render when changed)
  const diagnostics = rootStore.diagnostics.activeDiagnostics;

  // Filter diagnostics by severity
  const filteredDiagnostics = filter === 'all'
    ? diagnostics
    : diagnostics.filter((d: Diagnostic) => d.severity === filter);

  // Count by severity
  const errorCount = diagnostics.filter((d: Diagnostic) => d.severity === 'error' || d.severity === 'fatal').length;
  const warnCount = diagnostics.filter((d: Diagnostic) => d.severity === 'warn').length;
  const infoCount = diagnostics.filter((d: Diagnostic) => d.severity === 'info').length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0f0f23',
        color: '#eee',
      }}
    >
      {/* Header with filter buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid #0f3460',
          gap: '8px',
        }}
      >
        <span style={{ fontWeight: 'bold', marginRight: 'auto' }}>Diagnostics</span>

        <FilterButton
          label="All"
          count={diagnostics.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterButton
          label="Errors"
          count={errorCount}
          active={filter === 'error'}
          onClick={() => setFilter('error')}
          color="#e74c3c"
        />
        <FilterButton
          label="Warnings"
          count={warnCount}
          active={filter === 'warn'}
          onClick={() => setFilter('warn')}
          color="#f39c12"
        />
        <FilterButton
          label="Info"
          count={infoCount}
          active={filter === 'info'}
          onClick={() => setFilter('info')}
          color="#3498db"
        />
      </div>

      {/* Diagnostic list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {filteredDiagnostics.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: '#666',
            }}
          >
            {filter === 'all'
              ? 'No diagnostics'
              : `No ${filter} diagnostics`}
          </div>
        ) : (
          filteredDiagnostics.map((diag: Diagnostic) => (
            <DiagnosticRow key={diag.id} diagnostic={diag} />
          ))
        )}
      </div>
    </div>
  );
});

// =============================================================================
// FilterButton Component
// =============================================================================

interface FilterButtonProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
}

const FilterButton: React.FC<FilterButtonProps> = ({
  label,
  count,
  active,
  onClick,
  color = '#666',
}) => {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        border: 'none',
        borderRadius: '4px',
        background: active ? color : 'transparent',
        color: active ? '#fff' : color,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: active ? 'bold' : 'normal',
        transition: 'all 0.2s',
      }}
    >
      {label} ({count})
    </button>
  );
};

// =============================================================================
// DiagnosticRow Component
// =============================================================================

interface DiagnosticRowProps {
  diagnostic: Diagnostic;
}

/**
 * DiagnosticRow displays a single diagnostic.
 *
 * Layout:
 * - Icon (severity indicator)
 * - Title (bold, short summary)
 * - Message (detailed explanation)
 * - Target (formatted location)
 */
const DiagnosticRow: React.FC<DiagnosticRowProps> = ({ diagnostic }) => {
  const icon = getSeverityIcon(diagnostic.severity);
  const color = getSeverityColor(diagnostic.severity);
  const targetStr = formatTargetRef(diagnostic.primaryTarget);

  return (
    <div
      style={{
        padding: '8px',
        marginBottom: '8px',
        borderLeft: `3px solid ${color}`,
        background: '#16213e',
        borderRadius: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ marginRight: '8px', fontSize: '16px' }}>{icon}</span>
        <span style={{ fontWeight: 'bold', color }}>{diagnostic.title}</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#888' }}>
          {diagnostic.code}
        </span>
      </div>

      <div style={{ fontSize: '13px', marginLeft: '24px', marginBottom: '4px' }}>
        {diagnostic.message}
      </div>

      {targetStr && (
        <div style={{ fontSize: '11px', marginLeft: '24px', color: '#888' }}>
          Target: {targetStr}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Returns icon for severity level.
 */
function getSeverityIcon(severity: Severity): string {
  switch (severity) {
    case 'fatal':
      return '💀';
    case 'error':
      return '❌';
    case 'warn':
      return '⚠️';
    case 'info':
      return 'ℹ️';
    case 'hint':
      return '💡';
    default: {
      const _exhaustive: never = severity;
      return '❓';
    }
  }
}

/**
 * Returns color for severity level.
 */
function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'fatal':
      return '#c0392b';
    case 'error':
      return '#e74c3c';
    case 'warn':
      return '#f39c12';
    case 'info':
      return '#3498db';
    case 'hint':
      return '#95a5a6';
    default: {
      const _exhaustive: never = severity;
      return '#666';
    }
  }
}

/**
 * Formats a TargetRef to a human-readable string.
 */
function formatTargetRef(target: TargetRef): string {
  switch (target.kind) {
    case 'block':
      return `Block ${target.blockId}`;

    case 'port':
      return `Port ${target.blockId}.${target.portId}`;

    case 'bus':
      return `Bus ${target.busId}`;

    case 'binding':
      return `Binding ${target.bindingId} (${target.direction})`;

    case 'timeRoot':
      return `TimeRoot ${target.blockId}`;

    case 'graphSpan': {
      if (target.blockIds.length === 0) {
        return target.spanKind ? `Graph (${target.spanKind})` : 'Whole graph';
      }
      const idsStr = target.blockIds.slice(0, 3).join(', ');
      const more = target.blockIds.length > 3 ? `, +${target.blockIds.length - 3} more` : '';
      return `Graph span: ${idsStr}${more}`;
    }

    case 'composite':
      return target.instanceId
        ? `Composite ${target.compositeDefId} (instance ${target.instanceId})`
        : `Composite ${target.compositeDefId}`;

    default: {
      const _exhaustive: never = target;
      return 'Unknown target';
    }
  }
}
