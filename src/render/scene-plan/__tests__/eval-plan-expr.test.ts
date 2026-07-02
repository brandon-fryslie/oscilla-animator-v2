/**
 * Behavioral tests for the backend-neutral numeric PlanExpr interpreter.
 *
 * This is the CPU sibling of the TSL translator: it advances renderer-owned state
 * each frame. What matters is that its operator semantics MATCH the GPU ones
 * (so a state's value is the same whether the renderer reads it or a test does),
 * that it resolves the two non-local leaves (`input`, `state`) from context, and
 * that it fails loudly on a missing binding or an operator with no scalar meaning.
 */

import { describe, it, expect } from 'vitest';

import {
  add,
  cos,
  div,
  evalPlanExpr,
  floor,
  fract,
  hash,
  input,
  intrinsic,
  konst,
  max,
  min,
  mod,
  mul,
  negate,
  sin,
  state,
  stateRef,
  step,
  sub,
  type PlanEvalContext,
} from '../index';

const acc = stateRef('s:acc');
const ctx: PlanEvalContext = { channels: { time: 3 }, states: { [acc]: 5 } };

describe('evalPlanExpr', () => {
  it('resolves the leaf kinds from context', () => {
    expect(evalPlanExpr(konst(2.5), ctx)).toBe(2.5);
    expect(evalPlanExpr(input('time'), ctx)).toBe(3);
    expect(evalPlanExpr(state(acc), ctx)).toBe(5);
  });

  it('treats a cell value of 0 as present, not missing', () => {
    const zeroed: PlanEvalContext = { channels: {}, states: { [acc]: 0 } };
    expect(evalPlanExpr(state(acc), zeroed)).toBe(0);
  });

  it('matches the GPU unary op semantics', () => {
    expect(evalPlanExpr(floor(konst(2.7)), ctx)).toBe(2);
    expect(evalPlanExpr(sin(konst(0)), ctx)).toBe(0);
    expect(evalPlanExpr(cos(konst(0)), ctx)).toBe(1);
    expect(evalPlanExpr(negate(konst(3)), ctx)).toBe(-3);
    expect(evalPlanExpr(fract(konst(2.25)), ctx)).toBeCloseTo(0.25, 10);
  });

  it('matches the GPU binary op semantics', () => {
    expect(evalPlanExpr(add(konst(1), konst(2)), ctx)).toBe(3);
    expect(evalPlanExpr(sub(konst(5), konst(2)), ctx)).toBe(3);
    expect(evalPlanExpr(mul(konst(4), konst(3)), ctx)).toBe(12);
    expect(evalPlanExpr(div(konst(9), konst(2)), ctx)).toBe(4.5);
    expect(evalPlanExpr(min(konst(1), konst(2)), ctx)).toBe(1);
    expect(evalPlanExpr(max(konst(1), konst(2)), ctx)).toBe(2);
    // step(edge, x): 1 when x >= edge, else 0.
    expect(evalPlanExpr(step(konst(0.5), konst(0.7)), ctx)).toBe(1);
    expect(evalPlanExpr(step(konst(0.5), konst(0.3)), ctx)).toBe(0);
  });

  it('uses GLSL mod (not JS %) so it agrees with the GPU on negatives', () => {
    // GLSL mod(-1, 3) = -1 - 3*floor(-1/3) = 2, where JS -1 % 3 = -1.
    expect(evalPlanExpr(mod(konst(-1), konst(3)), ctx)).toBe(2);
  });

  it('evaluates an accumulator recurrence next = prev + increment', () => {
    // The exact rule the Accumulator block contributes.
    const next = add(state(acc), konst(0.01));
    expect(evalPlanExpr(next, ctx)).toBeCloseTo(5.01, 10);
  });

  it('throws loudly on a missing input channel', () => {
    expect(() => evalPlanExpr(input('mouseX'), ctx)).toThrow(/input channel 'mouseX'/);
  });

  it('throws loudly on a missing state cell', () => {
    expect(() => evalPlanExpr(state(stateRef('s:missing')), ctx)).toThrow(/state.*'s:missing'/);
  });

  it('rejects a per-instance intrinsic in a scalar state rule', () => {
    // [LAW:no-silent-failure] index/rank have no scalar meaning; loud, not 0.
    expect(() => evalPlanExpr(intrinsic('index'), ctx)).toThrow(/intrinsic 'index'/);
  });

  it('rejects hash, whose definition lives only in the GPU realization', () => {
    expect(() => evalPlanExpr(hash(konst(1)), ctx)).toThrow(/hash/);
  });
});
