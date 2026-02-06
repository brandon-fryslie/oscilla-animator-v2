/**
 * Tests for construct() expression evaluation in signal context
 *
 * Validates WI-0: Runtime stride support for signal slots
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateConstructSignal, evaluateValueExprSignal } from '../ValueExprSignalEvaluator';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import type { ValueExprId } from '../../compiler/ir/Indices';
import { floatConst, canonicalSignal } from '../../core/canonical-types';

describe('construct signal evaluation', () => {
  let state: RuntimeState;

  beforeEach(() => {
    // Create minimal runtime state
    state = createRuntimeState(64, 64, 8);
    state.cache.frameId = 1;
    // Set up minimal time state (required by evaluator)
    state.time = {
      tMs: 0,
      dt: 16.67,
      tAbsMs: 0,
      phaseA: 0,
      phaseB: 0,
      pulse: 0,
      progress: 0,
      palette: new Float32Array([1, 1, 1, 1]),
      energy: 0,
    };
  });

  it('evaluates vec2 construct into contiguous buffer', () => {
    // Build ValueExpr nodes: construct([const(1.5), const(2.5)])
    const valueExprs: ValueExpr[] = [
      // [0] const(1.5)
      {
        kind: 'const',
        value: floatConst(1.5),
        type: canonicalSignal({ kind: 'float' }, { kind: 'none' }),
      },
      // [1] const(2.5)
      {
        kind: 'const',
        value: floatConst(2.5),
        type: canonicalSignal({ kind: 'float' }, { kind: 'none' }),
      },
      // [2] construct([0, 1])
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId],
        type: canonicalSignal({ kind: 'vec2' }, { kind: 'none' }),
      },
    ];

    const constructExpr = valueExprs[2] as Extract<ValueExpr, { kind: 'construct' }>;
    const targetBuffer = new Float64Array(10);
    const targetOffset = 3;

    const written = evaluateConstructSignal(constructExpr, valueExprs, state, targetBuffer, targetOffset);

    expect(written).toBe(2);
    expect(targetBuffer[3]).toBe(1.5);
    expect(targetBuffer[4]).toBe(2.5);
  });

  it('evaluates color construct into contiguous buffer', () => {
    // Build ValueExpr nodes: construct([const(0.1), const(0.2), const(0.3), const(1.0)])
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(0.1), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(0.2), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(0.3), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(1.0), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
        type: canonicalSignal({ kind: 'color' }, { kind: 'none' }),
      },
    ];

    const constructExpr = valueExprs[4] as Extract<ValueExpr, { kind: 'construct' }>;
    const targetBuffer = new Float64Array(10);
    const targetOffset = 0;

    const written = evaluateConstructSignal(constructExpr, valueExprs, state, targetBuffer, targetOffset);

    expect(written).toBe(4);
    expect(targetBuffer[0]).toBe(0.1);
    expect(targetBuffer[1]).toBe(0.2);
    expect(targetBuffer[2]).toBe(0.3);
    expect(targetBuffer[3]).toBe(1.0);
  });

  it('evaluates vec3 construct into contiguous buffer', () => {
    // Build ValueExpr nodes: construct([const(10), const(20), const(30)])
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(10), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(20), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(30), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId, 2 as ValueExprId],
        type: canonicalSignal({ kind: 'vec3' }, { kind: 'none' }),
      },
    ];

    const constructExpr = valueExprs[3] as Extract<ValueExpr, { kind: 'construct' }>;
    const targetBuffer = new Float64Array(10);
    const targetOffset = 5;

    const written = evaluateConstructSignal(constructExpr, valueExprs, state, targetBuffer, targetOffset);

    expect(written).toBe(3);
    expect(targetBuffer[5]).toBe(10);
    expect(targetBuffer[6]).toBe(20);
    expect(targetBuffer[7]).toBe(30);
  });

  it('returns first component when construct is evaluated recursively', () => {
    // Build ValueExpr nodes
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(42), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(99), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId],
        type: canonicalSignal({ kind: 'vec2' }, { kind: 'none' }),
      },
    ];

    // Evaluate construct recursively (not as a step root)
    const value = evaluateValueExprSignal(2 as ValueExprId, valueExprs, state);

    // Should return first component
    expect(value).toBe(42);
  });

  it('ensures scalar signals still work (no regression)', () => {
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(3.14), type: canonicalSignal({ kind: 'float' }, { kind: 'none' }) },
    ];

    const value = evaluateValueExprSignal(0 as ValueExprId, valueExprs, state);

    expect(value).toBe(3.14);
  });
});
