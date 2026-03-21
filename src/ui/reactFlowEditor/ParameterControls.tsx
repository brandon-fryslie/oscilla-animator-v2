/**
 * Parameter Controls for ReactFlow Nodes
 *
 * Inline parameter editing components that sync with PatchStore.
 * Supports float sliders, boolean checkboxes, and enum dropdowns.
 *
 * Created for patch-editor-ui Sprint 2B Feature 4.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Checkbox, FormControlLabel, Select, MenuItem, Typography, Box, type SelectChangeEvent } from '@mui/material';
import type { UIControlHint } from '../../types';
import type { ControlMutationTarget } from '../../types/control-target';
import { useStores } from '../../stores';
import { SliderWithInput } from '../components/common';

/**
 * Props for parameter control components.
 */
export interface ParameterControlProps {
  label: string;
  value: unknown;
  hint?: UIControlHint;
  target: ControlMutationTarget;
}

/**
 * Float parameter control with slider.
 * Debounces updates to avoid excessive PatchStore writes.
 */
export const FloatControl: React.FC<ParameterControlProps> = ({ label, value, hint, target }) => {
  const { patch } = useStores();
  const numValue = typeof value === 'number' ? value : 0;

  // Determine min/max/step from hint
  const min = hint && 'min' in hint ? hint.min ?? 0 : 0;
  const max = hint && 'max' in hint ? hint.max ?? 1 : 1;
  const step = hint && 'step' in hint ? hint.step ?? 0.01 : 0.01;

  // Local state for immediate slider feedback
  const [localValue, setLocalValue] = useState(numValue);
  const updateTimerRef = useRef<number | null>(null);

  // Sync local value when prop changes
  useEffect(() => {
    setLocalValue(numValue);
  }, [numValue]);

  useEffect(() => {
    return () => {
      if (updateTimerRef.current !== null) {
        window.clearTimeout(updateTimerRef.current);
      }
    };
  }, []);

  const handleChange = useCallback((val: number) => {
    setLocalValue(val);

    if (updateTimerRef.current !== null) {
      window.clearTimeout(updateTimerRef.current);
    }

    updateTimerRef.current = window.setTimeout(() => {
      patch.updateControlValue(target, val);
    }, 16);
  }, [patch, target]);

  return (
    <Box sx={{ mb: 0.5 }} onPointerDown={(e) => e.stopPropagation()} className="nodrag">
      {/* [LAW:one-source-of-truth] All slider behavior and bounds editing flow through the shared Mantine slider component. */}
      <SliderWithInput
        label={label}
        value={localValue}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        size="xs"
        inputWidthRem={3.5}
        editableBounds
      />
    </Box>
  );
};

/**
 * Boolean parameter control with checkbox.
 * Updates immediately (no debouncing needed for binary values).
 */
export const BoolControl: React.FC<ParameterControlProps> = ({ label, value, target }) => {
  const { patch } = useStores();
  const boolValue = Boolean(value);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    patch.updateControlValue(target, e.target.checked);
  }, [patch, target]);

  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={boolValue}
          onChange={handleChange}
          onPointerDown={(e) => e.stopPropagation()}
          className="nodrag"
          size="small"
          sx={{ py: 0, '& .MuiSvgIcon-root': { fontSize: 16 } }}
        />
      }
      label={<Typography variant="caption" sx={{ color: '#aaa', fontSize: '10px' }}>{label}</Typography>}
      sx={{ mb: 0.5, ml: 0 }}
    />
  );
};

/**
 * Enum parameter control with dropdown select.
 * Updates immediately on selection change.
 */
export const EnumControl: React.FC<ParameterControlProps> = ({ label, value, hint, target }) => {
  const { patch } = useStores();
  const stringValue = String(value ?? '');

  // Extract options from hint
  const options = hint && hint.kind === 'select' ? hint.options : [];

  const handleChange = useCallback((e: SelectChangeEvent<string>) => {
    patch.updateControlValue(target, e.target.value);
  }, [patch, target]);

  if (options.length === 0) {
    return (
      <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: '#f00', fontSize: '10px' }}>
        {label}: (no options)
      </Typography>
    );
  }

  return (
    <Box sx={{ mb: 0.5 }} onPointerDown={(e) => e.stopPropagation()} className="nodrag">
      <Typography variant="caption" sx={{ color: '#aaa', fontSize: '10px', mb: 0.25, display: 'block' }}>
        {label}:
      </Typography>
      <Select
        value={stringValue}
        onChange={handleChange}
        size="small"
        fullWidth
        sx={{
          fontSize: '10px',
          '& .MuiSelect-select': {
            py: 0.5,
            px: 1,
          },
        }}
      >
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '10px' }}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
};

/**
 * Generic parameter control that selects the appropriate control type.
 */
export const ParameterControl: React.FC<ParameterControlProps> = (props) => {
  const { hint, value } = props;

  // Determine control type from hint
  if (hint) {
    switch (hint.kind) {
      case 'slider':
      case 'float':
      case 'int':
        return <FloatControl {...props} />;
      case 'boolean':
        return <BoolControl {...props} />;
      case 'select':
        return <EnumControl {...props} />;
      default:
        // Fallback: show value as text
        return (
          <div style={{ marginBottom: '4px', fontSize: '10px', color: '#aaa' }}>
            {props.label}: {String(value)}
          </div>
        );
    }
  }

  // No hint - infer from value type
  if (typeof value === 'boolean') {
    return <BoolControl {...props} />;
  }
  if (typeof value === 'number') {
    return <FloatControl {...props} />;
  }

  // Default: show as text
  return (
    <div style={{ marginBottom: '4px', fontSize: '10px', color: '#aaa' }}>
      {props.label}: {String(value)}
    </div>
  );
};
