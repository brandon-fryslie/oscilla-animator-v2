/**
 * SliderWithInput Component
 *
 * Mantine Slider with integrated TextInput for direct numeric input.
 *
 * Features:
 * - Always-visible value label
 * - Bidirectional sync between slider and text field
 * - Clamping to min/max range
 * - Validation for non-numeric and out-of-range input
 * - Optional unit label (e.g., "ms")
 * - Beautiful violet-themed styling
 */

import React, { useState } from 'react';
import { Slider, TextInput, Text, Group, Box, rem } from '@mantine/core';

export interface SliderWithInputProps {
  /** Control label */
  label: string;
  /** Current value */
  value: number;
  /** Value change callback */
  onChange: (value: number) => void;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step increment (default: 0.1) */
  step?: number;
  /** Helper text below slider */
  helperText?: string;
  /** Disable control */
  disabled?: boolean;
  /** Unit label (e.g., "ms") */
  unit?: string;
}

/**
 * Reusable slider with text input component.
 */
export function SliderWithInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  helperText,
  disabled = false,
  unit,
}: SliderWithInputProps): React.ReactElement {
  // Local state for text field to allow typing without immediate validation
  const [inputValue, setInputValue] = useState<string>(value.toString());

  // Sync input when value changes externally
  React.useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  // Handle slider change
  const handleSliderChange = (newValue: number) => {
    onChange(newValue);
  };

  // Handle text input change (allow typing, defer validation)
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  // Handle text field blur (validate and commit)
  const handleInputBlur = () => {
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed)) {
      // Invalid input - reset to current value
      setInputValue(value.toString());
    } else {
      // Clamp to range and commit
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
      setInputValue(clamped.toString());
    }
  };

  // Handle Enter key to commit input
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleInputBlur();
    }
  };

  return (
    <Box mb="xs">
      <Text size="xs" fw={500} c="gray.4" mb={4}>
        {label}
      </Text>
      <Group gap="sm" align="center">
        <Box style={{ flex: 1 }}>
          <Slider
            value={value}
            onChange={handleSliderChange}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            size="sm"
            color="violet"
            label={(val) => val.toFixed(2)}
            styles={{
              track: {
                background: 'rgba(139, 92, 246, 0.2)',
              },
              bar: {
                background: 'linear-gradient(90deg, var(--mantine-color-violet-6) 0%, var(--mantine-color-violet-4) 100%)',
              },
              thumb: {
                borderColor: 'var(--mantine-color-violet-5)',
                boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)',
              },
              label: {
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.9) 0%, rgba(99, 102, 241, 0.9) 100%)',
                backdropFilter: 'blur(4px)',
              },
            }}
          />
        </Box>
        <TextInput
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          size="xs"
          rightSection={
            unit ? (
              <Text size="xs" c="dimmed">
                {unit}
              </Text>
            ) : undefined
          }
          styles={{
            root: {
              width: unit ? rem(85) : rem(65),
            },
            input: {
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              fontSize: rem(12),
              padding: `${rem(6)} ${rem(8)}`,
              textAlign: 'center',
            },
          }}
        />
      </Group>
      {helperText && (
        <Text
          size="xs"
          c="dimmed"
          mt={4}
          style={{ fontStyle: 'italic' }}
        >
          {helperText}
        </Text>
      )}
    </Box>
  );
}
