/**
 * NeutralParamControl — the ONE hint-first, value-guarded control widget, for every
 * surface that edits a neutral param.
 *
 * A neutral inline control (`ParamData` on a canvas node, `DetailControl` in the
 * inspector) is the SAME behavior wherever it appears: given a `UIControlHint` and a
 * stored `value`, render the widget that faithfully edits that value and report
 * edits through one `onChange`. Because it is one behavior it is one component — the
 * canvas node, the block inspector, and the port inspector all mount THIS, so a V1
 * binding control and a pillar config knob look and act identically. [LAW:one-type-per-behavior]
 *
 * HINT-FIRST, VALUE-GUARDED. The hint selects the widget; a widget renders only when
 * the stored value is the type it can faithfully edit. A hint/value mismatch (a
 * numeric hint over a string, a color hint over a non-string) or an absent value
 * shows a read-only fallback of the REAL value — never a fabricated `0`/`#000000`
 * that would let the widget lie about, or silently overwrite, what is stored.
 * [LAW:types-are-the-program] [LAW:no-silent-failure]
 *
 * It holds no store: the caller passes `onChange`, which the provider closed over its
 * own store (`ParamData.apply` / `DetailControl.apply`). One widget edits both eras
 * because the effect stays with the party that minted the control. [LAW:effects-at-boundaries]
 */

import React from 'react';
import {
  NumberInput,
  TextInput,
  SelectInput,
  CheckboxInput,
  ColorInput,
  SliderWithInput,
} from '../components/common';
import { colors } from '../theme';
import type { UIControlHint } from '../../types';

export function NeutralParamControl({
  hint,
  value,
  onChange,
}: {
  hint?: UIControlHint;
  value: unknown;
  onChange: (value: unknown) => void;
}): React.ReactElement {
  if (hint) {
    switch (hint.kind) {
      case 'slider':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min} max={hint.max} step={hint.step} onChange={onChange} />
        ) : (
          <ReadOnly value={value} />
        );
      case 'int':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min ?? 0} max={hint.max ?? 10000} step={hint.step ?? 1} onChange={onChange} />
        ) : (
          <ReadOnly value={value} />
        );
      case 'float':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min ?? 0} max={hint.max ?? 1} step={hint.step ?? 0.01} onChange={onChange} />
        ) : (
          <ReadOnly value={value} />
        );
      case 'select':
        // Value-guarded like every other case: render the picker only when the stored
        // value is one of the real options; otherwise show the actual value read-only
        // rather than coercing null/undefined into a fabricated "null"/"undefined"
        // option that isn't in the list. [LAW:no-silent-failure]
        return isString(value) && hint.options.some((o) => o.value === value) ? (
          <SelectInput value={value} onChange={onChange} options={hint.options.slice()} size="sm" />
        ) : (
          <ReadOnly value={value} />
        );
      case 'boolean':
        return <CheckboxInput checked={Boolean(value)} onChange={onChange} />;
      case 'color':
        return isString(value) ? <ColorInput value={value} onChange={onChange} /> : <ReadOnly value={value} />;
      case 'text':
        return <TextInput value={String(value ?? '')} onChange={onChange} size="sm" />;
      case 'xy': {
        if (typeof value !== 'object' || value === null) return <ReadOnly value={value} />;
        const xy = value as { x?: number; y?: number };
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <SliderWithInput label="X" value={xy.x ?? 0} min={-1000} max={1000} step={1} onChange={(x) => onChange({ ...xy, x })} />
            <SliderWithInput label="Y" value={xy.y ?? 0} min={-1000} max={1000} step={1} onChange={(y) => onChange({ ...xy, y })} />
          </div>
        );
      }
      default: {
        const _exhaustive: never = hint;
        throw new Error(`Unhandled UIControlHint: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  // No hint: choose by the stored value's type; never fabricate.
  if (isBoolean(value)) return <CheckboxInput checked={value} onChange={onChange} />;
  if (isNumber(value)) return <NumberInput value={value} onChange={onChange} size="sm" />;
  if (isString(value)) return <TextInput value={value} onChange={onChange} size="sm" />;
  return <ReadOnly value={value} />;
}

function ReadOnly({ value }: { value: unknown }) {
  return (
    <div style={{ padding: '6px 8px', background: colors.bgPanel, borderRadius: '4px', fontSize: '12px', color: colors.textMuted }}>
      {value === undefined || value === null ? '—' : formatValue(value)}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
