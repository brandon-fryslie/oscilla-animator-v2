/**
 * Continuity Controls Component
 *
 * User controls for tuning continuity system parameters:
 * - Decay exponent slider (0.1-2.0)
 * - Tau multiplier slider (0.5-3.0)
 * - Reset to defaults button
 * - Clear continuity state button
 *
 * Per Continuity-UI Sprint: SPRINT-20260119-171245-core-controls-PLAN.md
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../../stores';
import { colors } from '../../theme';

export const ContinuityControls = observer(function ContinuityControls() {
  const { decayExponent, tauMultiplier } = rootStore.continuity;

  return (
    <div
      style={{
        padding: '0.5rem',
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: '4px',
      }}
    >
      {/* Decay Exponent Slider */}
      <ControlRow
        label="Decay Curve"
        value={decayExponent}
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={(v) => rootStore.continuity.setDecayExponent(v)}
        helpText="<0.7 = gentler start, >0.7 = more linear"
      />

      {/* Tau Multiplier Slider */}
      <ControlRow
        label="Time Scale"
        value={tauMultiplier}
        min={0.5}
        max={3.0}
        step={0.1}
        onChange={(v) => rootStore.continuity.setTauMultiplier(v)}
        helpText="Multiplier for all transition times"
      />

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          onClick={() => rootStore.continuity.resetToDefaults()}
          style={{
            flex: 1,
            padding: '0.375rem',
            fontSize: '0.75rem',
            background: colors.bgPanel,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Reset to Defaults
        </button>
        <button
          onClick={() => {
            if (window.confirm('Clear all continuity state?')) {
              rootStore.continuity.clearContinuityState();
            }
          }}
          style={{
            flex: 1,
            padding: '0.375rem',
            fontSize: '0.75rem',
            background: colors.bgPanel,
            color: colors.warning,
            border: `1px solid ${colors.warning}`,
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Clear State
        </button>
      </div>
    </div>
  );
});

interface ControlRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  helpText: string;
}

function ControlRow({ label, value, min, max, step, onChange, helpText }: ControlRowProps) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          marginBottom: '0.25rem',
        }}
      >
        <span style={{ color: colors.textPrimary }}>{label}</span>
        <span style={{ color: colors.primary, fontWeight: 'bold' }}>
          {value.toFixed(1)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
      <div
        style={{
          fontSize: '0.675rem',
          color: colors.textMuted,
          fontStyle: 'italic',
        }}
      >
        {helpText}
      </div>
    </div>
  );
}
