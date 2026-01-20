/**
 * Continuity Controls Component
 *
 * User controls for tuning continuity system parameters:
 * - Decay exponent slider (0.1-2.0)
 * - Tau multiplier slider (0.5-3.0)
 * - Base tau duration slider (50-500ms)
 * - Test pulse button
 * - Reset to defaults button
 * - Clear continuity state button
 *
 * Enhanced with MUI SliderWithInput components for better UX.
 *
 * Per Continuity-UI Sprint: continuity-controls-v2
 */

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ThemeProvider, Button } from '@mui/material';
import { rootStore } from '../../../stores';
import { colors, darkTheme } from '../../theme';
import { SliderWithInput } from '../common/SliderWithInput';

export const ContinuityControls = observer(function ContinuityControls() {
  const { decayExponent, tauMultiplier, baseTauMs } = rootStore.continuity;
  const [pulseActive, setPulseActive] = useState(false);

  const handleTestPulse = () => {
    rootStore.continuity.triggerTestPulse(50, 'position');
    setPulseActive(true);

    // Clear pulse indicator after 2 seconds (visual feedback)
    setTimeout(() => setPulseActive(false), 2000);
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <div
        style={{
          padding: '0.5rem',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '4px',
        }}
      >
        {/* Decay Exponent Slider */}
        <SliderWithInput
          label="Decay Curve"
          value={decayExponent}
          min={0.1}
          max={2.0}
          step={0.1}
          onChange={(v) => rootStore.continuity.setDecayExponent(v)}
          helperText="<0.7 = gentler start, >0.7 = more linear"
        />

        {/* Tau Multiplier Slider */}
        <SliderWithInput
          label="Time Scale"
          value={tauMultiplier}
          min={0.5}
          max={3.0}
          step={0.1}
          onChange={(v) => rootStore.continuity.setTauMultiplier(v)}
          helperText="Multiplier for all transition times"
        />

        {/* Base Tau Duration Slider */}
        <SliderWithInput
          label="Base Duration"
          value={baseTauMs}
          min={50}
          max={500}
          step={10}
          unit="ms"
          onChange={(v) => rootStore.continuity.setBaseTauMs(v)}
          helperText="Base transition time (before multiplier)"
        />

        {/* Test Pulse Button */}
        <div style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleTestPulse}
            fullWidth
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              borderColor: pulseActive ? colors.primary : colors.border,
              color: pulseActive ? colors.primary : colors.textPrimary,
              '&:hover': {
                borderColor: colors.primary,
                background: 'rgba(78, 205, 196, 0.1)',
              },
            }}
          >
            {pulseActive ? 'Pulse Active...' : 'Test Pulse'}
          </Button>
          {pulseActive && (
            <div
              style={{
                marginTop: '0.25rem',
                fontSize: '0.675rem',
                color: colors.primary,
                fontStyle: 'italic',
                textAlign: 'center',
              }}
            >
              Watch elements move and decay with current settings
            </div>
          )}
        </div>

        {/* Action Buttons */}
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
    </ThemeProvider>
  );
});
