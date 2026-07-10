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
      // `editableBounds` restores the inline min/max editing the deleted canvas
      // FloatControl had — essential here because a knob with no hint min/max gets a
      // default range that BOTH the slider and its text input clamp to, so a value
      // outside that range is unreachable without expanding the bounds.
      case 'slider':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min} max={hint.max} step={hint.step} onChange={onChange} editableBounds />
        ) : (
          <ReadOnly value={value} />
        );
      case 'int':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min ?? 0} max={hint.max ?? 10000} step={hint.step ?? 1} onChange={onChange} editableBounds />
        ) : (
          <ReadOnly value={value} />
        );
      case 'float':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min ?? 0} max={hint.max ?? 1} step={hint.step ?? 0.01} onChange={onChange} editableBounds />
        ) : (
          <ReadOnly value={value} />
        );
      case 'select':
        // Value-guarded on the runtime type only: a non-string (null/undefined) shows
        // read-only rather than a fabricated "null" option. A string value that has
        // drifted out of the option list (renamed/removed option) still gets an editable
        // picker so the user can choose a valid option — never locked read-only.
        // [LAW:no-silent-failure]
        return isString(value) ? (
          <SelectInput value={value} onChange={onChange} options={hint.options.slice()} size="sm" />
        ) : (
          <ReadOnly value={value} />
        );
      case 'boolean':
        // Value-guarded: only a real boolean drives the checkbox; a non-boolean under
        // a boolean hint is shown read-only rather than coerced into a fabricated
        // checked state that lies about what is stored. [LAW:no-silent-failure]
        return isBoolean(value) ? (
          <CheckboxInput checked={value} onChange={onChange} />
        ) : (
          <ReadOnly value={value} />
        );
      case 'color':
        return isString(value) ? <ColorInput value={value} onChange={onChange} /> : <ReadOnly value={value} />;
      case 'text':
        // Value-guarded like the rest: only a real string is editable as text; a
        // non-string under a text hint shows read-only rather than being coerced into a
        // string display and written back as one. [LAW:no-silent-failure]
        return isString(value) ? <TextInput value={value} onChange={onChange} size="sm" /> : <ReadOnly value={value} />;
      case 'xy': {
        // Guard both axes: render the pair of sliders only when x and y are finite
        // numbers, else show the real value read-only — never fabricate 0 for a missing
        // or non-finite axis. [LAW:types-are-the-program]
        if (typeof value !== 'object' || value === null) return <ReadOnly value={value} />;
        const xy = value as { x?: unknown; y?: unknown };
        const { x, y } = xy;
        if (!isNumber(x) || !isNumber(y)) return <ReadOnly value={value} />;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <SliderWithInput label="X" value={x} min={-1000} max={1000} step={1} onChange={(nx) => onChange({ ...xy, x: nx })} editableBounds />
            <SliderWithInput label="Y" value={y} min={-1000} max={1000} step={1} onChange={(ny) => onChange({ ...xy, y: ny })} editableBounds />
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
