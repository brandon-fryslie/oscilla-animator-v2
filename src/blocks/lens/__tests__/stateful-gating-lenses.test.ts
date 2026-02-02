/**
 * Stateful & Gating Lens Tests
 *
 * Verifies Slew (stateful smoothing), Mask (gating), and Deadzone (value shaping).
 */

import { describe, it, expect } from 'vitest';
import { requireBlockDef } from '../../registry';

// Ensure lens blocks are registered
import '../../all';

describe('Slew Block', () => {
  it('is registered with correct metadata', () => {
    const def = requireBlockDef('Slew');
    expect(def.type).toBe('Slew');
    expect(def.category).toBe('lens');
    expect(def.capability).toBe('state');
    expect(def.isStateful).toBe(true);
  });

  it('has cardinality mode "preserve"', () => {
    const def = requireBlockDef('Slew');
    expect(def.cardinality?.cardinalityMode).toBe('preserve');
  });

  it('has NO adapterSpec (never auto-inserted)', () => {
    const def = requireBlockDef('Slew');
    expect(def.adapterSpec).toBeUndefined();
  });

  it('has correct port structure', () => {
    const def = requireBlockDef('Slew');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.rate).toBeDefined();
    expect(def.inputs.initialValue).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('rate and initialValue are not exposed as ports', () => {
    const def = requireBlockDef('Slew');
    expect(def.inputs.rate?.exposedAsPort).toBe(false);
    expect(def.inputs.initialValue?.exposedAsPort).toBe(false);
  });

  it('has default values for rate and initialValue', () => {
    const def = requireBlockDef('Slew');
    expect(def.inputs.rate?.defaultValue).toBe(0.5);
    expect(def.inputs.initialValue?.defaultValue).toBe(0);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('Slew');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });

  it('input and output types are FLOAT', () => {
    const def = requireBlockDef('Slew');
    expect(def.inputs.in?.type).toBeDefined();
    expect(def.outputs.out?.type).toBeDefined();
    expect(def.inputs.in?.type.payload.kind).toBe('float');
    expect(def.outputs.out?.type.payload.kind).toBe('float');
  });

  it('preserves input type (input type == output type)', () => {
    const def = requireBlockDef('Slew');
    expect(def.outputs.out?.type).toEqual(def.inputs.in?.type);
  });
});

describe('Mask Block', () => {
  it('is registered with correct metadata', () => {
    const def = requireBlockDef('Mask');
    expect(def.type).toBe('Mask');
    expect(def.category).toBe('lens');
    expect(def.capability).toBe('pure');
  });

  it('has cardinality mode "preserve"', () => {
    const def = requireBlockDef('Mask');
    expect(def.cardinality?.cardinalityMode).toBe('preserve');
  });

  it('has NO adapterSpec (never auto-inserted)', () => {
    const def = requireBlockDef('Mask');
    expect(def.adapterSpec).toBeUndefined();
  });

  it('has correct port structure', () => {
    const def = requireBlockDef('Mask');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.mask).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('mask input IS exposed as a port (wirable)', () => {
    const def = requireBlockDef('Mask');
    expect(def.inputs.mask?.exposedAsPort).toBe(true);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('Mask');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });

  it('input and output types are FLOAT', () => {
    const def = requireBlockDef('Mask');
    expect(def.inputs.in?.type).toBeDefined();
    expect(def.outputs.out?.type).toBeDefined();
    expect(def.inputs.in?.type.payload.kind).toBe('float');
    expect(def.outputs.out?.type.payload.kind).toBe('float');
  });

  it('preserves input type (input type == output type)', () => {
    const def = requireBlockDef('Mask');
    expect(def.outputs.out?.type).toEqual(def.inputs.in?.type);
  });
});

describe('Deadzone Block', () => {
  it('is registered with correct metadata', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.type).toBe('Deadzone');
    expect(def.category).toBe('lens');
    expect(def.capability).toBe('pure');
  });

  it('has cardinality mode "preserve"', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.cardinality?.cardinalityMode).toBe('preserve');
  });

  it('has NO adapterSpec (never auto-inserted)', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.adapterSpec).toBeUndefined();
  });

  it('has correct port structure', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.threshold).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('threshold is not exposed as port', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.inputs.threshold?.exposedAsPort).toBe(false);
  });

  it('has default value for threshold', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.inputs.threshold?.defaultValue).toBe(0.01);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });

  it('input and output types are FLOAT', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.inputs.in?.type).toBeDefined();
    expect(def.outputs.out?.type).toBeDefined();
    expect(def.inputs.in?.type.payload.kind).toBe('float');
    expect(def.outputs.out?.type.payload.kind).toBe('float');
  });

  it('preserves input type (input type == output type)', () => {
    const def = requireBlockDef('Deadzone');
    expect(def.outputs.out?.type).toEqual(def.inputs.in?.type);
  });
});

