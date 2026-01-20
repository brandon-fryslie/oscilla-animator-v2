/**
 * TextInput Component
 *
 * MUI TextField configured for text input with blur/commit pattern.
 *
 * Features:
 * - Blur/Enter key commit pattern
 * - Local state management to avoid cursor jumps during typing
 * - Compact size for panel layouts
 *
 * Created for mui-controls-migration sprint
 */

import React, { useState, useCallback } from 'react';
import { TextField } from '@mui/material';

export interface TextInputProps {
  /** Current value */
  value: string;
  /** Value change callback */
  onChange: (value: string) => void;
  /** Control label */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Helper text below input */
  helperText?: string;
  /** Disable control */
  disabled?: boolean;
  /** Size variant (default: 'small') */
  size?: 'small' | 'medium';
}

/**
 * Reusable text input component.
 */
export function TextInput({
  value,
  onChange,
  label,
  placeholder,
  helperText,
  disabled = false,
  size = 'small',
}: TextInputProps): React.ReactElement {
  // Local state to allow typing without immediate commits
  const [localValue, setLocalValue] = useState<string>(value);

  // Sync local value when value changes externally
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Handle input change
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(event.target.value);
  };

  // Handle blur (commit if changed)
  const handleBlur = useCallback(() => {
    if (localValue !== value) {
      onChange(localValue);
    }
  }, [localValue, value, onChange]);

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
      placeholder={placeholder}
      helperText={helperText}
      size={size}
      variant="outlined"
      fullWidth
    />
  );
}
