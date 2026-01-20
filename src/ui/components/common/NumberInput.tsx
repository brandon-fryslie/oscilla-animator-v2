/**
 * NumberInput Component
 *
 * MUI TextField configured for numeric input with validation and clamping.
 *
 * Features:
 * - Blur/Enter key commit pattern
 * - Min/max clamping
 * - Invalid input handling (revert to previous value)
 * - Optional unit label suffix
 * - Compact size for panel layouts
 *
 * Created for mui-controls-migration sprint
 */

import React, { useState, useCallback } from 'react';
import { TextField, Typography } from '@mui/material';

export interface NumberInputProps {
  /** Current value */
  value: number;
  /** Value change callback */
  onChange: (value: number) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment (default: 0.01) */
  step?: number;
  /** Control label */
  label?: string;
  /** Helper text below input */
  helperText?: string;
  /** Disable control */
  disabled?: boolean;
  /** Size variant (default: 'small') */
  size?: 'small' | 'medium';
  /** Unit label (e.g., "ms", "px") */
  unit?: string;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Reusable numeric input component with validation.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  label,
  helperText,
  disabled = false,
  size = 'small',
  unit,
  placeholder,
}: NumberInputProps): React.ReactElement {
  // Local state for text field to allow typing without immediate validation
  const [localValue, setLocalValue] = useState<string>(value.toString());

  // Sync local value when value changes externally
  React.useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  // Handle input change (allow typing, defer validation)
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(event.target.value);
  };

  // Handle blur (validate and commit)
  const handleBlur = useCallback(() => {
    const parsed = parseFloat(localValue);
    if (isNaN(parsed)) {
      // Invalid input - reset to current value
      setLocalValue(value.toString());
    } else if (parsed !== value) {
      // Clamp to range and commit
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed));
      onChange(clamped);
      setLocalValue(clamped.toString());
    }
  }, [localValue, value, onChange, min, max]);

  // Handle Enter key to commit input
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        (event.target as HTMLInputElement).blur();
      }
    },
    []
  );

  return (
    <TextField
      value={localValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      label={label}
      helperText={helperText}
      placeholder={placeholder}
      size={size}
      variant="outlined"
      type="number"
      inputProps={{
        step,
        min,
        max,
      }}
      InputProps={{
        endAdornment: unit ? (
          <Typography variant="caption" style={{ marginLeft: '0.25rem', opacity: 0.7 }}>
            {unit}
          </Typography>
        ) : undefined,
      }}
      fullWidth
    />
  );
}
