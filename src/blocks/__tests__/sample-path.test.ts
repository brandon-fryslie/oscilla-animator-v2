/**
 * SamplePath Block Tests
 *
 * Verifies block registration, port definitions, and cardinality constraints.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { registerAllBlocks } from '../all';
import { requireBlockDef } from '../registry';

beforeAll(() => {
  registerAllBlocks();
});

describe('SamplePath block definition', () => {
  it('is registered as SamplePath', () => {
    const def = requireBlockDef('SamplePath');
    expect(def.type).toBe('SamplePath');
    expect(def.category).toBe('layout');
    expect(def.form).toBe('primitive');
    expect(def.capability).toBe('pure');
  });

  it('has controlPoints and t inputs', () => {
    const def = requireBlockDef('SamplePath');
    expect(def.inputs.controlPoints).toBeDefined();
    expect(def.inputs.t).toBeDefined();
  });

  it('has position and tangent outputs', () => {
    const def = requireBlockDef('SamplePath');
    expect(def.outputs.position).toBeDefined();
    expect(def.outputs.tangent).toBeDefined();
  });

  it('controlPoints input forbids defaulting', () => {
    const def = requireBlockDef('SamplePath');
    expect(def.inputs.controlPoints.defaulting).toBe('forbidden');
  });

  it('t input forbids defaulting', () => {
    const def = requireBlockDef('SamplePath');
    expect(def.inputs.t.defaulting).toBe('forbidden');
  });

  it('controlPoints uses manyOnly acceptance (source domain)', () => {
    const def = requireBlockDef('SamplePath');
    const cpType = def.inputs.controlPoints.type;
    const card = cpType.extent.cardinality;
    expect(card.kind).toBe('var');
    if (card.kind === 'var') {
      expect(card.acceptance).toBe('manyOnly');
    }
  });

  it('t and outputs share a cardinality var (target domain)', () => {
    const def = requireBlockDef('SamplePath');
    const tCard = def.inputs.t.type.extent.cardinality;
    const posCard = def.outputs.position.type.extent.cardinality;
    const tanCard = def.outputs.tangent.type.extent.cardinality;

    // All three should reference the same cardinality var
    expect(tCard.kind).toBe('var');
    expect(posCard.kind).toBe('var');
    expect(tanCard.kind).toBe('var');

    if (tCard.kind === 'var' && posCard.kind === 'var' && tanCard.kind === 'var') {
      expect(posCard.var).toBe(tCard.var);
      expect(tanCard.var).toBe(tCard.var);
    }
  });

  it('source and target cardinality vars are distinct', () => {
    const def = requireBlockDef('SamplePath');
    const cpCard = def.inputs.controlPoints.type.extent.cardinality;
    const tCard = def.inputs.t.type.extent.cardinality;

    expect(cpCard.kind).toBe('var');
    expect(tCard.kind).toBe('var');

    if (cpCard.kind === 'var' && tCard.kind === 'var') {
      expect(cpCard.var).not.toBe(tCard.var);
    }
  });

  it('position output is vec2', () => {
    const def = requireBlockDef('SamplePath');
    expect(def.outputs.position.type.payload.kind).toBe('vec2');
  });

  it('tangent output is float', () => {
    const def = requireBlockDef('SamplePath');
    expect(def.outputs.tangent.type.payload.kind).toBe('float');
  });

  it('has a lower function', () => {
    const def = requireBlockDef('SamplePath');
    expect(typeof def.lower).toBe('function');
  });
});
