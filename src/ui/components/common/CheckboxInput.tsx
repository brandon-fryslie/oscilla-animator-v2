/**
 * CheckboxInput Component
 *
 * MUI Checkbox with FormControlLabel for boolean inputs.
 *
 * Features:
 * - Integrated label
 * - Theme primary color
 * - Compact layout for panels
 *
 * Created for mui-controls-migration sprint
 */

import React from 'react';
import { Checkbox, FormControlLabel } from '@mui/material';

export interface CheckboxInputProps {
  /** Current checked state */
  checked: boolean;
  /** State change callback */
  onChange: (checked: boolean) => void;
  /** Label text */
  label?: string;
  /** Disable control */
  disabled?: boolean;
}

/**
 * Reusable checkbox component.
 */
export function CheckboxInput({
  checked,
  onChange,
  label,
  disabled = false,
}: CheckboxInputProps): React.ReactElement {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  const checkbox = (
    <Checkbox
      checked={checked}
      onChange={handleChange}
      disabled={disabled}
      size="small"
      color="primary"
    />
  );

  // If no label, return checkbox alone
  if (!label) {
    return checkbox;
  }

  // Otherwise wrap in FormControlLabel
  return (
    <FormControlLabel
      control={checkbox}
      label={label}
      disabled={disabled}
    />
  );
}
