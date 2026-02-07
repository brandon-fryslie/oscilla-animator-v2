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
import { useStores } from '../../../stores';
import type { RootStore } from '../../../stores';
import type { Diagnostic, Severity, TargetRef, DiagnosticAction } from '../../../diagnostics/types';
import type { TimingWindowEntry, TimingRangeStats, JankEvent } from '../../../stores/DiagnosticsStore';

// =============================================================================
// DiagnosticConsole Component
// =============================================================================

/**
 * DiagnosticConsole displays all active diagnostics.
 *
 * MobX observer: Re-renders when diagnostics change.
 */
export const DiagnosticConsole: React.FC = observer(() => {
  const rootStore = useStores();
  const diagnosticsStore = rootStore.diagnostics;
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  // Get active diagnostics (reactive - triggers re-render when changed)
  const diagnostics = diagnosticsStore.activeDiagnostics;
  const revision = diagnosticsStore.revision;

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
  const stats = diagnosticsStore.compilationStats;
  const avgMs = diagnosticsStore.avgCompileMs;
  const medianMs = diagnosticsStore.medianCompileMs;
  const lastMs = diagnosticsStore.lastCompileMs;

  // Get multi-window frame timing stats (reactive)
  const timingWindows = diagnosticsStore.frameTimingWindows;

  // Get jank events (reactive)
  const jankLog = diagnosticsStore.jankLog;

  // Get memory stats (reactive) - Sprint: memory-instrumentation
  const memory = diagnosticsStore.memoryStats;

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
      {/* Frame Timing Multi-Window Table */}
      {timingWindows.length > 0 && (
        <div
          style={{
            padding: '4px 12px',
            borderBottom: '1px solid #0f3460',
            fontFamily: 'monospace',
            fontSize: '11px',
            background: '#0a0a18',
          }}
        >
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 1fr 1fr 60px',
            gap: '0 6px',
            color: '#8af',
            paddingBottom: '2px',
            borderBottom: '1px solid #1a2a4a',
            marginBottom: '1px',
          }}>
            <span></span>
            <span style={{ textAlign: 'right' }}>fps</span>
            <span style={{ textAlign: 'right' }}>ms/frame</span>
            <span style={{ textAlign: 'right' }}>jitter</span>
            <span style={{ textAlign: 'right' }}>dropped</span>
          </div>
          {/* Data rows */}
          {timingWindows.map((w: TimingWindowEntry) => (
            <div key={w.label} style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 1fr 1fr 60px',
              gap: '0 6px',
              lineHeight: '16px',
              opacity: w.full ? 1 : 0.5,
            }}>
              <span style={{ color: '#888' }}>{w.label}</span>
              <span style={{ textAlign: 'right', color: fpsColor(w.stats.fps.mean) }}>
                {formatRange(w.stats.fps, 0)}
              </span>
              <span style={{ textAlign: 'right', color: msColor(w.stats.msPerFrame.max) }}>
                {formatRange(w.stats.msPerFrame, 1)}
              </span>
              <span style={{ textAlign: 'right', color: jitterColor(w.stats.jitter.mean) }}>
                {formatRange(w.stats.jitter, 1)}
              </span>
              <span style={{ textAlign: 'right', color: droppedColor(w.stats.dropped) }}>
                {w.stats.dropped}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Jank Event Log */}
      {jankLog.length > 0 && (
        <div
          style={{
            padding: '4px 12px',
            borderBottom: '1px solid #0f3460',
            fontFamily: 'monospace',
            fontSize: '11px',
            background: '#0a0a18',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        >
          <div style={{ color: '#f88', paddingBottom: '2px', borderBottom: '1px solid #1a2a4a', marginBottom: '1px' }}>
            Jank Log ({jankLog.length} events)
          </div>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '64px 70px 60px 60px 1fr',
            gap: '0 6px',
            color: '#666',
            lineHeight: '14px',
          }}>
            <span>time</span>
            <span style={{ textAlign: 'right' }}>delta</span>
            <span style={{ textAlign: 'right' }}>exec</span>
            <span style={{ textAlign: 'right' }}>render</span>
            <span style={{ textAlign: 'right' }}>browser gap</span>
          </div>
          {/* Events, newest first */}
          {[...jankLog].reverse().map((e: JankEvent, i: number) => {
            const isBrowser = e.browserGapMs > e.prevExecMs + e.prevRenderMs;
            return (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '64px 70px 60px 60px 1fr',
                gap: '0 6px',
                lineHeight: '16px',
                color: '#ccc',
              }}>
                <span style={{ color: '#888' }}>{e.wallTime}</span>
                <span style={{ textAlign: 'right', color: '#f88' }}>{e.deltaMs.toFixed(0)}ms</span>
                <span style={{ textAlign: 'right', color: e.prevExecMs > 50 ? '#f88' : '#8a8' }}>
                  {e.prevExecMs.toFixed(1)}ms
                </span>
                <span style={{ textAlign: 'right', color: e.prevRenderMs > 50 ? '#f88' : '#8a8' }}>
                  {e.prevRenderMs.toFixed(1)}ms
                </span>
                <span style={{ textAlign: 'right', color: isBrowser ? '#fa8' : '#8a8' }}>
                  {e.browserGapMs.toFixed(0)}ms{isBrowser ? ' ← browser/GC' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Memory Stats Bar (Sprint: memory-instrumentation) */}
      {memory.pooledBytes > 0 && (
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #0f3460',
            fontFamily: 'monospace',
            fontSize: '11px',
            background: '#0a0a18',
            color: memory.poolAllocs !== memory.poolReleases ? '#f88' : '#8a8',
          }}
        >
          <span style={{ color: '#8af' }}>Memory:</span>{' '}
          {formatBytes(memory.pooledBytes)} pooled |{' '}
          <span style={{ color: memory.poolAllocs !== memory.poolReleases ? '#f88' : '#8a8' }}>
            {memory.poolAllocs} alloc / {memory.poolReleases} release
          </span>{' '}
          {memory.poolAllocs !== memory.poolReleases && (
            <span style={{ color: '#f88' }}>(LEAK!)</span>
          )}
          | {memory.poolKeyCount} sizes
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
          <span style={{ color: '#8af' }}>Compilations:</span> {stats.count} | Last: {lastMs.toFixed(1)}ms | Avg: {avgMs.toFixed(1)}ms | Med: {medianMs.toFixed(1)}ms | Min: {stats.minMs === Infinity ? '-' : stats.minMs.toFixed(1)}ms | Max: {stats.maxMs.toFixed(1)}ms
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
            <DiagnosticRow key={diag.id} diagnostic={diag} rootStore={rootStore} />
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
  rootStore: RootStore;
}

/**
 * DiagnosticRow displays a single diagnostic.
 *
 * Layout:
 * - Icon (severity indicator)
 * - Title (bold, short summary)
 * - Message (detailed explanation)
 * - Target (formatted location)
 * - Action Buttons (if diagnostic has actions)
 */
const DiagnosticRow: React.FC<DiagnosticRowProps> = ({ diagnostic, rootStore }) => {
  const icon = getSeverityIcon(diagnostic.severity);
  const color = getSeverityColor(diagnostic.severity);
  const targetStr = formatTargetRef(diagnostic.primaryTarget);

  // State for action execution
  const [executingActionIdx, setExecutingActionIdx] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Action click handler
  const handleActionClick = (action: DiagnosticAction, idx: number) => {
    setActionError(null);
    setExecutingActionIdx(idx);

    try {
      const result = rootStore.executeAction(action);

      setExecutingActionIdx(null);

      if (!result.success) {
        setActionError(result.error || 'Action failed');
        console.error('Diagnostic action failed:', result.error);
      }
    } catch (err) {
      setExecutingActionIdx(null);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setActionError(errorMsg);
      console.error('Diagnostic action exception:', err);
    }
  };

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

      {/* Action Buttons */}
      {diagnostic.actions && diagnostic.actions.length > 0 && (
        <div style={{ 
          marginTop: '8px', 
          marginLeft: '24px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          {diagnostic.actions.map((action, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
              <button
                onClick={() => handleActionClick(action, idx)}
                disabled={executingActionIdx === idx}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: executingActionIdx === idx ? '#888' : '#fff',
                  background: executingActionIdx === idx ? '#1a2744' : '#2a4365',
                  border: '1px solid #3a5a85',
                  borderRadius: '4px',
                  cursor: executingActionIdx === idx ? 'not-allowed' : 'pointer',
                  opacity: executingActionIdx === idx ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (executingActionIdx !== idx) {
                    e.currentTarget.style.background = '#3a5a85';
                  }
                }}
                onMouseLeave={(e) => {
                  if (executingActionIdx !== idx) {
                    e.currentTarget.style.background = '#2a4365';
                  }
                }}
              >
                {executingActionIdx === idx ? '⏳ Executing...' : action.label}
              </button>
              
              {actionError && executingActionIdx === null && (
                <span style={{ 
                  fontSize: '10px', 
                  color: '#ff6b6b', 
                  marginTop: '2px' 
                }}>
                  {actionError}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a range stat as "mean [min-max]"
 */
function formatRange(r: TimingRangeStats, decimals: number): string {
  const m = r.mean.toFixed(decimals);
  const lo = r.min.toFixed(decimals);
  const hi = r.max.toFixed(decimals);
  return `${m} [${lo}-${hi}]`;
}

/** Color for fps values (higher = better) */
function fpsColor(fps: number): string {
  if (fps >= 58) return '#8a8';
  if (fps >= 50) return '#fa8';
  return '#f88';
}

/** Color for ms/frame max values (lower = better) */
function msColor(maxMs: number): string {
  if (maxMs < 20) return '#8a8';
  if (maxMs < 33) return '#fa8';
  return '#f88';
}

/** Color for jitter mean (lower = better) */
function jitterColor(jitter: number): string {
  if (jitter < 1) return '#8a8';
  if (jitter < 2) return '#fa8';
  return '#f88';
}

/** Color for dropped frame count (zero = best) */
function droppedColor(dropped: number): string {
  if (dropped === 0) return '#8a8';
  if (dropped < 5) return '#fa8';
  return '#f88';
}

/**
 * Formats bytes into human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

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
