/**
 * SelectInput Component
 *
 * MUI Select wrapped in FormControl for dropdown selection.
 *
 * Features:
 * - Type-safe option values
 * - Optional label and helper text
 * - Compact size for panel layouts
 * - Dark theme styling (from theme.ts)
 *
 * Created for mui-controls-migration sprint
 */

import React from 'react';
import { FormControl, InputLabel, Select, MenuItem, FormHelperText } from '@mui/material';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectInputProps {
  /** Current selected value */
  value: string;
  /** Value change callback */
  onChange: (value: string) => void;
  /** Available options */
  options: SelectOption[];
  /** Control label */
  label?: string;
  /** Helper text below select */
  helperText?: string;
  /** Disable control */
  disabled?: boolean;
  /** Size variant (default: 'small') */
  size?: 'small' | 'medium';
}

/**
 * Reusable select dropdown component.
 */
export function SelectInput({
  value,
  onChange,
  options,
  label,
  helperText,
  disabled = false,
  size = 'small',
}: SelectInputProps): React.ReactElement {
  // Generate unique ID for label association
  const labelId = React.useId();

  const handleChange = (event: any) => {
    onChange(event.target.value as string);
  };

  return (
    <FormControl fullWidth size={size} disabled={disabled}>
      {label && <InputLabel id={labelId}>{label}</InputLabel>}
      <Select
        labelId={label ? labelId : undefined}
        value={value}
        onChange={handleChange}
        label={label}
        variant="outlined"
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}
