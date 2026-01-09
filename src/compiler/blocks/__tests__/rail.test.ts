/**
 * Tests for Rail Block
 *
 * Verifies that the Rail block:
 * 1. Passes through input values unchanged
 * 2. Provides default value when no input connected
 * 3. Works with any signal type (polymorphic passthrough)
 */

import { describe, it, expect } from 'vitest';
import { getBlock } from '../registry';
import { IRBuilder } from '../../ir/builder';
import { signalTypeSignal as sigType } from '../../../core/canonical-types';
import type { ValueRef } from '../registry';

// Import blocks to trigger registration
import '../index';

describe('Rail Block', () => {
  it('is registered', () => {
    expect(getBlock('Rail')).toBeDefined();
  });

  it('has optional input', () => {
    const block = getBlock('Rail')!;
    expect(block.inputs.length).toBe(1);
    expect(block.inputs[0].optional).toBe(true);
  });

  it('passes through signal input unchanged', () => {
    const block = getBlock('Rail')!;
    const builder = new IRBuilder();

    const inputSig = builder.sigConst(0.5, sigType('float'));
    const inputRef: ValueRef = { kind: 'sig', id: inputSig, type: sigType('float') };

    const outputs = block.lower({
      b: builder,
      inputsById: { in: inputRef },
      config: {},
    });

    expect(outputs.out).toBe(inputRef);
  });

  it('passes through field input unchanged', () => {
    const block = getBlock('Rail')!;
    const builder = new IRBuilder();

    const domain = builder.domainN(10, 0);
    const fieldId = builder.fieldSource(domain, 'normalizedIndex', sigType('float'));
    const inputRef: ValueRef = { kind: 'field', id: fieldId, type: sigType('float') };

    const outputs = block.lower({
      b: builder,
      inputsById: { in: inputRef },
      config: {},
    });

    expect(outputs.out).toBe(inputRef);
  });

  it('passes through domain input unchanged', () => {
    const block = getBlock('Rail')!;
    const builder = new IRBuilder();

    const domain = builder.domainN(10, 0);
    const inputRef: ValueRef = { kind: 'domain', id: domain };

    const outputs = block.lower({
      b: builder,
      inputsById: { in: inputRef },
      config: {},
    });

    expect(outputs.out).toBe(inputRef);
  });

  it('provides default when no input connected', () => {
    const block = getBlock('Rail')!;
    const builder = new IRBuilder();

    const outputs = block.lower({
      b: builder,
      inputsById: {},
      config: {},
    });

    expect(outputs.out).toBeDefined();
    expect(outputs.out.kind).toBe('sig');
  });
});
