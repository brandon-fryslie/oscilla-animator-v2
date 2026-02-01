/**
 * Parameter Controls for ReactFlow Nodes
 *
 * Inline parameter editing components that sync with PatchStore.
 * Supports float sliders, boolean checkboxes, and enum dropdowns.
 *
 * Created for patch-editor-ui Sprint 2B Feature 4.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Slider, Checkbox, FormControlLabel, Select, MenuItem, Typography, Box, type SelectChangeEvent } from '@mui/material';
import type { BlockId, UIControlHint, DefaultSource } from '../../types';
import { useStores } from '../../stores';

/**
 * Props for parameter control components.
 */
export interface ParameterControlProps {
  blockId: BlockId;
  paramId: string;
  label: string;
  value: unknown;
  hint?: UIControlHint;
}

/**
 * Float parameter control with slider.
 * Debounces updates to avoid excessive PatchStore writes.
 */
export const FloatControl: React.FC<ParameterControlProps> = observer(({ blockId, paramId, label, value, hint }) => {
  const { patch } = useStores();
  const numValue = typeof value === 'number' ? value : 0;

  // Determine min/max/step from hint
  const min = hint && 'min' in hint ? hint.min ?? 0 : 0;
  const max = hint && 'max' in hint ? hint.max ?? 1 : 1;
  const step = hint && 'step' in hint ? hint.step ?? 0.01 : 0.01;

  // Local state for immediate slider feedback
  const [localValue, setLocalValue] = useState(numValue);
  const [updateTimer, setUpdateTimer] = useState<number | null>(null);

  // Sync local value when prop changes
  useEffect(() => {
    setLocalValue(numValue);
  }, [numValue]);

  const handleChange = useCallback((_event: Event, newValue: number | number[]) => {
    const val = Array.isArray(newValue) ? newValue[0] : newValue;
    setLocalValue(val);

    // Clear existing timer
    if (updateTimer !== null) {
      clearTimeout(updateTimer);
    }

    // Debounce: update PatchStore after 100ms of no changes
    const timer = window.setTimeout(() => {
      patch.updateBlockParams(blockId, { [paramId]: val });
    }, 100);

    setUpdateTimer(timer);
  }, [blockId, paramId, patch, updateTimer]);

  return (
    <Box sx={{ mb: 0.5 }} onPointerDown={(e) => e.stopPropagation()} className="nodrag">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
        <Typography variant="caption" sx={{ color: '#aaa', minWidth: '60px', fontSize: '10px' }}>
          {label}:
        </Typography>
        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 'bold', fontSize: '10px' }}>
          {localValue.toFixed(2)}
        </Typography>
      </Box>
      <Slider
        value={localValue}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        size="small"
        sx={{
          py: 0.5,
          '& .MuiSlider-thumb': {
            width: 12,
            height: 12,
          },
          '& .MuiSlider-rail': {
            height: 3,
          },
          '& .MuiSlider-track': {
            height: 3,
          },
        }}
      />
    </Box>
  );
});

/**
 * Boolean parameter control with checkbox.
 * Updates immediately (no debouncing needed for binary values).
 */
export const BoolControl: React.FC<ParameterControlProps> = observer(({ blockId, paramId, label, value }) => {
  const { patch } = useStores();
  const boolValue = Boolean(value);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    patch.updateBlockParams(blockId, { [paramId]: e.target.checked });
  }, [blockId, paramId, patch]);

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
});

/**
 * Enum parameter control with dropdown select.
 * Updates immediately on selection change.
 */
export const EnumControl: React.FC<ParameterControlProps> = observer(({ blockId, paramId, label, value, hint }) => {
  const { patch } = useStores();
  const stringValue = String(value ?? '');

  // Extract options from hint
  const options = hint && hint.kind === 'select' ? hint.options : [];

  const handleChange = useCallback((e: SelectChangeEvent<string>) => {
    patch.updateBlockParams(blockId, { [paramId]: e.target.value });
  }, [blockId, paramId, patch]);

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
});

/**
 * Generic parameter control that selects the appropriate control type.
 */