describe('Sprint 2 Lens Registration', () => {
  it('Slew, Mask, and Deadzone are discoverable in lens category', () => {
    const slewDef = requireBlockDef('Slew');
    const maskDef = requireBlockDef('Mask');
    const deadzoneDef = requireBlockDef('Deadzone');

    expect(slewDef.category).toBe('lens');
    expect(maskDef.category).toBe('lens');
    expect(deadzoneDef.category).toBe('lens');
  });

  it('only Slew is stateful among Sprint 2 lenses', () => {
    const slewDef = requireBlockDef('Slew');
    const maskDef = requireBlockDef('Mask');
    const deadzoneDef = requireBlockDef('Deadzone');

    expect(slewDef.isStateful).toBe(true);
    expect(slewDef.capability).toBe('state');

    expect(maskDef.isStateful).toBeUndefined();
    expect(maskDef.capability).toBe('pure');

    expect(deadzoneDef.isStateful).toBeUndefined();
    expect(deadzoneDef.capability).toBe('pure');
  });

  it('all Sprint 2 lenses preserve cardinality', () => {
    const lensTypes = ['Slew', 'Mask', 'Deadzone'];

    for (const lensType of lensTypes) {
      const def = requireBlockDef(lensType);
      expect(def.cardinality?.cardinalityMode).toBe('preserve');
    }
  });

  it('all Sprint 2 lenses have NO adapterSpec', () => {
    const lensTypes = ['Slew', 'Mask', 'Deadzone'];

    for (const lensType of lensTypes) {
      const def = requireBlockDef(lensType);
      expect(def.adapterSpec).toBeUndefined();
    }
  });
});

describe('Mask Block Behavior Spec', () => {
  it('mask input is wirable (exposed as port)', () => {
    const def = requireBlockDef('Mask');
    // This is the key difference from other lens config params
    expect(def.inputs.mask?.exposedAsPort).toBe(true);
  });

  it('has two wirable inputs: in and mask', () => {
    const def = requireBlockDef('Mask');
    const wirableInputs = Object.entries(def.inputs).filter(
      ([_, spec]) => spec.exposedAsPort !== false
    );
    expect(wirableInputs.length).toBe(2);
    expect(wirableInputs.map(([name]) => name).sort()).toEqual(['in', 'mask']);
  });
});

describe('Lens Type Preservation (All Lenses)', () => {
  it('all lens blocks preserve input type', () => {
    const allLensTypes = [
      'ScaleBias', 'Clamp', 'Wrap01', 'StepQuantize', 'Smoothstep', 'PowerGamma',
      'Slew', 'Mask', 'Deadzone'
    ];

    for (const lensType of allLensTypes) {
      const def = requireBlockDef(lensType);
      const inputType = def.inputs.in?.type;
      const outputType = def.outputs.out?.type;

      expect(inputType).toBeDefined();
      expect(outputType).toBeDefined();
      expect(outputType).toEqual(inputType);
    }
  });
});
