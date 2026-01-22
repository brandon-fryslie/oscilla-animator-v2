/**
 * NumberInput Component
 *
 * Mantine TextInput configured for numeric input with validation and clamping.
 *
 * Features:
 * - Blur/Enter key commit pattern
 * - Min/max clamping
 * - Invalid input handling (revert to previous value)
 * - Optional unit label suffix
 * - Compact size for panel layouts
 * - Beautiful dark theme styling
 */

import React, { useState, useCallback } from 'react';
import { TextInput, rem, Text } from '@mantine/core';

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
  /** Size variant (default: 'sm') */
  size?: 'xs' | 'sm' | 'md';
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
  size = 'sm',
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
    <TextInput
      value={localValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      label={label}
      description={helperText}
      placeholder={placeholder}
      size={size}
      type="number"
      inputMode="decimal"
      rightSection={
        unit ? (
          <Text size="xs" c="dimmed" style={{ marginRight: rem(8) }}>
            {unit}
          </Text>
        ) : undefined
      }
      styles={{
        input: {
          background: 'rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          '&:focus': {
            borderColor: 'var(--mantine-color-violet-5)',
          },
          // Hide native number spinners
          '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
          MozAppearance: 'textfield',
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
