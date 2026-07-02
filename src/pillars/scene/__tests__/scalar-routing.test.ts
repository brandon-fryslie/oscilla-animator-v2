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
    default:
      return assertNever(expr);
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
    default:
      return assertNever(expr);
  }
}

/** Every binary operator used anywhere in an expression tree. */
function binaryOps(expr: PlanExpr): string[] {
  switch (expr.kind) {
    case 'const':
    case 'input':
    case 'intrinsic':
      return [];
    case 'unary':
      return binaryOps(expr.arg);
    case 'binary':
      return [expr.op, ...binaryOps(expr.lhs), ...binaryOps(expr.rhs)];
    default:
      return assertNever(expr);
  }
}

/**
 * Exhaustiveness guard mirroring the production consumers (inputs.ts, assemble.ts):
 * a new PlanExpr kind is a compile error here, never a silently-empty walk that
 * lets an assertion pass when it should fail. [LAW:no-silent-failure]
 */
function assertNever(value: never): never {
  throw new Error(`unhandled PlanExpr kind: ${JSON.stringify(value)}`);
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

/**
 * A scalar modifier (Scale/Offset/Clamp) on the route between a source and a knob.
 * The route `Constant → <transform> → knob` must FOLD: resolution walks the chain
 * back to the source and applies each transform, exactly as `resolveBundle` folds
 * an instance-modifier chain. These pin the transform math into the compiled plan.
 *
 * The transform block's ports are `in` (scalar) / `out` (scalar); the edge from
 * the source feeds `in`, and the edge into the knob comes from the block (its sole
 * output). Both are scalar edges → role 'secondary'.
 */
function routedKnobPatch(chain: PillarPatch['blocks'], chainEdges: PillarPatch['edges']): PillarPatch {
  return wavePatch(
    [{ id: 'amp', kind: 'generator', type: 'Constant', config: { value: 0.5 } }, ...chain],
    chainEdges,
  );
}

describe('scalar routing — a scalar modifier folds onto the route', () => {
  it('Constant → Scale → knob multiplies the routed value by the factor', () => {
    // 0.5 (Constant) scaled by 3 → the plan reads 0.5 and 3 as leaves of a `mul`.
    const plan = compileOk(
      routedKnobPatch(
        [{ id: 'sc', kind: 'modifier', type: 'Scale', config: { factor: 3 } }],
        [
          { id: 'a', source: 'amp', target: 'sc', inputSlot: 'in', role: 'secondary' },
          { id: 'b', source: 'sc', target: 'wave', inputSlot: 'amplitude', role: 'secondary' },
        ],
      ),
    );
    const leaves = constLeaves(positionY(plan));
    expect(leaves).toContain(0.5); // the source value
    expect(leaves).toContain(3); // the scale factor
    expect(leaves).not.toContain(0.15); // the knob default is overridden by the route
  });

  it('Constant → Offset → knob adds the amount to the routed value', () => {
    const plan = compileOk(
      routedKnobPatch(
        [{ id: 'of', kind: 'modifier', type: 'Offset', config: { amount: 0.25 } }],
        [
          { id: 'a', source: 'amp', target: 'of', inputSlot: 'in', role: 'secondary' },
          { id: 'b', source: 'of', target: 'wave', inputSlot: 'amplitude', role: 'secondary' },
        ],
      ),
    );
    const leaves = constLeaves(positionY(plan));
    expect(leaves).toContain(0.5);
    expect(leaves).toContain(0.25);
  });

  it('Constant → Clamp → knob composes into min/max bounds on the routed value', () => {
    const plan = compileOk(
      routedKnobPatch(
        [{ id: 'cl', kind: 'modifier', type: 'Clamp', config: { lo: 0.1, hi: 0.9 } }],
        [
          { id: 'a', source: 'amp', target: 'cl', inputSlot: 'in', role: 'secondary' },
          { id: 'b', source: 'cl', target: 'wave', inputSlot: 'amplitude', role: 'secondary' },
        ],
      ),
    );
    const leaves = constLeaves(positionY(plan));
    // clamp(x, lo, hi) === max(lo, min(hi, x)) — both bounds appear as leaves.
    expect(leaves).toContain(0.1);
    expect(leaves).toContain(0.9);
    expect(binaryOps(positionY(plan))).toEqual(expect.arrayContaining(['min', 'max']));
  });

  it('chains fold in order: Constant → Scale → Offset → knob is offset(scale(value))', () => {
    const plan = compileOk(
      routedKnobPatch(
        [
          { id: 'sc', kind: 'modifier', type: 'Scale', config: { factor: 2 } },
          { id: 'of', kind: 'modifier', type: 'Offset', config: { amount: 0.1 } },
        ],
        [
          { id: 'a', source: 'amp', target: 'sc', inputSlot: 'in', role: 'secondary' },
          { id: 'b', source: 'sc', target: 'of', inputSlot: 'in', role: 'secondary' },
          { id: 'c', source: 'of', target: 'wave', inputSlot: 'amplitude', role: 'secondary' },
        ],
      ),
    );
    const leaves = constLeaves(positionY(plan));
    expect(leaves).toEqual(expect.arrayContaining([0.5, 2, 0.1]));
  });

  it('a live Time source folds through a Scale: the scaled clock still reads time', () => {
    const defaulted = compileOk(wavePatch([], []));
    const routed = compileOk(
      wavePatch(
        [
          { id: 'clock', kind: 'generator', type: 'Time', config: {} },
          { id: 'sc', kind: 'modifier', type: 'Scale', config: { factor: 4 } },
        ],
        [
          { id: 'a', source: 'clock', target: 'sc', inputSlot: 'in', role: 'secondary' },
          { id: 'b', source: 'sc', target: 'wave', inputSlot: 'speed', role: 'secondary' },
        ],
      ),
    );
    // The transform preserves the live input: the folded expr still reads `time`.
    expect(countInput(positionY(routed), 'time')).toBe(
      countInput(positionY(defaulted), 'time') + 1,
    );
  });

  it('Clamp rejects an inverted range (lo > hi) with a loud diagnostic, not a dead constant', () => {
    const errors = compileErr(
      routedKnobPatch(
        [{ id: 'cl', kind: 'modifier', type: 'Clamp', config: { lo: 0.9, hi: 0.1 } }],
        [
          { id: 'a', source: 'amp', target: 'cl', inputSlot: 'in', role: 'secondary' },
          { id: 'b', source: 'cl', target: 'wave', inputSlot: 'amplitude', role: 'secondary' },
        ],
      ),
    );
    // Surfaced at config-parse time — never silently compiled to `max(0.9, …) = 0.9`.
    expect(errors.join('\n')).toMatch(/Min .* must be .* Max/);
  });

  it('a scalar modifier with no input edge is a surfaced error, not a silent drop', () => {
    const errors = compileErr(
      routedKnobPatch(
        [{ id: 'sc', kind: 'modifier', type: 'Scale', config: { factor: 3 } }],
        // `sc.in` is left unwired; only the output edge into the knob exists.
        [{ id: 'b', source: 'sc', target: 'wave', inputSlot: 'amplitude', role: 'secondary' }],
      ),
    );
    expect(errors.join('\n')).toMatch(/no input edge/);
  });
});
