/**
 * Expression DSL Integration Tests
 *
 * End-to-end tests for compileExpression() public API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compileExpression } from '../index';
import { signalType } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../../core/canonical-types';
import { IRBuilderImpl } from '../../compiler/ir/IRBuilderImpl';
import { extractSigExpr } from '../../__tests__/ir-test-helpers';

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
      const sigExpr = extractSigExpr(builder, result.value);
      expect(sigExpr?.kind).toBe('const');
      expect((sigExpr as any)?.value).toBe(42);
    }
  });

  it('compiles identifier expression', () => {
    // Create an input signal
    const inputSig = builder.sigConst(10, signalType(INT));

    // Compile expression that references it
    const result = compileExpression(
      'x',
      new Map([['x', signalType(INT)]]),
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
    const aSig = builder.sigConst(5, signalType(INT));
    const bSig = builder.sigConst(3, signalType(INT));

    // Compile expression
    const result = compileExpression(
      'a + b',
      new Map([
        ['a', signalType(INT)],
        ['b', signalType(INT)],
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
      const sigExpr = extractSigExpr(builder, result.value);
      expect(sigExpr?.kind).toBe('zip'); // Binary ops use zip
    }
  });

  it('compiles function call', () => {
    // Create input signal
    const xSig = builder.sigConst(0, signalType(FLOAT));

    // Compile expression
    const result = compileExpression(
      'sin(x)',
      new Map([['x', signalType(FLOAT)]]),
      builder,
      new Map([['x', xSig]])
    );

    if (!result.ok) {
      console.error('Compilation failed:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sigExpr = extractSigExpr(builder, result.value);
      expect(sigExpr?.kind).toBe('map'); // Functions use map
    }
  });

  it('returns error for syntax error', () => {
    const result = compileExpression(
      'x +',
      new Map([['x', signalType(INT)]]),
      builder,
      new Map([['x', builder.sigConst(1, signalType(INT))]])
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
        ['x', signalType(BOOL)],
        ['y', signalType(BOOL)],
      ]),
      builder,
      new Map([
        ['x', builder.sigConst(0, signalType(BOOL))],
        ['y', builder.sigConst(0, signalType(BOOL))],
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
