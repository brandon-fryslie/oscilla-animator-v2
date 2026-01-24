/**
 * CheckboxInput Component
 *
 * Mantine Checkbox for boolean inputs.
 *
 * Features:
 * - Integrated label
 * - Beautiful violet primary color
 * - Compact layout for panels
 */

import React from 'react';
import { Checkbox, rem } from '@mantine/core';

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

  return (
    <Checkbox
      checked={checked}
      onChange={handleChange}
      disabled={disabled}
      label={label}
      size="sm"
      color="violet"
      styles={{
        input: {
          cursor: disabled ? 'not-allowed' : 'pointer',
        },
        label: {
          fontSize: rem(13),
          color: 'var(--mantine-color-gray-3)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        },
      }}
    />
  );
}
