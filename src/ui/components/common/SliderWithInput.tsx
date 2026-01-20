/**
 * SliderWithInput Component
 *
 * MUI Slider with integrated TextField for direct numeric input.
 * Follows MUI pattern: https://mui.com/material-ui/react-slider/#slider-with-input-field
 *
 * Features:
 * - Always-visible value label (valueLabelDisplay="on")
 * - Bidirectional sync between slider and text field
 * - Clamping to min/max range
 * - Validation for non-numeric and out-of-range input
 * - Optional unit label (e.g., "ms")
 *
 * Created for continuity-controls-v2 sprint
 */

import React, { useState } from 'react';
import { Slider, TextField, Typography, Box } from '@mui/material';

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
  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    const val = Array.isArray(newValue) ? newValue[0] : newValue;
    onChange(val);
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
  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleInputBlur();
    }
  };

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <Box display="flex" alignItems="center" gap={1}>
        <Box flex={1}>
          <Typography variant="body2" component="label" style={{ display: 'block', marginBottom: '0.25rem' }}>
            {label}
          </Typography>
          <Slider
            value={value}
            onChange={handleSliderChange}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            valueLabelDisplay="on"
            size="small"
          />
        </Box>
        <TextField
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyPress={handleKeyPress}
          disabled={disabled}
          size="small"
          variant="outlined"
          InputProps={{
            endAdornment: unit ? (
              <Typography variant="caption" style={{ marginLeft: '0.25rem', opacity: 0.7 }}>
                {unit}
              </Typography>
            ) : undefined,
          }}
          sx={{
            width: unit ? '85px' : '65px',
            '& .MuiInputBase-input': {
              fontSize: '0.75rem',
              padding: '0.375rem 0.5rem',
            },
          }}
        />
      </Box>
      {helperText && (
        <Typography
          variant="caption"
          style={{
            display: 'block',
            marginTop: '0.25rem',
            fontStyle: 'italic',
            opacity: 0.7,
          }}
        >
          {helperText}
        </Typography>
      )}
    </div>
  );
}
