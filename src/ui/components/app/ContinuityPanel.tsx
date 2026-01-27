/**
 * Continuity Panel Component
 *
 * Displays continuity system state:
 * - Active targets
 * - Current mappings
 * - Domain change history
 *
 * Per Continuity-UI Sprint 3.
 */

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../../stores';
import { colors } from '../../theme';
import type { TargetSummary, MappingSummary, DomainChangeEvent } from '../../../stores/ContinuityStore';
import { ContinuityControls } from './ContinuityControls';

export const ContinuityPanel = observer(function ContinuityPanel() {
  const { continuity } = useStores();
  const {
    targets,
    mappings,
    lastDomainChangeMs,
    domainChangeThisFrame,
    recentChanges,
    totalDomainChanges,
  } = continuity;

  const [controlsExpanded, setControlsExpanded] = useState(false);

  return (
    <div
      style={{
        padding: '0.75rem',
        fontFamily: "'SF Mono', Monaco, Consolas, monospace",
        fontSize: '0.8125rem',
        lineHeight: '1.4',
        height: '100%',
        overflow: 'auto',
        background: '#0f0f23',
        color: colors.textSecondary,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <h4 style={{ margin: 0, color: colors.textPrimary }}>
          Continuity State
          {domainChangeThisFrame && (
            <span
              style={{
                color: colors.warning || '#ffd93d',
                marginLeft: '0.5rem',
                fontSize: '0.75rem',
              }}
            >
              (domain changed)
            </span>
          )}
        </h4>
        <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
          Total changes: {totalDomainChanges}
        </div>
      </div>

      {/* Controls Section (Collapsible) */}
      <Section
        title={`${controlsExpanded ? '▼' : '▶'} Controls`}
        onClick={() => setControlsExpanded(!controlsExpanded)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {controlsExpanded && <ContinuityControls />}
      </Section>

      {/* Recent Changes */}
      <Section title={`Recent Changes (${recentChanges.length})`}>
        {recentChanges.length === 0 ? (
          <Empty>No domain changes yet</Empty>
        ) : (
          recentChanges.map((change, i) => (
            <ChangeItem key={i} change={change} />
          ))
        )}
      </Section>

      {/* Active Targets */}
      <Section title={`Active Targets (${targets.length})`}>
        {targets.length === 0 ? (
          <Empty>No active continuity targets</Empty>
        ) : (
          targets.map((target) => (
            <TargetItem key={target.id} target={target} />
          ))
        )}
      </Section>

      {/* Current Mappings */}
      <Section title={`Mappings (${mappings.length})`}>
        {mappings.length === 0 ? (
          <Empty>No active mappings</Empty>
        ) : (
          mappings.map((mapping) => (
            <MappingItem key={mapping.instanceId} mapping={mapping} />
          ))
        )}
      </Section>

      {/* Stats Footer */}
      <div
        style={{
          marginTop: '1rem',
          paddingTop: '0.5rem',
          borderTop: `1px solid ${colors.border}`,
          fontSize: '0.75rem',
          color: colors.textMuted,
        }}
      >
        Last change: {lastDomainChangeMs > 0 ? `${lastDomainChangeMs.toFixed(0)}ms` : 'N/A'}
      </div>
    </div>
  );
});

// =============================================================================
// Subcomponents
// =============================================================================

interface SectionProps {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

function Section({ title, children, onClick, style }: SectionProps) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h5
        onClick={onClick}
        style={{
          margin: '0 0 0.5rem 0',
          color: colors.textMuted,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          ...style,
        }}
      >
        {title}
      </h5>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: colors.textMuted, fontStyle: 'italic' }}>
      {children}
    </div>
  );
}

function ChangeItem({ change }: { change: DomainChangeEvent }) {
  const delta = change.newCount - change.oldCount;
  const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
  const deltaColor = delta > 0 ? '#6bff6b' : delta < 0 ? '#ff6b6b' : colors.textMuted;

  return (
    <div
      style={{
        padding: '0.375rem 0.5rem',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '4px',
        marginBottom: '0.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span>
        <strong style={{ color: colors.textPrimary }}>{change.instanceId}</strong>
        <span style={{ marginLeft: '0.5rem' }}>
          {change.oldCount} {'->'} {change.newCount}
        </span>
      </span>
      <span style={{ color: deltaColor, fontWeight: 'bold' }}>
        {deltaStr}
      </span>
    </div>
  );
}

function TargetItem({ target }: { target: TargetSummary }) {
  return (
    <div
      style={{
        padding: '0.375rem 0.5rem',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '4px',
        marginBottom: '0.25rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>
          <strong style={{ color: colors.primary }}>{target.semantic}</strong>
          <span style={{ color: colors.textMuted, marginLeft: '0.5rem' }}>
            {target.instanceId}
          </span>
        </span>
        <span style={{ color: colors.textMuted }}>
          {target.count} elements
        </span>
      </div>
      {/* Slew progress bar (if applicable) */}
      {target.slewProgress < 1.0 && (
        <div
          style={{
            marginTop: '0.25rem',
            height: '2px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '1px',
          }}
        >
          <div
            style={{
              width: `${target.slewProgress * 100}%`,
              height: '100%',
              background: colors.primary,
              borderRadius: '1px',
              transition: 'width 0.1s ease-out',
            }}
          />
        </div>
      )}
    </div>
  );
}

function MappingItem({ mapping }: { mapping: MappingSummary }) {
  return (
    <div
      style={{
        padding: '0.375rem 0.5rem',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '4px',
        marginBottom: '0.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span>
        <strong style={{ color: colors.textPrimary }}>{mapping.instanceId}</strong>
      </span>
      <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
        {mapping.mapped} mapped
        {mapping.unmapped > 0 && (
          <span style={{ color: '#ffd93d', marginLeft: '0.25rem' }}>
            +{mapping.unmapped} new
          </span>
        )}
      </span>
    </div>
  );
}
