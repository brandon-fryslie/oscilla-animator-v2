/**
 * ColorInput Component
 *
 * Mantine ColorInput with gorgeous styling.
 *
 * Features:
 * - Beautiful color picker with swatches
 * - Preview swatch integrated
 * - Dark theme optimized styling
 * - Optional label
 */

import React from 'react';
import { ColorInput as MantineColorInput, rem } from '@mantine/core';

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

// Beautiful default swatches for quick selection
const DEFAULT_SWATCHES = [
  '#fa5252', '#e64980', '#be4bdb', '#7950f2', '#4c6ef5',
  '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e',
  '#fab005', '#fd7e14', '#868e96', '#212529', '#ffffff',
];

/**
 * Reusable color picker component.
 */
export function ColorInput({
  value,
  onChange,
  label,
  disabled = false,
}: ColorInputProps): React.ReactElement {
  return (
    <MantineColorInput
      value={value || '#000000'}
      onChange={onChange}
      label={label}
      disabled={disabled}
      size="sm"
      format="hex"
      swatches={DEFAULT_SWATCHES}
      swatchesPerRow={5}
      styles={{
        input: {
          background: 'rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          fontFamily: 'monospace',
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
        label: {
          marginBottom: rem(4),
          fontSize: rem(12),
          fontWeight: 500,
          color: 'var(--mantine-color-gray-4)',
        },
        colorPreview: {
          border: '1px solid rgba(139, 92, 246, 0.3)',
        },
      }}
    />
  );
}
