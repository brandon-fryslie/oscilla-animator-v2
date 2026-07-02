/**
 * Behavioral tests for the PlanExpr → TSL translator.
 *
 * The translator's exhaustiveness over `PlanExpr.kind` and the operator unions
 * is enforced at COMPILE time by the typed lookup tables and the `assertNever`
 * default — it cannot be asserted at runtime. What these tests pin is the
 * runtime contract that the type cannot: every expr kind produces a node, and a
 * plan that reads an undeclared input channel fails loudly rather than
 * defaulting silently.
 */

import { uniform } from 'three/tsl';
import { describe, it, expect } from 'vitest';

import { add, cos, fract, hash, intrinsic, konst, input, mod, mul, state, stateRef } from '../../../scene-plan';
import { planExprToTSL, type PlanExprContext, type TSLNode } from '../plan-expr-tsl';

const acc = stateRef('s:acc');
const ctx: PlanExprContext = {
  instanceCount: 16,
  inputs: { time: uniform(0, 'float') as unknown as TSLNode },
  states: { [acc]: uniform(0, 'float') as unknown as TSLNode },
};

describe('planExprToTSL', () => {
  it('produces a node for every PlanExpr kind', () => {
    expect(planExprToTSL(konst(1), ctx)).toBeDefined(); // const
    expect(planExprToTSL(input('time'), ctx)).toBeDefined(); // input
    expect(planExprToTSL(state(acc), ctx)).toBeDefined(); // state
    expect(planExprToTSL(intrinsic('index'), ctx)).toBeDefined(); // intrinsic index
    expect(planExprToTSL(intrinsic('rank'), ctx)).toBeDefined(); // intrinsic rank
    expect(planExprToTSL(cos(konst(0.5)), ctx)).toBeDefined(); // unary
    expect(planExprToTSL(fract(mul(intrinsic('rank'), konst(3))), ctx)).toBeDefined(); // unary fract
    expect(planExprToTSL(hash(intrinsic('index')), ctx)).toBeDefined(); // unary hash (pseudo-random)
    expect(planExprToTSL(add(konst(1), konst(2)), ctx)).toBeDefined(); // binary
    expect(planExprToTSL(mod(intrinsic('index'), konst(10)), ctx)).toBeDefined();
    expect(planExprToTSL(mul(intrinsic('rank'), input('time')), ctx)).toBeDefined();
  });

  it('throws when an expression reads an input channel the context did not declare', () => {
    // [LAW:no-silent-failure] An undeclared channel is a contract break, not a
    //   zero default.
    expect(() => planExprToTSL(input('mouseX'), ctx)).toThrow(/input channel 'mouseX'/);
  });

  it('throws when an expression reads a state cell the context did not declare', () => {
    // [LAW:no-silent-failure] A `state` leaf naming an undeclared cell is a
    //   contract break, not a zero default.
    expect(() => planExprToTSL(state(stateRef('s:missing')), ctx)).toThrow(/state cell 's:missing'/);
  });
});