export const ParameterControl: React.FC<ParameterControlProps> = observer((props) => {
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
});

// =============================================================================
// Default Source Value Control
// =============================================================================

/**
 * Props for default source value control.
 */
export interface DefaultSourceControlProps {
  blockId: BlockId;
  portId: string;
  portLabel: string;
  defaultSource: DefaultSource;
  hint?: UIControlHint;
}

/**
 * Inline control for editing Const default source values directly on nodes.
 * Only renders for Const block default sources with numeric values.
 * Debounces updates to PatchStore.updateInputPort.
 */
export const DefaultSourceControl: React.FC<DefaultSourceControlProps> = observer(({
  blockId,
  portId,
  portLabel,
  defaultSource,
  hint,
}) => {
  const { patch } = useStores();

  // Only handle Const blocks with numeric values
  if (defaultSource.blockType !== 'Const') {
    return null;
  }

  const currentValue = defaultSource.params?.value;
  if (typeof currentValue !== 'number') {
    return null;
  }

  // Determine min/max/step from hint or use defaults
  const min = hint && 'min' in hint ? hint.min ?? 0 : 0;
  const max = hint && 'max' in hint ? hint.max ?? 1 : 1;
  const step = hint && 'step' in hint ? hint.step ?? 0.01 : 0.01;

  return (
    <DefaultSourceSlider
      blockId={blockId}
      portId={portId}
      portLabel={portLabel}
      defaultSource={defaultSource}
      value={currentValue}
      min={min}
      max={max}
      step={step}
    />
  );
});

/**
 * Internal slider component with local state for smooth dragging.
 */
interface DefaultSourceSliderProps {
  blockId: BlockId;
  portId: string;
  portLabel: string;
  defaultSource: DefaultSource;
  value: number;
  min: number;
  max: number;
  step: number;
}

const DefaultSourceSlider: React.FC<DefaultSourceSliderProps> = observer(({
  blockId,
  portId,
  portLabel,
  defaultSource,
  value,
  min,
  max,
  step,
}) => {
  const { patch } = useStores();

  // Local state for immediate slider feedback
  const [localValue, setLocalValue] = useState(value);
  const [updateTimer, setUpdateTimer] = useState<number | null>(null);

  // Sync local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((_event: Event, newValue: number | number[]) => {
    const val = Array.isArray(newValue) ? newValue[0] : newValue;
    setLocalValue(val);

    // Clear existing timer
    if (updateTimer !== null) {
      clearTimeout(updateTimer);
    }

    // Debounce: update PatchStore after 100ms of no changes
    const timer = window.setTimeout(() => {
      // Update the default source with new value
      const updatedDefaultSource: DefaultSource = {
        ...defaultSource,
        params: {
          ...defaultSource.params,
          value: val,
        },
      };
      patch.updateInputPort(blockId, portId, { defaultSource: updatedDefaultSource });

      // Also sync block.params if a param with this port's name exists.
      // Some blocks (e.g., Array) read config params in their lower() function,
      // so the block param must stay in sync with the default source value.
      const block = patch.blocks.get(blockId);
      if (block && portId in block.params) {
        patch.updateBlockParams(blockId, { [portId]: val });
      }
    }, 100);

    setUpdateTimer(timer);
  }, [blockId, portId, defaultSource, patch, updateTimer]);

  return (
    <Box sx={{ mb: 0.5 }} onPointerDown={(e) => e.stopPropagation()} className="nodrag">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
        <Typography variant="caption" sx={{ color: '#4CAF50', minWidth: '60px', fontSize: '10px' }}>
          {portLabel}:
        </Typography>
        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 'bold', fontSize: '10px' }}>
          {localValue.toFixed(2)}
        </Typography>
      </Box>
      <Slider
        value={localValue}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        size="small"
        sx={{
          py: 0.5,
          color: '#4CAF50',
          '& .MuiSlider-thumb': {
            width: 12,
            height: 12,
          },
          '& .MuiSlider-rail': {
            height: 3,
          },
          '& .MuiSlider-track': {
            height: 3,
          },
        }}
      />
    </Box>
  );
});
