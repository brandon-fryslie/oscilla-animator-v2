/**
 * Vector Component Lens Tests
 *
 * Verifies Extract and Construct blocks for vec3 component manipulation.
 */

import { describe, it, expect } from 'vitest';
import { getBlockTypesByCategory, requireBlockDef } from '../../registry';
import { getAvailableLensTypes } from '../../../ui/reactFlowEditor/lensUtils';

// Ensure lens blocks are registered
import '../../all';

describe('Vector Lens Registration', () => {
  it('Extract and Construct are registered with category "lens"', () => {
    const lensBlocks = getBlockTypesByCategory('lens');
    const lensTypes = lensBlocks.map(b => b.type).sort();

    expect(lensTypes).toContain('Extract');
    expect(lensTypes).toContain('Construct');
  });

  it('Extract and Construct have NO adapterSpec (never auto-inserted)', () => {
    const extract = requireBlockDef('Extract');
    const construct = requireBlockDef('Construct');

    expect(extract.adapterSpec).toBeUndefined();
    expect(construct.adapterSpec).toBeUndefined();
  });

  it('Extract and Construct have capability "pure"', () => {
    const extract = requireBlockDef('Extract');
    const construct = requireBlockDef('Construct');

    expect(extract.capability).toBe('pure');
    expect(construct.capability).toBe('pure');
  });

  it('Extract and Construct have cardinalityMode "preserve"', () => {
    const extract = requireBlockDef('Extract');
    const construct = requireBlockDef('Construct');

    expect(extract.cardinality?.cardinalityMode).toBe('preserve');
    expect(construct.cardinality?.cardinalityMode).toBe('preserve');
  });

  it('Extract is discoverable via getAvailableLensTypes() (has in/out ports)', () => {
    const allLenses = getAvailableLensTypes();
    const lensNames = allLenses.map(l => l.blockType);

    // Extract follows the in/out convention, so it's discoverable
    expect(lensNames).toContain('Extract');
  });

  it('Construct is NOT discoverable via getAvailableLensTypes() (has x/y/z ports, not in/out)', () => {
    const allLenses = getAvailableLensTypes();
    const lensNames = allLenses.map(l => l.blockType);

    // Construct uses x/y/z ports, not the standard in/out convention
    // This is intentional - it's a multi-input constructor
    expect(lensNames).not.toContain('Construct');
  });
});

describe('Extract Block', () => {
  it('has correct port structure', () => {
    const def = requireBlockDef('Extract');
    expect(def.inputs.in).toBeDefined();
    expect(def.inputs.component).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('component is not exposed as port', () => {
    const def = requireBlockDef('Extract');
    expect(def.inputs.component?.exposedAsPort).toBe(false);
  });

  it('has default value for component', () => {
    const def = requireBlockDef('Extract');
    expect(def.inputs.component?.defaultValue).toBe(0);
  });

  it('input is vec3, output is float (type-changing)', () => {
    const def = requireBlockDef('Extract');
    const inputType = def.inputs.in?.type;
    const outputType = def.outputs.out?.type;

    expect(inputType).toBeDefined();
    expect(outputType).toBeDefined();
    expect(inputType?.payload.kind).toBe('vec3');
    expect(outputType?.payload.kind).toBe('float');
  });

  it('has a lower function', () => {
    const def = requireBlockDef('Extract');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });
});

describe('Construct Block', () => {
  it('has correct port structure', () => {
    const def = requireBlockDef('Construct');
    expect(def.inputs.x).toBeDefined();
    expect(def.inputs.y).toBeDefined();
    expect(def.inputs.z).toBeDefined();
    expect(def.outputs.out).toBeDefined();
  });

  it('all inputs are exposed as ports (need wiring)', () => {
    const def = requireBlockDef('Construct');
    // exposedAsPort defaults to true if not specified
    expect(def.inputs.x?.exposedAsPort).not.toBe(false);
    expect(def.inputs.y?.exposedAsPort).not.toBe(false);
    expect(def.inputs.z?.exposedAsPort).not.toBe(false);
  });

  it('has default values for x, y, z', () => {
    const def = requireBlockDef('Construct');
    expect(def.inputs.x?.defaultValue).toBe(0.0);
    expect(def.inputs.y?.defaultValue).toBe(0.0);
    expect(def.inputs.z?.defaultValue).toBe(0.0);
  });

  it('inputs are float, output is vec3 (type-changing)', () => {
    const def = requireBlockDef('Construct');
    const xType = def.inputs.x?.type;
    const yType = def.inputs.y?.type;
    const zType = def.inputs.z?.type;
    const outputType = def.outputs.out?.type;

    expect(xType).toBeDefined();
    expect(yType).toBeDefined();
    expect(zType).toBeDefined();
    expect(outputType).toBeDefined();

    expect(xType?.payload.kind).toBe('float');
    expect(yType?.payload.kind).toBe('float');
    expect(zType?.payload.kind).toBe('float');
    expect(outputType?.payload.kind).toBe('vec3');
  });

  it('has a lower function', () => {
    const def = requireBlockDef('Construct');
    expect(def.lower).toBeDefined();
    expect(typeof def.lower).toBe('function');
  });
});

describe('Type-Changing Lens Behavior', () => {
  it('Extract changes type from vec3 to float', () => {
    const def = requireBlockDef('Extract');
    const inputType = def.inputs.in?.type;
    const outputType = def.outputs.out?.type;

    // These are type-changing lenses (unlike Sprint 1 pure lenses)
    expect(inputType).not.toEqual(outputType);
    expect(inputType?.payload.kind).toBe('vec3');
    expect(outputType?.payload.kind).toBe('float');
  });

  it('Construct changes type from float to vec3', () => {
    const def = requireBlockDef('Construct');
    const inputType = def.inputs.x?.type; // All inputs are float
    const outputType = def.outputs.out?.type;

    // These are type-changing lenses (unlike Sprint 1 pure lenses)
    expect(inputType).not.toEqual(outputType);
    expect(inputType?.payload.kind).toBe('float');
    expect(outputType?.payload.kind).toBe('vec3');
  });
});
