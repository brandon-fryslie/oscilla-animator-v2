/**
 * LensParamControls
 *
 * Reusable lens-parameter editor used by:
 * - Edge Inspector
 * - Edge lens chip popover
 *
 * // [LAW:single-enforcer] Lens param editing is centralized in one UI component.
 */

import React, { useMemo } from 'react';
import { requireAnyBlockDef } from '../../blocks/registry';
import type { InputDef } from '../../blocks/registry';
import type { LensAttachment } from '../../graph/Patch';
import type { BlockId, UIControlHint } from '../../types';
import { useStores } from '../../stores';
import {
  SliderWithInput,
  SelectInput,
  CheckboxInput,
  TextInput,
  ColorInput,
} from './common';

interface LensParamControlsProps {
  lens: LensAttachment;
  targetBlockId: BlockId;
  targetPortId: string;
  compact?: boolean;
}

interface NumericRange {
  min: number;
  max: number;
  step: number;
}

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

function defaultParamValue(inputDef: InputDef): unknown {
  return inputDef.defaultValue ?? 0;
}

export function LensParamControls({
  lens,
  targetBlockId,
  targetPortId,
  compact = false,
}: LensParamControlsProps): React.ReactElement | null {
  const { patch } = useStores();
  const lensDef = requireAnyBlockDef(lens.lensType);

  const paramInputs = useMemo(
    () =>
      Object.entries(lensDef.inputs).filter(([inputId]) => inputId !== 'in'),
    [lensDef.inputs],
  );

  if (paramInputs.length === 0) return null;

  const updateParam = (paramId: string, value: unknown): void => {
    patch.updateLensParams(targetBlockId, targetPortId, lens.id, { [paramId]: value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
      {paramInputs.map(([paramId, inputDef]) => {
        const label = inputDef.label ?? paramId;
        const value = (lens.params?.[paramId] ?? defaultParamValue(inputDef)) as unknown;
        const hint = inputDef.uiHint;

        if (typeof value === 'number') {
          const range = numericRangeFromHint(paramId, hint);
          return (
            <SliderWithInput
              key={paramId}
              label={label}
              value={value}
              onChange={(next) => updateParam(paramId, next)}
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
              key={paramId}
              label={label}
              checked={Boolean(value)}
              onChange={(next) => updateParam(paramId, next)}
            />
          );
        }

        if (hint?.kind === 'select') {
          return (
            <SelectInput
              key={paramId}
              label={label}
              value={String(value ?? '')}
              options={hint.options}
              onChange={(next) => updateParam(paramId, next)}
            />
          );
        }

        if (hint?.kind === 'color') {
          return (
            <ColorInput
              key={paramId}
              label={label}
              value={typeof value === 'string' ? value : '#ffffff'}
              onChange={(next) => updateParam(paramId, next)}
            />
          );
        }

        if (hint?.kind === 'text' || typeof value === 'string') {
          return (
            <TextInput
              key={paramId}
              label={label}
              value={String(value ?? '')}
              onChange={(next) => updateParam(paramId, next)}
            />
          );
        }

        return (
          <div key={paramId} style={{ fontSize: 12, opacity: 0.8 }}>
            {label}: {String(value)}
          </div>
        );
      })}
    </div>
  );
}
