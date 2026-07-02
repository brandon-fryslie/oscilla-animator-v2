/**
 * Tests for the first stateful scene block (oscilla-pillars-scene-nt56.18).
 *
 * The Accumulator is "just a block": its output is a scalar route like a
 * Constant's, but its contribution also mints a renderer-owned cell and a
 * recurrence. These pin the compile-side behavior: a stateful block mints exactly
 * one state cell whose update is `prev + increment`, its output leaf routes into a
 * downstream knob the same way a Constant would, and a routed `increment` pulls
 * its channel into the update rule (and thus into the plan's declared inputs).
 *
 * [LAW:behavior-not-structure] Assertions target what the plan *means* — the
 *   recurrence's value and where the state leaf lands — not the exact tree shape.
 */

import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import {
  evalPlanExpr,
  sceneObjectRef,
  stateRef,
  type PlanExpr,
  type ScenePlan,
  type StateRef,
} from '../../../render/scene-plan';
import type { PillarPatch } from '../../types';

function compileOk(patch: PillarPatch): ScenePlan {
  const result = compileScenePlan(patch);
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok ScenePlan, got errors: ${result.errors.join('; ')}`);
  }
  return result.plan;
}

/** True when `expr` reads the state cell `ref` anywhere in its tree. */
function readsState(expr: PlanExpr, ref: StateRef): boolean {
  switch (expr.kind) {
    case 'state':
      return expr.ref === ref;
    case 'const':
    case 'input':
    case 'intrinsic':
      return false;
    case 'unary':
      return readsState(expr.arg, ref);
    case 'binary':
      return readsState(expr.lhs, ref) || readsState(expr.rhs, ref);
  }
}

/**
 * A grid whose WaveOffset amplitude is routed from an Accumulator. `incrementFrom`
 * optionally wires a scalar source into the accumulator's own increment knob.
 */
function accumulatorPatch(options?: { incrementFrom?: 'Time' }): PillarPatch {
  const extraBlocks =
    options?.incrementFrom === 'Time'
      ? [{ id: 'clock', kind: 'generator' as const, type: 'Time', config: {} }]
      : [];
  const extraEdges =
    options?.incrementFrom === 'Time'
      ? [{ id: 'e-inc', source: 'clock', target: 'acc', inputSlot: 'increment', role: 'secondary' as const }]
      : [];
  return {
    blocks: [
      {
        id: 'grid',
        kind: 'generator',
        type: 'InstanceGrid',
        config: { rows: 8, cols: 8, spacing: 0.12, rotationPerIndex: 0, rotationPerTime: 0 },
      },
      // The stateful source driving the wave's amplitude.
      { id: 'acc', kind: 'generator', type: 'Accumulator', config: { init: 0 } },
      { id: 'wave', kind: 'modifier', type: 'WaveOffset', config: {} },
      { id: 'color', kind: 'modifier', type: 'SolidColor', config: { color: '#39d0ff' } },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.05, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
      ...extraBlocks,
    ],
    edges: [
      { id: 'e0', source: 'grid', target: 'wave', inputSlot: 'primary', role: 'primary' },
      // The accumulator's output routes into a knob exactly like a Constant would.
      { id: 'e1', source: 'acc', target: 'wave', inputSlot: 'amplitude', role: 'secondary' },
      { id: 'e2', source: 'wave', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e3', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
      ...extraEdges,
    ],
  };
}

const acc = stateRef('acc');

describe('Accumulator (stateful scalar block)', () => {
  it('mints exactly one scalar state cell keyed by the block id', () => {
    const plan = compileOk(accumulatorPatch());
    expect(Object.keys(plan.resources.states)).toEqual([acc]);
    expect(plan.resources.states[acc].cardinality).toEqual({ kind: 'scalar' });
    expect(plan.resources.states[acc].init).toBe(0);
  });

  it("mints the recurrence next = prev + increment (default increment)", () => {
    const plan = compileOk(accumulatorPatch());
    const { update } = plan.resources.states[acc];
    // The update reads its own prior value…
    expect(readsState(update, acc)).toBe(true);
    // …and advances it by the default increment each step.
    const start = 4;
    expect(evalPlanExpr(update, { channels: {}, states: { [acc]: start } })).toBeCloseTo(4.01, 10);
  });

  it("routes its output into a downstream knob like any scalar source", () => {
    const plan = compileOk(accumulatorPatch());
    // WaveOffset writes amplitude into positionY; the accumulator's cell must be
    // what it reads there — the state leaf reached the consuming expression.
    const positionY = plan.objects[sceneObjectRef('draw')].instancing.transform.positionY;
    expect(readsState(positionY, acc)).toBe(true);
  });

  it('pulls a routed increment channel into the update rule and declared inputs', () => {
    const plan = compileOk(accumulatorPatch({ incrementFrom: 'Time' }));
    const { update } = plan.resources.states[acc];
    // increment = input('time'), so the recurrence advances by the current time.
    expect(evalPlanExpr(update, { channels: { time: 2 }, states: { [acc]: 10 } })).toBe(12);
    // The renderer must feed 'time' every frame to advance the cell.
    expect(plan.render.inputs).toContain('time');
  });
});
