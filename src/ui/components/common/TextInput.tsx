/**
 * TextInput Component
 *
 * Mantine TextInput configured with blur/commit pattern.
 *
 * Features:
 * - Blur/Enter key commit pattern
 * - Local state management to avoid cursor jumps during typing
 * - Compact size for panel layouts
 * - Beautiful dark theme styling
 */

import React, { useState, useCallback } from 'react';
import { TextInput as MantineTextInput, rem } from '@mantine/core';

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
  /** Size variant (default: 'sm') */
  size?: 'xs' | 'sm' | 'md';
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
  size = 'sm',
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
    <MantineTextInput
      value={localValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      label={label}
      placeholder={placeholder}
      description={helperText}
      size={size}
      styles={{
        input: {
          background: 'rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
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
