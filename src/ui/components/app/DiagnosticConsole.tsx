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
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
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
  const revision = rootStore.diagnostics.revision;

  // Debug logging (disabled - floods console)
  // console.log('[DiagnosticConsole] Rendering with diagnostics:', diagnostics.length, 'revision:', revision);

  // Filter diagnostics by severity
  const filteredDiagnostics = filter === 'all'
    ? diagnostics
    : diagnostics.filter((d: Diagnostic) => d.severity === filter);

  // Count by severity
  const errorCount = diagnostics.filter((d: Diagnostic) => d.severity === 'error' || d.severity === 'fatal').length;
  const warnCount = diagnostics.filter((d: Diagnostic) => d.severity === 'warn').length;
  const infoCount = diagnostics.filter((d: Diagnostic) => d.severity === 'info').length;

  // Get compilation stats (reactive)
  const stats = rootStore.diagnostics.compilationStats;
  const avgMs = rootStore.diagnostics.avgCompileMs;
  const medianMs = rootStore.diagnostics.medianCompileMs;

  // Get frame timing stats (reactive)
  const timing = rootStore.diagnostics.frameTiming;

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
      {/* Frame Timing Stats Bar */}
      {timing.frameCount > 0 && (
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #0f3460',
            fontFamily: 'monospace',
            fontSize: '11px',
            background: '#0a0a18',
            color: timing.jitterRatio > 5 ? '#f88' : timing.jitterRatio > 2 ? '#fa8' : '#8a8',
          }}
        >
          <span style={{ color: '#8af' }}>Frame Timing:</span>{' '}
          {(1000 / timing.avgDelta).toFixed(0)}fps |{' '}
          {timing.avgDelta.toFixed(2)}ms avg |{' '}
          <span style={{ color: timing.stdDev > 2 ? '#f88' : timing.stdDev > 1 ? '#fa8' : '#8a8' }}>
            {timing.stdDev.toFixed(2)}ms jitter
          </span>{' '}
          ({timing.jitterRatio.toFixed(1)}%) |{' '}
          [{timing.minDelta.toFixed(1)}-{timing.maxDelta.toFixed(1)}ms] |{' '}
          <span style={{ color: timing.droppedFrames > 0 ? '#f88' : '#8a8' }}>
            {timing.droppedFrames} dropped
          </span>
        </div>
      )}

      {/* Compilation Stats Bar */}
      {stats.count > 0 && (
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #0f3460',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#8a8',
            background: '#0a0a18',
          }}
        >
          <span style={{ color: '#8af' }}>Compilations:</span> {stats.count} | Last: {stats.recentMs[stats.recentMs.length - 1]?.toFixed(1) ?? '-'}ms | Avg: {avgMs.toFixed(1)}ms | Med: {medianMs.toFixed(1)}ms | Min: {stats.minMs === Infinity ? '-' : stats.minMs.toFixed(1)}ms | Max: {stats.maxMs.toFixed(1)}ms
        </div>
      )}

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

        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, newFilter) => {
            if (newFilter !== null) {
              setFilter(newFilter);
            }
          }}
          size="small"
          sx={{
            gap: '4px',
            '& .MuiToggleButton-root': {
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '12px',
              textTransform: 'none',
              color: '#666',
              '&.Mui-selected': {
                color: '#fff',
                fontWeight: 'bold',
              },
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.05)',
              },
            },
            '& .MuiToggleButton-root.Mui-selected:hover': {
              background: 'rgba(255, 255, 255, 0.1)',
            },
          }}
        >
          <ToggleButton
            value="all"
            sx={{
              '&.Mui-selected': {
                background: '#666',
              },
            }}
          >
            All ({diagnostics.length})
          </ToggleButton>
          <ToggleButton
            value="error"
            sx={{
              '&.Mui-selected': {
                background: '#e74c3c',
              },
            }}
          >
            Errors ({errorCount})
          </ToggleButton>
          <ToggleButton
            value="warn"
            sx={{
              '&.Mui-selected': {
                background: '#f39c12',
              },
            }}
          >
            Warnings ({warnCount})
          </ToggleButton>
          <ToggleButton
            value="info"
            sx={{
              '&.Mui-selected': {
                background: '#3498db',
              },
            }}
          >
            Info ({infoCount})
          </ToggleButton>
        </ToggleButtonGroup>
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
              ? `No diagnostics (rev: ${revision})`
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
