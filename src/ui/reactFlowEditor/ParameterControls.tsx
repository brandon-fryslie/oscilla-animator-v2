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
import type { BlockId, UIControlHint } from '../../types';
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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setLocalValue(newValue);

    // Clear existing timer
    if (updateTimer !== null) {
      clearTimeout(updateTimer);
    }

    // Debounce: update PatchStore after 100ms of no changes
    const timer = window.setTimeout(() => {
      patch.updateBlockParams(blockId, { [paramId]: newValue });
    }, 100);

    setUpdateTimer(timer);
  }, [blockId, paramId, patch, updateTimer]);

  return (
    <div style={{ marginBottom: '4px', fontSize: '11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
        <span style={{ color: '#aaa', minWidth: '60px', fontSize: '10px' }}>{label}:</span>
        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '10px' }}>{localValue.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={handleChange}
        style={{
          width: '100%',
          height: '4px',
          cursor: 'pointer',
          accentColor: '#4a90e2',
        }}
      />
    </div>
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
    <div style={{ marginBottom: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="checkbox"
        checked={boolValue}
        onChange={handleChange}
        style={{ cursor: 'pointer' }}
      />
      <span style={{ color: '#aaa', fontSize: '10px' }}>{label}</span>
    </div>
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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    patch.updateBlockParams(blockId, { [paramId]: e.target.value });
  }, [blockId, paramId, patch]);

  if (options.length === 0) {
    return (
      <div style={{ marginBottom: '4px', fontSize: '10px', color: '#f00' }}>
        {label}: (no options)
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '4px', fontSize: '11px' }}>
      <div style={{ color: '#aaa', fontSize: '10px', marginBottom: '2px' }}>{label}:</div>
      <select
        value={stringValue}
        onChange={handleChange}
        style={{
          width: '100%',
          padding: '2px 4px',
          fontSize: '10px',
          background: '#2a2a2a',
          color: '#e0e0e0',
          border: '1px solid #555',
          borderRadius: '3px',
          cursor: 'pointer',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
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
