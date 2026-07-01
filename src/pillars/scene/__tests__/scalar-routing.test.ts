/**
 * Tests for scalar-valued ports + scalar edge routing (oscilla-pillars-scene-nt56.25).
 *
 * A modifier's routable *knob* reads a scalar `PlanExpr` — a wired scalar source's
 * value, or the synthesized config default when unwired. These pin the behavior
 * the substrate rests on: the routed value replaces the default in the compiled
 * plan, an unwired knob equals routing its own config constant, and a knob wired
 * to a non-scalar source is a loud error.
 *
 * [LAW:behavior-not-structure] Assertions target what the plan *means* — which
 *   constants and inputs the amplitude expression reads — not the exact tree shape.
 */

import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import { makeScalarRoutePatch } from '../../fixtures/scalar-route';
import { sceneObjectRef, type PlanExpr, type ScenePlan } from '../../../render/scene-plan';
import type { PillarPatch } from '../../types';

function compileOk(patch: PillarPatch): ScenePlan {
  const result = compileScenePlan(patch);
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok ScenePlan, got errors: ${result.errors.join('; ')}`);
  }
  return result.plan;
}

function compileErr(patch: PillarPatch): readonly string[] {
  const result = compileScenePlan(patch);
  if (result.kind !== 'error') throw new Error('Expected an error ScenePlan, got ok');
  return result.errors;
}

/** The per-instance Y expression of the single draw — where WaveOffset writes. */
function positionY(plan: ScenePlan): PlanExpr {
  return plan.objects[sceneObjectRef('draw')].instancing.transform.positionY;
}

/** Every `const` leaf value anywhere in an expression tree. */
function constLeaves(expr: PlanExpr): number[] {
  switch (expr.kind) {
    case 'const':
      return [expr.value];
    case 'input':
    case 'intrinsic':
      return [];
    case 'unary':
      return constLeaves(expr.arg);
    case 'binary':
      return [...constLeaves(expr.lhs), ...constLeaves(expr.rhs)];
  }
}

/** How many times an expression tree reads the given runtime input channel. */
function countInput(expr: PlanExpr, channel: string): number {
  switch (expr.kind) {
    case 'input':
      return expr.channel === channel ? 1 : 0;
    case 'const':
    case 'intrinsic':
      return 0;
    case 'unary':
      return countInput(expr.arg, channel);
    case 'binary':
      return countInput(expr.lhs, channel) + countInput(expr.rhs, channel);
  }
}

/** A grid → WaveOffset → draw patch, with optional scalar sources + knob edges. */
function wavePatch(sources: PillarPatch['blocks'], knobEdges: PillarPatch['edges']): PillarPatch {
  return {
    blocks: [
      { id: 'grid', kind: 'generator', type: 'InstanceGrid',
        config: { rows: 8, cols: 8, spacing: 0.1, rotationPerIndex: 0, rotationPerTime: 0 } },
      { id: 'wave', kind: 'modifier', type: 'WaveOffset', config: {} },
      { id: 'draw', kind: 'intent', type: 'DrawInstances',
        config: { size: 0.05, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 } },
      ...sources,
    ],
    edges: [
      { id: 'e0', source: 'grid', target: 'wave', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'wave', target: 'draw', inputSlot: 'primary', role: 'primary' },
      ...knobEdges,
    ],
  };
}

describe('scalar routing — a routed Constant drives a modifier knob', () => {
  it('the fixture compiles and the routed value (0.45) appears in the wave amplitude', () => {
    const plan = compileOk(makeScalarRoutePatch());
    // The routed Constant value drives amplitude — it is a const leaf of positionY.
    expect(constLeaves(positionY(plan))).toContain(0.45);
  });

  it('routing replaces the config default: the routed value is present, the default is not', () => {
    const routed = compileOk(
      wavePatch(
        [{ id: 'amp', kind: 'generator', type: 'Constant', config: { value: 0.9 } }],
        [{ id: 'k', source: 'amp', target: 'wave', inputSlot: 'amplitude', role: 'secondary' }],
      ),
    );
    const leaves = constLeaves(positionY(routed));
    expect(leaves).toContain(0.9); // the routed value
    expect(leaves).not.toContain(0.15); // the amplitude knob default is overridden
  });
});

describe('scalar routing — the canonical default source', () => {
  it('an unwired knob equals routing a Constant carrying its config value', () => {
    // Unwired: amplitude falls to its synthesized default source.
    const defaulted = compileOk(wavePatch([], []));
    // Wired to a Constant holding the same default value (0.15).
    const routedDefault = compileOk(
      wavePatch(
        [{ id: 'amp', kind: 'generator', type: 'Constant', config: { value: 0.15 } }],
        [{ id: 'k', source: 'amp', target: 'wave', inputSlot: 'amplitude', role: 'secondary' }],
      ),
    );
    // Same plan: the default source IS a Constant of the config value.
    expect(JSON.stringify(positionY(defaulted))).toEqual(JSON.stringify(positionY(routedDefault)));
  });

  it('an authored config value becomes the default source constant when unwired', () => {
    const plan = compileOk(
      wavePatch(
        [],
        [],
      ),
    );
    // Default amplitude 0.15, frequency 6, speed 2 all appear as const leaves.
    const leaves = constLeaves(positionY(plan));
    expect(leaves).toContain(0.15);
    expect(leaves).toContain(6);
    expect(leaves).toContain(2);
  });
});

describe('scalar routing — a live Time source carries a PlanExpr', () => {
  it('routing Time into the speed knob makes the phase read the live time input twice', () => {
    const defaulted = compileOk(wavePatch([], []));
    const routed = compileOk(
      wavePatch(
        [{ id: 'clock', kind: 'generator', type: 'Time', config: {} }],
        [{ id: 'k', source: 'clock', target: 'wave', inputSlot: 'speed', role: 'secondary' }],
      ),
    );
    // The wave already reads `time` once for its travelling phase. Routing Time
    // into `speed` means the phase reads `time` a second time — the routed value
    // is a live PlanExpr, not a baked number. [LAW:effects-at-boundaries]
    expect(countInput(positionY(routed), 'time')).toBe(
      countInput(positionY(defaulted), 'time') + 1,
    );
  });
});

describe('scalar routing — a knob wired to a non-scalar source is loud', () => {
  it('wiring a bundle source into a scalar knob is a surfaced error', () => {
    const errors = compileErr(
      wavePatch(
        [{ id: 'other', kind: 'generator', type: 'InstanceCount', config: { count: 4 } }],
        [{ id: 'k', source: 'other', target: 'wave', inputSlot: 'amplitude', role: 'secondary' }],
      ),
    );
    expect(errors.join('\n')).toMatch(/not a scalar source/);
  });
});
