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
import type { LogEntry } from '../../../stores/DiagnosticsStore';
import type { Diagnostic, Severity, TargetRef, DiagnosticAction } from '../../../diagnostics/types';
import type { RustRendererSchedulerState } from '../../../render/rust/worker-protocol';
import type { RustRendererRuntimeTelemetry } from '../../../render/webgpu/RustWasmWebGPURenderer';

interface RuntimeTelemetryDetail {
  readonly kind: 'runtimeTelemetry';
  readonly schedulerState: RustRendererSchedulerState;
  readonly fps: number;
  readonly telemetry: RustRendererRuntimeTelemetry;
}

interface RuntimeTelemetryLog {
  readonly timestamp: number;
  readonly payload: RuntimeTelemetryDetail;
}

function isRuntimeTelemetryDetail(value: unknown): value is RuntimeTelemetryDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RuntimeTelemetryDetail>;
  return (
    candidate.kind === 'runtimeTelemetry'
    && typeof candidate.schedulerState === 'string'
    && typeof candidate.fps === 'number'
    && !!candidate.telemetry
    && typeof candidate.telemetry === 'object'
  );
}

// [LAW:one-source-of-truth] Renderer telemetry extraction is centralized at
// this parser boundary so all console projections use identical log semantics.
function selectLatestRuntimeTelemetryLog(logs: readonly LogEntry[]): RuntimeTelemetryLog | null {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const entry = logs[index];
    if (entry && isRuntimeTelemetryDetail(entry.data)) {
      return {
        timestamp: entry.timestamp,
        payload: entry.data,
      };
    }
  }
  return null;
}

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

  // [LAW:one-source-of-truth] Renderer heartbeat telemetry is surfaced from
  // diagnostics logs, which are the canonical UI debug stream.
  const runtimeTelemetry = selectLatestRuntimeTelemetryLog(diagnosticsStore.logs);

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
      <RuntimeTelemetryStrip runtimeTelemetry={runtimeTelemetry} />

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

interface RuntimeTelemetryStripProps {
  runtimeTelemetry: RuntimeTelemetryLog | null;
}

const RuntimeTelemetryStrip: React.FC<RuntimeTelemetryStripProps> = ({ runtimeTelemetry }) => {
  if (!runtimeTelemetry) {
    return null;
  }

  const { payload, timestamp } = runtimeTelemetry;
  const telemetry = payload.telemetry;
  const stageTimings = telemetry.stageTimings;
  const dispatchCounters = telemetry.dispatchCounters;
  const resourceStats = telemetry.resourceStats;
  const lastEvent = telemetry.lastEvent;

  return (
    <div
      style={{
        padding: '6px 12px',
        borderBottom: '1px solid #0f3460',
        fontFamily: 'monospace',
        fontSize: '11px',
        background: '#0a0a18',
        color: '#dbeafe',
        display: 'grid',
        gap: '2px',
      }}
    >
      <div>
        <span style={{ color: '#8af' }}>Renderer:</span>
        {' '}
        {payload.schedulerState}
        {' | '}FPS {payload.fps}
        {' | '}Frame {telemetry.frameCount}
        {' | '}Samples {telemetry.sampleCount}
        {' | '}Last {new Date(timestamp).toLocaleTimeString()}
      </div>
      <div>
        Tick {stageTimings.totalFrameMs.toFixed(2)}ms
        {' | '}Mean {telemetry.meanMs.toFixed(2)}ms
        {' | '}StdDev {telemetry.stdDevMs.toFixed(2)}ms
        {' | '}Dispatch {dispatchCounters.computeDispatchCount}
        {' | '}Workgroups {dispatchCounters.computeWorkgroupCount}
      </div>
      <div>
        Stages in {stageTimings.inputMarshalMs.toFixed(2)}
        {' | '}sim {stageTimings.simulationDispatchMs.toFixed(2)}
        {' | '}draw {stageTimings.drawPrepMs.toFixed(2)}
        {' | '}render {stageTimings.renderMs.toFixed(2)}
        {' | '}swap {stageTimings.swapMs.toFixed(2)}
      </div>
      <div>
        Instances {resourceStats.totalInstanceCount}
        {' | '}SinkWords {resourceStats.sinkTableWordCount}
        {' | '}PingPong {resourceStats.pingPongIndex}
        {' | '}Canvas {resourceStats.canvasWidth}x{resourceStats.canvasHeight}
      </div>
      {lastEvent ? (
        <div style={{ color: lastEvent.severity === 'fatal' ? '#fda4af' : '#fcd34d' }}>
          Last event [{lastEvent.code}] {lastEvent.stage}: {lastEvent.message}
        </div>
      ) : null}
    </div>
  );
};

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
        // [LAW:single-enforcer] Diagnostic action failures flow through diagnostics store.
        rootStore.diagnostics.log({
          level: 'error',
          message: `Diagnostic action failed: ${result.error ?? 'unknown error'}`,
        });
      }
    } catch (err) {
      setExecutingActionIdx(null);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setActionError(errorMsg);
      // [LAW:single-enforcer] Diagnostic action exceptions flow through diagnostics store.
      rootStore.diagnostics.log({
        level: 'error',
        message: `Diagnostic action exception: ${errorMsg}`,
      });
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
