/**
 * Expression DSL Integration Tests
 *
 * End-to-end tests for compileExpression() public API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compileExpression } from '../index';
import { signalType } from '../../core/canonical-types';
import { IRBuilderImpl } from '../../compiler/ir/IRBuilderImpl';

describe('compileExpression Integration', () => {
  let builder: IRBuilderImpl;

  beforeEach(() => {
    builder = new IRBuilderImpl();
  });

  it('compiles literal expression', () => {
    const result = compileExpression(
      '42',
      new Map(),
      builder,
      new Map()
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const sigExpr = builder['sigExprs'][result.value as any];
      expect(sigExpr.kind).toBe('const');
      expect((sigExpr as any).value).toBe(42);
    }
  });

  it('compiles identifier expression', () => {
    // Create an input signal
    const inputSig = builder.sigConst(10, signalType('int'));

    // Compile expression that references it
    const result = compileExpression(
      'x',
      new Map([['x', signalType('int')]]),
      builder,
      new Map([['x', inputSig]])
    );

    if (!result.ok) {
      console.error('Compilation failed:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should return the input signal ID unchanged
      expect(result.value).toBe(inputSig);
    }
  });

  it('compiles binary operation', () => {
    // Create input signals
    const aSig = builder.sigConst(5, signalType('int'));
    const bSig = builder.sigConst(3, signalType('int'));

    // Compile expression
    const result = compileExpression(
      'a + b',
      new Map([
        ['a', signalType('int')],
        ['b', signalType('int')],
      ]),
      builder,
      new Map([
        ['a', aSig],
        ['b', bSig],
      ])
    );

    if (!result.ok) {
      console.error('Compilation failed:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sigExpr = builder['sigExprs'][result.value as any];
      expect(sigExpr.kind).toBe('zip'); // Binary ops use zip
    }
  });

  it('compiles function call', () => {
    // Create input signal
    const xSig = builder.sigConst(0, signalType('float'));

    // Compile expression
    const result = compileExpression(
      'sin(x)',
      new Map([['x', signalType('float')]]),
      builder,
      new Map([['x', xSig]])
    );

    if (!result.ok) {
      console.error('Compilation failed:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sigExpr = builder['sigExprs'][result.value as any];
      expect(sigExpr.kind).toBe('map'); // Functions use map
    }
  });

  it('returns error for syntax error', () => {
    const result = compileExpression(
      'x +',
      new Map([['x', signalType('int')]]),
      builder,
      new Map([['x', builder.sigConst(1, signalType('int'))]])
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ExprSyntaxError');
    }
  });

  it('returns error for type error', () => {
    // bool + bool is not allowed - arithmetic requires numeric types
    const result = compileExpression(
      'x + y',
      new Map([
        ['x', signalType('bool')],
        ['y', signalType('bool')],
      ]),
      builder,
      new Map([
        ['x', builder.sigConst(0, signalType('bool'))],
        ['y', builder.sigConst(0, signalType('bool'))],
      ])
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ExprTypeError');
    }
  });

  it('returns error for undefined identifier', () => {
    const result = compileExpression(
      'foo',
      new Map(), // No inputs defined
      builder,
      new Map()
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ExprTypeError'); // Type checker catches undefined identifiers
    }
  });
});
