/**
 * DecorationParamControls — the neutral in-place editor for an edge decoration's
 * params.
 *
 * This is the widget-dispatch that used to live inside `LensParamControls`, lifted
 * to speak the editor's neutral `DecorationParam` vocabulary instead of a V1
 * `LensAttachment`. It renders one control per param — the SAME dispatch by value
 * type / `UIControlHint` a block param uses — and reports edits through a single
 * `onChange(paramId, value)`. It holds no store: the caller routes the change to
 * the era's provider (`EdgeDecorator.setParam`), so one component edits a V1 lens
 * and a pillar transform identically. [LAW:one-type-per-behavior]
 * [LAW:effects-at-boundaries]
 */

import React from 'react';
import type { UIControlHint } from '../../types';
import {
  SliderWithInput,
  SelectInput,
  CheckboxInput,
  TextInput,
  ColorInput,
} from '../components/common';
import type { DecorationParam } from './edge-decorations';

interface NumericRange {
  min: number;
  max: number;
  step: number;
}

/** Sensible numeric bounds when a param carries no explicit slider hint. */
function fallbackNumericRange(paramId: string): NumericRange {
  const key = paramId.toLowerCase();
  if (key.includes('scale')) return { min: 0, max: 4, step: 0.01 };
  if (key.includes('bias') || key.includes('offset')) return { min: -2, max: 2, step: 0.01 };
  return { min: -100, max: 100, step: 0.01 };
}

function numericRangeFromHint(paramId: string, hint?: UIControlHint): NumericRange {
  if (hint?.kind === 'slider') {
    return { min: hint.min, max: hint.max, step: hint.step };
  }
  if (hint?.kind === 'int' || hint?.kind === 'float') {
    const fallback = fallbackNumericRange(paramId);
    return {
      min: hint.min ?? fallback.min,
      max: hint.max ?? fallback.max,
      step: hint.step ?? (hint.kind === 'int' ? 1 : fallback.step),
    };
  }
  return fallbackNumericRange(paramId);
}

interface DecorationParamControlsProps {
  readonly params: readonly DecorationParam[];
  readonly onChange: (paramId: string, value: unknown) => void;
  readonly compact?: boolean;
}

export function DecorationParamControls({
  params,
  onChange,
  compact = false,
}: DecorationParamControlsProps): React.ReactElement | null {
  if (params.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
      {params.map((param) => {
        const { id, label, value, hint } = param;

        if (typeof value === 'number') {
          const range = numericRangeFromHint(id, hint);
          return (
            <SliderWithInput
              key={id}
              label={label}
              value={value}
              onChange={(next) => onChange(id, next)}
              min={range.min}
              max={range.max}
              step={range.step}
              editableBounds
            />
          );
        }

        if (hint?.kind === 'boolean' || typeof value === 'boolean') {
          return (
            <CheckboxInput
              key={id}
              label={label}
              checked={Boolean(value)}
              onChange={(next) => onChange(id, next)}
            />
          );
        }

        if (hint?.kind === 'select') {
          return (
            <SelectInput
              key={id}
              label={label}
              value={String(value ?? '')}
              options={hint.options}
              onChange={(next) => onChange(id, next)}
            />
          );
        }

        if (hint?.kind === 'color') {
          return (
            <ColorInput
              key={id}
              label={label}
              value={typeof value === 'string' ? value : '#ffffff'}
              onChange={(next) => onChange(id, next)}
            />
          );
        }

        if (hint?.kind === 'text' || typeof value === 'string') {
          return (
            <TextInput
              key={id}
              label={label}
              value={String(value ?? '')}
              onChange={(next) => onChange(id, next)}
            />
          );
        }

        return (
          <div key={id} style={{ fontSize: 12, opacity: 0.8 }}>
            {label}: {String(value)}
          </div>
        );
      })}
    </div>
  );
}
