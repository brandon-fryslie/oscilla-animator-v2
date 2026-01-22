/**
 * SelectInput Component
 *
 * Mantine Select for dropdown selection.
 *
 * Features:
 * - Type-safe option values
 * - Optional label and helper text
 * - Compact size for panel layouts
 * - Beautiful dark theme styling with gradients
 */

import React from 'react';
import { Select, rem } from '@mantine/core';

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
  /** Size variant (default: 'sm') */
  size?: 'xs' | 'sm' | 'md';
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
  size = 'sm',
}: SelectInputProps): React.ReactElement {
  const handleChange = (newValue: string | null) => {
    if (newValue !== null) {
      onChange(newValue);
    }
  };

  return (
    <Select
      value={value}
      onChange={handleChange}
      data={options}
      label={label}
      description={helperText}
      disabled={disabled}
      size={size}
      allowDeselect={false}
      styles={{
        input: {
          background: 'rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          '&:focus': {
            borderColor: 'var(--mantine-color-violet-5)',
          },
        },
        dropdown: {
          background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 30, 0.98) 100%)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        },
        option: {
          '&[data-selected]': {
            backgroundColor: 'var(--mantine-color-violet-6)',
          },
          '&[data-hovered]': {
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
          },
        },
        label: {
          marginBottom: rem(4),
          fontSize: rem(12),
          fontWeight: 500,
          color: 'var(--mantine-color-gray-4)',
        },
        description: {
          marginTop: rem(4),
          fontSize: rem(11),
          fontStyle: 'italic',
          opacity: 0.7,
        },
      }}
    />
  );
}
