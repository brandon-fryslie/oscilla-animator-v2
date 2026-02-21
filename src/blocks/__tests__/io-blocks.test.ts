/**
 * IO Blocks Tests
 *
 * Tests for ExternalInput, ExternalGate, and ExternalVec2 blocks.
 */

import { describe, it, expect } from 'vitest';
import { FLOAT, VEC2, isAxisVar, resolveCardinalityPolicy } from '../../core/canonical-types';
import {
  getBlockDefinition,
  requireBlockDef,
  getBlockTypesByCategory,
  getAllBlockTypes,
} from '../registry';

// Import all blocks to ensure they're registered
import '../all';


describe('IO Blocks - Registry', () => {
  it('registers ExternalInput block', () => {
    const def = getBlockDefinition('ExternalInput');
    expect(def).toBeDefined();
    expect(def!.type).toBe('ExternalInput');
    expect(def!.category).toBe('io');
    expect(def!.capability).toBe('io');
  });

  it('registers ExternalGate block', () => {
    const def = getBlockDefinition('ExternalGate');
    expect(def).toBeDefined();
    expect(def!.type).toBe('ExternalGate');
    expect(def!.category).toBe('io');
    expect(def!.capability).toBe('io');
  });

  it('registers ExternalVec2 block', () => {
    const def = getBlockDefinition('ExternalVec2');
    expect(def).toBeDefined();
    expect(def!.type).toBe('ExternalVec2');
    expect(def!.category).toBe('io');
    expect(def!.capability).toBe('io');
  });

  it('includes all three blocks in io category', () => {
    const ioBlocks = getBlockTypesByCategory('io');
    const ioTypes = ioBlocks.map(b => b.type);

    expect(ioTypes).toContain('ExternalInput');
    expect(ioTypes).toContain('ExternalGate');
    expect(ioTypes).toContain('ExternalVec2');
  });

  it('includes all three blocks in getAllBlockTypes', () => {
    const allTypes = getAllBlockTypes();

    expect(allTypes).toContain('ExternalInput');
    expect(allTypes).toContain('ExternalGate');
    expect(allTypes).toContain('ExternalVec2');
  });
});

describe('ExternalInput Block', () => {
  const def = requireBlockDef('ExternalInput');

  it('has correct metadata', () => {
    expect(def.label).toBe('External Input');
    expect(def.description).toContain('external channel');
    expect(def.form).toBe('primitive');
  });

  it('has channel config input with default value', () => {
    expect(def.inputs.channel).toBeDefined();
    expect(def.inputs.channel.defaultValue).toBe('mouse.x');
    expect(def.inputs.channel.exposedAsPort).toBe(false);
  });

  it('has value output with float type', () => {
    expect(def.outputs.value).toBeDefined();
    expect(def.outputs.value.type.payload).toBe(FLOAT);
  });

  it('declares flexible output cardinality policy on CT/ICT', () => {
    const axis = def.outputs.value.type.extent.cardinality;
    expect(isAxisVar(axis)).toBe(true);
    if (!isAxisVar(axis)) return;
    const policy = resolveCardinalityPolicy(axis);
    expect(policy).not.toBeNull();
    if (!policy) return;
    expect(policy.relation).toBe('promoteToMany');
    expect(policy.acceptance).toBe('oneOrMany');
    expect(policy.instanceBinding).toBe('inherit');
  });
});

describe('ExternalGate Block', () => {
  const def = requireBlockDef('ExternalGate');

  it('has correct metadata', () => {
    expect(def.label).toBe('External Gate');
    expect(def.description).toContain('gate');
    expect(def.description).toContain('threshold');
    expect(def.form).toBe('primitive');
  });

  it('has channel and threshold config inputs', () => {
    expect(def.inputs.channel).toBeDefined();
    expect(def.inputs.channel.defaultValue).toBe('mouse.x');
    expect(def.inputs.channel.exposedAsPort).toBe(false);

    expect(def.inputs.threshold).toBeDefined();
    expect(def.inputs.threshold.defaultValue).toBe(0.5);
    expect(def.inputs.threshold.exposedAsPort).toBe(false);
  });

  it('has gate output with float type', () => {
    expect(def.outputs.gate).toBeDefined();
    expect(def.outputs.gate.type.payload).toBe(FLOAT);
  });

  it('declares flexible output cardinality policy on CT/ICT', () => {
    const axis = def.outputs.gate.type.extent.cardinality;
    expect(isAxisVar(axis)).toBe(true);
    if (!isAxisVar(axis)) return;
    const policy = resolveCardinalityPolicy(axis);
    expect(policy).not.toBeNull();
    if (!policy) return;
    expect(policy.relation).toBe('promoteToMany');
    expect(policy.acceptance).toBe('oneOrMany');
    expect(policy.instanceBinding).toBe('inherit');
  });
});

describe('ExternalVec2 Block', () => {
  const def = requireBlockDef('ExternalVec2');

  it('has correct metadata', () => {
    expect(def.label).toBe('External Vec2');
    expect(def.description).toContain('vec2');
    expect(def.form).toBe('primitive');
  });

  it('has channelBase config input', () => {
    expect(def.inputs.channelBase).toBeDefined();
    expect(def.inputs.channelBase.defaultValue).toBe('mouse');
    expect(def.inputs.channelBase.exposedAsPort).toBe(false);
  });

  it('has position output with vec2 type', () => {
    expect(def.outputs.position).toBeDefined();
    expect(def.outputs.position.type.payload).toBe(VEC2);
  });

  it('declares flexible output cardinality policy on CT/ICT', () => {
    const axis = def.outputs.position.type.extent.cardinality;
    expect(isAxisVar(axis)).toBe(true);
    if (!isAxisVar(axis)) return;
    const policy = resolveCardinalityPolicy(axis);
    expect(policy).not.toBeNull();
    if (!policy) return;
    expect(policy.relation).toBe('promoteToMany');
    expect(policy.acceptance).toBe('oneOrMany');
    expect(policy.instanceBinding).toBe('inherit');
  });
});
