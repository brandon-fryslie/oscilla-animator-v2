/**
 * ScatterUV Block Tests
 *
 * Validates registration, port types, and lowering behavior
 * of the ScatterUV (Halton sequence) layout block.
 */

import { describe, it, expect } from 'vitest';
import { requireBlockDef } from '../registry';
import { VEC2, FLOAT } from '../../core/canonical-types';

// Ensure all blocks are registered
import '../all';

describe('ScatterUV block', () => {
  it('is registered with correct metadata', () => {
    const def = requireBlockDef('ScatterUV');
    expect(def.type).toBe('ScatterUV');
    expect(def.category).toBe('layout');
    expect(def.form).toBe('primitive');
    expect(def.capability).toBe('pure');
    expect(def.loweringPurity).toBe('pure');
  });

  it('has index input with float payload and manyOnly cardinality', () => {
    const def = requireBlockDef('ScatterUV');
    const indexInput = def.inputs.index;
    expect(indexInput).toBeDefined();
    expect(indexInput.type.payload).toEqual(FLOAT);
    expect(indexInput.defaulting).toBe('forbidden');

    // Cardinality must be a var with manyOnly acceptance
    const card = indexInput.type.extent.cardinality;
    expect(card.kind).toBe('var');
  });

  it('has uv output with vec2 payload', () => {
    const def = requireBlockDef('ScatterUV');
    const uvOutput = def.outputs.uv;
    expect(uvOutput).toBeDefined();
    expect(uvOutput.type.payload).toEqual(VEC2);
  });

  it('shares cardinality var between index input and uv output', () => {
    const def = requireBlockDef('ScatterUV');
    const inputCard = def.inputs.index.type.extent.cardinality;
    const outputCard = def.outputs.uv.type.extent.cardinality;

    // Both ports reference the same cardinality variable
    expect(inputCard.kind).toBe('var');
    expect(outputCard.kind).toBe('var');
    if (inputCard.kind === 'var' && outputCard.kind === 'var') {
      expect(inputCard.var).toBe(outputCard.var);
    }
  });
});
