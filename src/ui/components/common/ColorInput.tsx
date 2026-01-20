/**
 * ColorInput Component
 *
 * Native color input wrapped with MUI styling to match TextField appearance.
 * MUI doesn't provide a color picker component, so we use the native HTML
 * input type="color" with custom styling for consistency.
 *
 * Features:
 * - Native color picker functionality
 * - Styled to match MUI TextField
 * - Optional label
 * - Preview swatch integrated
 *
 * Created for mui-controls-migration sprint
 */

import React from 'react';
import { Box, Typography, InputAdornment } from '@mui/material';
import { colors } from '../../theme';

export interface ColorInputProps {
  /** Current color value (hex string) */
  value: string;
  /** Value change callback */
  onChange: (value: string) => void;
  /** Control label */
  label?: string;
  /** Disable control */
  disabled?: boolean;
}

/**
 * Reusable color picker component.
 */
export function ColorInput({
  value,
  onChange,
  label,
  disabled = false,
}: ColorInputProps): React.ReactElement {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <Box>
      {label && (
        <Typography
          variant="body2"
          component="label"
          style={{ display: 'block', marginBottom: '0.25rem' }}
        >
          {label}
        </Typography>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          border: `1px solid ${colors.border}`,
          borderRadius: '4px',
          padding: '6px 8px',
          background: colors.bgPanel,
          '&:hover': {
            borderColor: colors.textSecondary,
          },
          '&:focus-within': {
            borderColor: colors.primary,
            borderWidth: '2px',
            padding: '5px 7px', // Adjust for thicker border
          },
        }}
      >
        {/* Color swatch preview */}
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '4px',
            backgroundColor: value || '#000000',
            border: `1px solid ${colors.border}`,
            flexShrink: 0,
          }}
        />

        {/* Native color input */}
        <input
          type="color"
          value={value || '#000000'}
          onChange={handleChange}
          disabled={disabled}
          style={{
            flex: 1,
            height: '24px',
            border: 'none',
            background: 'transparent',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        />

        {/* Hex value display */}
        <Typography
          variant="caption"
          style={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: colors.textSecondary,
            minWidth: '60px',
            textAlign: 'right',
          }}
        >
          {value || '#000000'}
        </Typography>
      </Box>
    </Box>
  );
}
