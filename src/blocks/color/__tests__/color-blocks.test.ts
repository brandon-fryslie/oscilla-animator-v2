/**
 * Color Blocks - Registration and Definition Tests
 *
 * Verifies all color blocks are registered correctly with proper
 * port definitions, types, and metadata.
 */

import { describe, it, expect } from 'vitest';
import { BLOCK_DEFS_BY_TYPE, type BlockDef } from '../../registry';
import { unitOklch, unitRgba01, unitNone, contractClamp01, unitsEqual, type UnitType } from '../../../core/canonical-types';

// Import all blocks to trigger registration
import '../../all';

function getBlock(type: string): BlockDef {
  const def = BLOCK_DEFS_BY_TYPE.get(type);
  if (!def) throw new Error(`Block ${type} not registered`);
  return def;
}

/** Cast InferenceUnitType to UnitType (safe for concrete block defs) */
function asUnit(u: unknown): UnitType {
  return u as UnitType;
}

describe('Color Blocks Registration', () => {
  it('registers all 7 color blocks', () => {
    const colorBlocks = [
      'ColorPicker',
      'MakeColorOKLCH',
      'SplitColorOKLCH',
      'HueShift',
      'MixColor',
      'AlphaMultiply',
      'Adapter_OklchToRgba',
    ];
    for (const type of colorBlocks) {
      expect(BLOCK_DEFS_BY_TYPE.has(type), `${type} should be registered`).toBe(true);
    }
  });
});

describe('ColorPicker', () => {
  it('has h/s/l/a inputs with float type', () => {
    const def = getBlock('ColorPicker');
    expect(def.inputs.h).toBeDefined();
    expect(def.inputs.s).toBeDefined();
    expect(def.inputs.l).toBeDefined();
    expect(def.inputs.a).toBeDefined();
    expect(def.inputs.h.type.payload.kind).toBe('float');
    expect(def.inputs.s.type.payload.kind).toBe('float');
  });

  it('outputs color+oklch', () => {
    const def = getBlock('ColorPicker');
    expect(def.outputs.color.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.outputs.color.type.unit), unitOklch())).toBe(true);
  });

  it('is in color category', () => {
    const def = getBlock('ColorPicker');
    expect(def.category).toBe('color');
  });
});

describe('MakeColorOKLCH', () => {
  it('takes 4 float inputs and outputs color+oklch', () => {
    const def = getBlock('MakeColorOKLCH');
    expect(Object.keys(def.inputs)).toEqual(['h', 's', 'l', 'a']);
    for (const key of ['h', 's', 'l', 'a']) {
      expect(def.inputs[key].type.payload.kind).toBe('float');
    }
    expect(def.outputs.color.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.outputs.color.type.unit), unitOklch())).toBe(true);
  });
});

describe('SplitColorOKLCH', () => {
  it('takes color+oklch input and outputs 4 floats', () => {
    const def = getBlock('SplitColorOKLCH');
    expect(def.inputs.color.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.inputs.color.type.unit), unitOklch())).toBe(true);
    expect(Object.keys(def.outputs)).toEqual(['h', 's', 'l', 'a']);
    for (const key of ['h', 's', 'l', 'a']) {
      expect(def.outputs[key].type.payload.kind).toBe('float');
    }
  });
});

describe('HueShift', () => {
  it('takes color+oklch and float shift, outputs color+oklch', () => {
    const def = getBlock('HueShift');
    expect(def.inputs.in.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.inputs.in.type.unit), unitOklch())).toBe(true);
    expect(def.inputs.shift.type.payload.kind).toBe('float');
    expect(def.outputs.out.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.outputs.out.type.unit), unitOklch())).toBe(true);
  });
});

describe('MixColor', () => {
  it('takes two color+oklch inputs and float t, outputs color+oklch', () => {
    const def = getBlock('MixColor');
    expect(def.inputs.a.type.payload.kind).toBe('color');
    expect(def.inputs.b.type.payload.kind).toBe('color');
    expect(def.inputs.t.type.payload.kind).toBe('float');
    expect(unitsEqual(asUnit(def.inputs.t.type.unit), unitNone())).toBe(true);
    expect(def.outputs.color.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.outputs.color.type.unit), unitOklch())).toBe(true);
  });
});

describe('AlphaMultiply', () => {
  it('takes color+oklch and float alpha, outputs color+oklch', () => {
    const def = getBlock('AlphaMultiply');
    expect(def.inputs.in.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.inputs.in.type.unit), unitOklch())).toBe(true);
    expect(def.inputs.alpha.type.payload.kind).toBe('float');
    expect(def.outputs.out.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.outputs.out.type.unit), unitOklch())).toBe(true);
  });
});

describe('Adapter_OklchToRgba', () => {
  it('takes color+oklch input and outputs color+rgba01', () => {
    const def = getBlock('Adapter_OklchToRgba');
    expect(def.inputs.in.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.inputs.in.type.unit), unitOklch())).toBe(true);
    expect(def.outputs.out.type.payload.kind).toBe('color');
    expect(unitsEqual(asUnit(def.outputs.out.type.unit), unitRgba01())).toBe(true);
  });

  it('has adapterSpec for auto-insertion', () => {
    const def = getBlock('Adapter_OklchToRgba');
    expect(def.adapterSpec).toBeDefined();
    expect(def.adapterSpec!.inputPortId).toBe('in');
    expect(def.adapterSpec!.outputPortId).toBe('out');
    expect(def.adapterSpec!.purity).toBe('pure');
  });

  it('is in adapter category', () => {
    const def = getBlock('Adapter_OklchToRgba');
    expect(def.category).toBe('adapter');
  });
});
