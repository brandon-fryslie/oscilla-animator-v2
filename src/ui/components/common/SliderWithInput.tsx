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
import { Slider, TextInput, Text, Group, Box, rem, Modal, Button } from '@mantine/core';

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
  /** Compactness for slider and input controls */
  size?: 'xs' | 'sm' | 'md';
  /** Disable control */
  disabled?: boolean;
  /** Unit label (e.g., "ms") */
  unit?: string;
  /** Explicit numeric input width in rems */
  inputWidthRem?: number;
  /**
   * When true, slider drag updates are buffered locally and committed on release.
   * // [LAW:dataflow-not-control-flow] Same render path; only commit timing varies by data flag.
   */
  commitOnRelease?: boolean;
  /**
   * Enables inline editable min/max bounds next to the slider.
   * // [LAW:dataflow-not-control-flow] Bound edits flow as data into one control path.
   */
  editableBounds?: boolean;
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
  size = 'sm',
  disabled = false,
  unit,
  inputWidthRem,
  commitOnRelease = false,
  editableBounds = false,
}: SliderWithInputProps): React.ReactElement {
  // Local state for text field to allow typing without immediate validation
  const [inputValue, setInputValue] = useState<string>(value.toString());
  const [sliderValue, setSliderValue] = useState<number>(value);
  const [boundMin, setBoundMin] = useState<number>(min);
  const [boundMax, setBoundMax] = useState<number>(max);
  const [editingBound, setEditingBound] = useState<'min' | 'max' | null>(null);
  const [boundDraft, setBoundDraft] = useState<string>('');

  const sliderMin = editableBounds ? boundMin : min;
  const sliderMax = editableBounds ? boundMax : max;

  // Sync input when value changes externally
  React.useEffect(() => {
    setInputValue(value.toString());
    setSliderValue(value);
  }, [value]);

  React.useEffect(() => {
    setBoundMin(min);
    setBoundMax(max);
  }, [min, max]);

  // Handle slider change
  const handleSliderChange = (newValue: number) => {
    if (commitOnRelease) {
      setSliderValue(newValue);
      return;
    }
    onChange(newValue);
  };

  const handleSliderChangeEnd = (newValue: number) => {
    if (!commitOnRelease) return;
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
      const clamped = Math.max(sliderMin, Math.min(sliderMax, parsed));
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

  const commitBounds = (nextMin: number, nextMax: number): void => {
    if (nextMin >= nextMax) {
      const delta = Math.max(step, 1e-6);
      nextMax = nextMin + delta;
    }

    setBoundMin(nextMin);
    setBoundMax(nextMax);
    const clamped = Math.max(nextMin, Math.min(nextMax, value));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  const openBoundEditor = (bound: 'min' | 'max', event: React.MouseEvent): void => {
    if (!editableBounds || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const current = bound === 'min' ? boundMin : boundMax;
    setBoundDraft(current.toString());
    setEditingBound(bound);
  };

  const closeBoundEditor = (): void => {
    setEditingBound(null);
    setBoundDraft('');
  };

  const saveBoundDraft = (): void => {
    if (!editingBound) return;
    const parsed = parseFloat(boundDraft);
    if (!Number.isFinite(parsed)) {
      closeBoundEditor();
      return;
    }
    if (editingBound === 'min') {
      commitBounds(parsed, boundMax);
    } else {
      commitBounds(boundMin, parsed);
    }
    closeBoundEditor();
  };

  const handleBoundDraftKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      saveBoundDraft();
    }
  };

  const resolvedInputWidthRem = inputWidthRem ?? (unit ? 90 / 16 : 70 / 16);

  return (
    <Box mb="xs">
      {/* Render the header only for a non-empty label: callers that render the label
          themselves pass "" and must not get a dead font-scaled gap above the track. */}
      {label && (
        <Text size="xs" fw={500} c="gray.4" mb={4}>
          {label}
        </Text>
      )}
      <Group gap="xs" align="center">
        <Box style={{ flex: 1 }}>
          <Slider
            value={commitOnRelease ? sliderValue : value}
            onChange={handleSliderChange}
            onChangeEnd={handleSliderChangeEnd}
            min={sliderMin}
            max={sliderMax}
            step={step}
            disabled={disabled}
            size={size}
            color="violet"
            label={(val) => typeof val === 'number' ? val.toFixed(2) : String(val)}
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
          {editableBounds && (
            <Group justify="space-between" mt={4} wrap="nowrap">
              <Text
                size="xs"
                c="dimmed"
                onContextMenu={(event) => openBoundEditor('min', event)}
                style={{
                  cursor: disabled ? 'default' : 'context-menu',
                  userSelect: 'none',
                }}
                title={disabled ? undefined : 'Right-click to edit minimum'}
              >
                {sliderMin.toFixed(2)}
              </Text>
              <Text
                size="xs"
                c="dimmed"
                onContextMenu={(event) => openBoundEditor('max', event)}
                style={{
                  cursor: disabled ? 'default' : 'context-menu',
                  userSelect: 'none',
                }}
                title={disabled ? undefined : 'Right-click to edit maximum'}
              >
                {sliderMax.toFixed(2)}
              </Text>
            </Group>
          )}
        </Box>
        <TextInput
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          size={size}
          rightSection={
            unit ? (
              <Text size="xs" c="dimmed">
                {unit}
              </Text>
            ) : undefined
          }
          styles={{
            root: {
              width: rem(resolvedInputWidthRem * 16),
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
      <Modal
        opened={editingBound !== null}
        onClose={closeBoundEditor}
        title={editingBound === 'min' ? 'Edit Minimum' : 'Edit Maximum'}
        centered
        size="xs"
      >
        <TextInput
          value={boundDraft}
          onChange={(event) => setBoundDraft(event.target.value)}
          onKeyDown={handleBoundDraftKeyDown}
          autoFocus
          type="number"
          inputMode="decimal"
          size="sm"
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" size="xs" onClick={closeBoundEditor}>
            Cancel
          </Button>
          <Button size="xs" onClick={saveBoundDraft}>
            Save
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
