/**
 * Pure Scalar Lens Tests
 *
 * Verifies mathematical behavior and discoverability of value-shaping lens blocks.
 */

import { describe, it, expect } from 'vitest';
import { getBlockTypesByCategory, requireBlockDef, getBlockDefinition, type BlockDef } from '../../registry';
import { getAvailableLensTypes } from '../../../ui/reactFlowEditor/lensUtils';

// Ensure lens blocks are registered
import '../../all';

describe('Lens Block Registration', () => {
  it('all lens blocks are registered with category "lens"', () => {
    const lensBlocks = getBlockTypesByCategory('lens');
    const lensTypes = lensBlocks.map(b => b.type).sort();

    expect(lensTypes).toContain('ScaleBias');
    expect(lensTypes).toContain('Clamp');
    expect(lensTypes).toContain('Wrap01');
    expect(lensTypes).toContain('StepQuantize');
    expect(lensTypes).toContain('Smoothstep');
    expect(lensTypes).toContain('PowerGamma');
  });

  it('lens blocks have NO adapterSpec (never auto-inserted)', () => {
    const lensBlocks = getBlockTypesByCategory('lens');
    for (const block of lensBlocks) {
      // Lens blocks are primitive BlockDef, not CompositeBlockDef
      if ('lower' in block) {
        expect((block as BlockDef).adapterSpec).toBeUndefined();
      }
    }
  });

  it('all lens blocks have capability "pure"', () => {
    const lensBlocks = getBlockTypesByCategory('lens');
    for (const block of lensBlocks) {
      expect(block.capability).toBe('pure');
    }
  });

  it('all lens blocks have cardinalityMode "preserve"', () => {
    const lensBlocks = getBlockTypesByCategory('lens');
    for (const block of lensBlocks) {
      expect(block.cardinality).toBeDefined();
      expect(block.cardinality?.cardinalityMode).toBe('preserve');
    }
  });

  it('lens blocks are discoverable via getAvailableLensTypes()', () => {
    const allLenses = getAvailableLensTypes();
    const lensNames = allLenses.map(l => l.blockType);

    expect(lensNames).toContain('ScaleBias');
    expect(lensNames).toContain('Clamp');
    expect(lensNames).toContain('Wrap01');
    expect(lensNames).toContain('StepQuantize');
    expect(lensNames).toContain('Smoothstep');
    expect(lensNames).toContain('PowerGamma');
  });
});

describe('ScaleBias Block', () => {
  it('has correct port structure', () => {
    const def = requireBlockDef('ScaleBias');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.scale).toBeDefined();
    expect(def.inputs.bias).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('scale and bias are not exposed as ports', () => {
    const def = requireBlockDef('ScaleBias');
    expect(def.inputs.scale?.exposedAsPort).toBe(false);
    expect(def.inputs.bias?.exposedAsPort).toBe(false);
  });

  it('has default values for scale and bias', () => {
    const def = requireBlockDef('ScaleBias');
    expect(def.inputs.scale?.defaultValue).toBe(1.0);
    expect(def.inputs.bias?.defaultValue).toBe(0.0);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('ScaleBias');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });
});

describe('Clamp Block', () => {
  it('has correct port structure', () => {
    const def = requireBlockDef('Clamp');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.min).toBeDefined();
    expect(def.inputs.max).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('min and max are not exposed as ports', () => {
    const def = requireBlockDef('Clamp');
    expect(def.inputs.min?.exposedAsPort).toBe(false);
    expect(def.inputs.max?.exposedAsPort).toBe(false);
  });

  it('has default values for min and max', () => {
    const def = requireBlockDef('Clamp');
    expect(def.inputs.min?.defaultValue).toBe(0.0);
    expect(def.inputs.max?.defaultValue).toBe(1.0);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('Clamp');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });
});

describe('Wrap01 Block', () => {
  it('has correct port structure', () => {
    const def = requireBlockDef('Wrap01');
    expect(def.inputs.in).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('has no configuration parameters', () => {
    const def = requireBlockDef('Wrap01');
    // Only 'in' input should exist
    expect(Object.keys(def.inputs)).toEqual(['in']);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('Wrap01');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });
});

describe('StepQuantize Block', () => {
  it('has correct port structure', () => {
    const def = requireBlockDef('StepQuantize');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.step).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('step is not exposed as port', () => {
    const def = requireBlockDef('StepQuantize');
    expect(def.inputs.step?.exposedAsPort).toBe(false);
  });

  it('has default value for step', () => {
    const def = requireBlockDef('StepQuantize');
    expect(def.inputs.step?.defaultValue).toBe(0.1);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('StepQuantize');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });
});

describe('Smoothstep Block', () => {
  it('has correct port structure', () => {
    const def = requireBlockDef('Smoothstep');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.edge0).toBeDefined();
    expect(def.inputs.edge1).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('edge0 and edge1 are not exposed as ports', () => {
    const def = requireBlockDef('Smoothstep');
    expect(def.inputs.edge0?.exposedAsPort).toBe(false);
    expect(def.inputs.edge1?.exposedAsPort).toBe(false);
  });

  it('has default values for edge0 and edge1', () => {
    const def = requireBlockDef('Smoothstep');
    expect(def.inputs.edge0?.defaultValue).toBe(0.0);
    expect(def.inputs.edge1?.defaultValue).toBe(1.0);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('Smoothstep');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });
});

describe('PowerGamma Block', () => {
  it('has correct port structure', () => {
    const def = requireBlockDef('PowerGamma');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.gamma).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('gamma is not exposed as port', () => {
    const def = requireBlockDef('PowerGamma');
    expect(def.inputs.gamma?.exposedAsPort).toBe(false);
  });

  it('has default value for gamma', () => {
    const def = requireBlockDef('PowerGamma');
    expect(def.inputs.gamma?.defaultValue).toBe(1.0);
  });

  it('has a lower function', () => {
    const def = requireBlockDef('PowerGamma');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });
});

describe('Lens Type Preservation', () => {
  it('all lens blocks preserve input type (input type == output type)', () => {
    const lensTypes = ['ScaleBias', 'Clamp', 'Wrap01', 'StepQuantize', 'Smoothstep', 'PowerGamma'];

    for (const lensType of lensTypes) {
      const def = requireBlockDef(lensType);
      const inputType = def.inputs.in?.type;
      const outputType = def.outputs.out?.type;

      expect(inputType).toBeDefined();
      expect(outputType).toBeDefined();
      expect(outputType).toEqual(inputType);
    }
  });
});

describe('Lens vs Adapter Distinction', () => {
  it('lens blocks and adapter blocks are kept separate', () => {
    const lensBlocks = getBlockTypesByCategory('lens');
    const adapterBlocks = getBlockTypesByCategory('adapter');

    const lensTypes = new Set(lensBlocks.map(b => b.type));
    const adapterTypes = new Set(adapterBlocks.map(b => b.type));

    // No overlap
    for (const lensType of lensTypes) {
      expect(adapterTypes.has(lensType)).toBe(false);
    }
  });

  it('adapters have adapterSpec, lenses do not', () => {
    const adapterBlocks = getBlockTypesByCategory('adapter');
    for (const block of adapterBlocks) {
      if ('lower' in block) {
        expect((block as BlockDef).adapterSpec).toBeDefined();
      }
    }

    const lensBlocks = getBlockTypesByCategory('lens');
    for (const block of lensBlocks) {
      if ('lower' in block) {
        expect((block as BlockDef).adapterSpec).toBeUndefined();
      }
    }
  });
});
