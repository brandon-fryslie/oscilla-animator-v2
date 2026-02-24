/**
 * Tests for construct() expression evaluation in single-instance context
 *
 * Validates WI-0: Runtime stride support for single-instance slots
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateConstructScalar, evaluateValueExprScalar } from '../ValueExprScalarEvaluator';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import type { ValueExprId } from '../../compiler/ir/Indices';
import { floatConst, canonicalScalar } from '../../core/canonical-types';

describe('construct one-cardinality evaluation', () => {
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
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
      // [1] const(2.5)
      {
        kind: 'const',
        value: floatConst(2.5),
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
      // [2] construct([0, 1])
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId],
        type: canonicalScalar({ kind: 'vec2' }, { kind: 'none' }),
      },
    ];

    const constructExpr = valueExprs[2] as Extract<ValueExpr, { kind: 'construct' }>;
    const targetBuffer = new Float32Array(10);
    const targetOffset = 3;

    const written = evaluateConstructScalar(constructExpr, valueExprs, state, targetBuffer, targetOffset);

    expect(written).toBe(2);
    expect(targetBuffer[3]).toBe(1.5);
    expect(targetBuffer[4]).toBe(2.5);
  });

  it('evaluates color construct into contiguous buffer', () => {
    // Build ValueExpr nodes: construct([const(0.1), const(0.2), const(0.3), const(1.0)])
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(0.1), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(0.2), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(0.3), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(1.0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
        type: canonicalScalar({ kind: 'color' }, { kind: 'none' }),
      },
    ];

    const constructExpr = valueExprs[4] as Extract<ValueExpr, { kind: 'construct' }>;
    const targetBuffer = new Float32Array(10);
    const targetOffset = 0;

    const written = evaluateConstructScalar(constructExpr, valueExprs, state, targetBuffer, targetOffset);

    expect(written).toBe(4);
    expect(targetBuffer[0]).toBeCloseTo(0.1, 6);
    expect(targetBuffer[1]).toBeCloseTo(0.2, 6);
    expect(targetBuffer[2]).toBeCloseTo(0.3, 6);
    expect(targetBuffer[3]).toBeCloseTo(1.0, 6);
  });

  it('evaluates vec3 construct into contiguous buffer', () => {
    // Build ValueExpr nodes: construct([const(10), const(20), const(30)])
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(10), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(20), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(30), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId, 2 as ValueExprId],
        type: canonicalScalar({ kind: 'vec3' }, { kind: 'none' }),
      },
    ];

    const constructExpr = valueExprs[3] as Extract<ValueExpr, { kind: 'construct' }>;
    const targetBuffer = new Float32Array(10);
    const targetOffset = 5;

    const written = evaluateConstructScalar(constructExpr, valueExprs, state, targetBuffer, targetOffset);

    expect(written).toBe(3);
    expect(targetBuffer[5]).toBe(10);
    expect(targetBuffer[6]).toBe(20);
    expect(targetBuffer[7]).toBe(30);
  });

  it('returns first component when construct is evaluated recursively', () => {
    // Build ValueExpr nodes
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(42), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(99), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId],
        type: canonicalScalar({ kind: 'vec2' }, { kind: 'none' }),
      },
    ];

    // Evaluate construct recursively (not as a step root)
    const value = evaluateValueExprScalar(2 as ValueExprId, valueExprs, state);

    // Should return first component
    expect(value).toBe(42);
  });

  it('ensures single-instance scalars still work (no regression)', () => {
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(3.14), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
    ];

    const value = evaluateValueExprScalar(0 as ValueExprId, valueExprs, state);

    expect(value).toBe(3.14);
  });

  it('throws when shapeRef is evaluated through scalar path', () => {
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
        topologyId: 0 as any,
        paramArgs: [],
      },
    ];

    expect(() => evaluateValueExprScalar(0 as ValueExprId, valueExprs, state)).toThrow(
      /not scalar-evaluable/
    );
  });
});

describe('extract one-cardinality evaluation', () => {
  let state: RuntimeState;

  beforeEach(() => {
    state = createRuntimeState(64, 64, 8, 0, 0, 64);
    state.cache.frameId = 1;
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

  it('reads component from arena slot via scalarExprToArenaOffset mapping', () => {
    // Write vec3 values (10, 20, 30) to arena at a known offset
    const offset = 5;
    state.arena[offset + 0] = 10;
    state.arena[offset + 1] = 20;
    state.arena[offset + 2] = 30;

    // Set up scalarExprToArenaOffset: input expression 3 maps to offset 5
    const inputId = 3;
    state.cache.scalarExprToArenaOffset = new Map([[inputId, offset]]);

    // Build extract expressions referencing input 3
    const valueExprs: ValueExpr[] = [
      // [0] placeholder (unused)
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      // [1] placeholder (unused)
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      // [2] placeholder (unused)
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      // [3] construct (the input — never evaluated by extract, just needs to exist in the array)
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId, 2 as ValueExprId],
        type: canonicalScalar({ kind: 'vec3' }, { kind: 'none' }),
      },
      // [4] extract(input=3, component=0)
      {
        kind: 'extract',
        input: inputId as ValueExprId,
        componentIndex: 0,
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
      // [5] extract(input=3, component=1)
      {
        kind: 'extract',
        input: inputId as ValueExprId,
        componentIndex: 1,
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
      // [6] extract(input=3, component=2)
      {
        kind: 'extract',
        input: inputId as ValueExprId,
        componentIndex: 2,
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
    ];

    expect(evaluateValueExprScalar(4 as ValueExprId, valueExprs, state)).toBe(10);
    expect(evaluateValueExprScalar(5 as ValueExprId, valueExprs, state)).toBe(20);
    expect(evaluateValueExprScalar(6 as ValueExprId, valueExprs, state)).toBe(30);
  });

  it('works end-to-end with construct values mirrored to arena', () => {
    // Build construct expression and mirror written values into arena (runtime does this via write-through).
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(100), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(200), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId],
        type: canonicalScalar({ kind: 'vec2' }, { kind: 'none' }),
      },
      // [3] extract(input=2, component=0)
      {
        kind: 'extract',
        input: 2 as ValueExprId,
        componentIndex: 0,
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
      // [4] extract(input=2, component=1)
      {
        kind: 'extract',
        input: 2 as ValueExprId,
        componentIndex: 1,
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
    ];

    // Write construct directly to arena (runtime canonical numeric store).
    const offset = 10;
    const constructExpr = valueExprs[2] as Extract<ValueExpr, { kind: 'construct' }>;
    evaluateConstructScalar(constructExpr, valueExprs, state, state.arena, offset);

    // Set up scalarExprToArenaOffset mapping
    state.cache.scalarExprToArenaOffset = new Map([[2, offset]]);

    expect(evaluateValueExprScalar(3 as ValueExprId, valueExprs, state)).toBe(100);
    expect(evaluateValueExprScalar(4 as ValueExprId, valueExprs, state)).toBe(200);
  });

  it('throws when input has no slot mapping', () => {
    // scalarExprToArenaOffset is null (not populated)
    state.cache.scalarExprToArenaOffset = null;

    const valueExprs: ValueExpr[] = [
      {
        kind: 'extract',
        input: 99 as ValueExprId,
        componentIndex: 0,
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
    ];

    expect(() => evaluateValueExprScalar(0 as ValueExprId, valueExprs, state)).toThrow(
      'not found in ValueExpr table'
    );
  });

  it('throws when slot mapping is unavailable for non-construct input', () => {
    state.cache.scalarExprToArenaOffset = null;

    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'extract',
        input: 0 as ValueExprId,
        componentIndex: 0,
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
    ];

    expect(() => evaluateValueExprScalar(1 as ValueExprId, valueExprs, state)).toThrow(
      'has no slot mapping',
    );
  });

  it('reads all components of vec4/color (stride=4)', () => {
    const offset = 0;
    state.arena[offset + 0] = 0.1;
    state.arena[offset + 1] = 0.2;
    state.arena[offset + 2] = 0.3;
    state.arena[offset + 3] = 1.0;

    const inputId = 4;
    state.cache.scalarExprToArenaOffset = new Map([[inputId, offset]]);

    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      // [4] construct (the input)
      {
        kind: 'construct',
        components: [0 as ValueExprId, 1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
        type: canonicalScalar({ kind: 'color' }, { kind: 'none' }),
      },
      // [5..8] extract components
      { kind: 'extract', input: inputId as ValueExprId, componentIndex: 0, type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'extract', input: inputId as ValueExprId, componentIndex: 1, type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'extract', input: inputId as ValueExprId, componentIndex: 2, type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      { kind: 'extract', input: inputId as ValueExprId, componentIndex: 3, type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
    ];

    expect(evaluateValueExprScalar(5 as ValueExprId, valueExprs, state)).toBeCloseTo(0.1, 6);
    expect(evaluateValueExprScalar(6 as ValueExprId, valueExprs, state)).toBeCloseTo(0.2, 6);
    expect(evaluateValueExprScalar(7 as ValueExprId, valueExprs, state)).toBeCloseTo(0.3, 6);
    expect(evaluateValueExprScalar(8 as ValueExprId, valueExprs, state)).toBeCloseTo(1.0, 6);
  });
});

describe('reduce kernel scalar evaluation', () => {
  let state: RuntimeState;

  beforeEach(() => {
    state = createRuntimeState(16, 16, 4);
    state.cache.frameId = 1;
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

  it('throws for reduce kernel when no scalar evaluation context is provided', () => {
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'kernel',
        kernelKind: 'reduce',
        field: 0 as ValueExprId,
        op: 'sum',
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
    ];

    expect(() => evaluateValueExprScalar(1 as ValueExprId, valueExprs, state)).toThrow(
      'reduce kernels require scalar evaluation context',
    );
  });

  it('uses injected scalar evaluation context for reduce kernels', () => {
    const valueExprs: ValueExpr[] = [
      { kind: 'const', value: floatConst(0), type: canonicalScalar({ kind: 'float' }, { kind: 'none' }) },
      {
        kind: 'kernel',
        kernelKind: 'reduce',
        field: 0 as ValueExprId,
        op: 'avg',
        type: canonicalScalar({ kind: 'float' }, { kind: 'none' }),
      },
    ];

    const value = evaluateValueExprScalar(1 as ValueExprId, valueExprs, state, {
      evaluateReduceKernel: () => 7.25,
    });

    expect(value).toBe(7.25);
  });
});
