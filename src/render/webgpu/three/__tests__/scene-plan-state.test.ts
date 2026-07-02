/**
 * Behavioral tests for renderer-owned stateful-value continuity
 * (oscilla-pillars-scene-nt56.18).
 *
 * A stateful cell (an accumulator's running value) is seeded from init, advanced
 * each frame by its update rule, and carried across a live reinstall. These pin
 * the two halves of the ticket's acceptance:
 *  - an equivalent reinstall does NOT reset the running value (it is carried), and
 *    a non-structural edit (changed init/increment) also carries it;
 *  - a structure-changing edit makes the reseed decision EXPLICITLY and LOUDLY —
 *    the value resets to init and the event is surfaced, never a silent reset.
 *
 * Realization is pure CPU work (no GPU device); advancing state is likewise pure
 * numeric evaluation, so the ramp and its continuity are fully testable here.
 */

import { uniform } from 'three/tsl';
import { afterEach, describe, it, expect, vi } from 'vitest';

import {
  SCENE_PLAN_VERSION,
  add,
  defineScenePlan,
  geometryRef,
  konst,
  materialRef,
  sceneObjectRef,
  state,
  stateRef,
  type ScenePlan,
} from '../../../scene-plan';
import { realizeScenePlan, reconcileScenePlan, type RealizedScene } from '../scene-plan-realizer';

const acc = stateRef('s:acc');

/**
 * A grid whose per-instance rotation reads an accumulator cell, so the state is
 * referenced by a draw (the realizer must resolve its `state` leaf). The cell
 * advances by `increment` each frame from `init`.
 */
function buildStatePlan(opts?: { init?: number; increment?: number }): ScenePlan {
  const init = opts?.init ?? 0;
  const increment = opts?.increment ?? 0.1;
  const square = geometryRef('s:square');
  const unlit = materialRef('s:unlit');
  const obj = sceneObjectRef('s:obj');
  return defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: {
      geometries: { [square]: { kind: 'rectangle', width: 0.1, height: 0.1 } },
      materials: { [unlit]: { kind: 'unlitColor', color: { space: 'rgb', r: konst(1), g: konst(0), b: konst(0) } } },
      textures: {},
      computeResources: {},
      postChains: {},
      states: { [acc]: { cardinality: { kind: 'scalar' }, init, update: add(state(acc), konst(increment)) } },
    },
    objects: {
      [obj]: {
        geometry: square,
        material: unlit,
        instancing: { count: 4, transform: { positionX: konst(0), positionY: konst(0), rotation: state(acc) } },
      },
    },
    render: {
      camera: { kind: 'orthographic', halfExtentX: 0.6, halfExtentY: 0.6 },
      inputs: [],
      draws: [{ target: 'previewCanvas', object: obj }],
      postChain: null,
    },
  });
}

function cellValue(realized: RealizedScene): number {
  const cell = realized.states.get(acc);
  if (!cell) throw new Error('expected an accumulator cell');
  return cell.uniform.value as number;
}

describe('ScenePlan stateful-value continuity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('seeds the cell from init on a fresh install', () => {
    const realized = realizeScenePlan(buildStatePlan({ init: 2 }));
    expect(cellValue(realized)).toBe(2);
  });

  it('advances the cell by its increment each frame (depends on prior frames)', () => {
    const realized = realizeScenePlan(buildStatePlan({ init: 0, increment: 0.1 }));
    realized.advanceStates({});
    realized.advanceStates({});
    realized.advanceStates({});
    expect(cellValue(realized)).toBeCloseTo(0.3, 10);
  });

  it('carries the running value across an equivalent reinstall (no reset)', () => {
    const plan = buildStatePlan({ init: 0, increment: 0.1 });
    const first = realizeScenePlan(plan);
    first.advanceStates({});
    first.advanceStates({}); // value now 0.2
    const reinstalled = reconcileScenePlan(first, plan);
    // [acceptance] the accumulation is not reset by the hot-swap.
    expect(cellValue(reinstalled)).toBeCloseTo(0.2, 10);
  });

  it('carries the value across a non-structural edit (changed init/increment)', () => {
    const first = realizeScenePlan(buildStatePlan({ init: 0, increment: 0.1 }));
    first.advanceStates({});
    first.advanceStates({}); // value now 0.2
    // A new plan with a different init AND increment — neither is structural, so the
    // running value survives; the new increment takes effect on the next step.
    const edited = reconcileScenePlan(first, buildStatePlan({ init: 999, increment: 0.5 }));
    expect(cellValue(edited)).toBeCloseTo(0.2, 10); // init 999 was NOT applied
    edited.advanceStates({});
    expect(cellValue(edited)).toBeCloseTo(0.7, 10); // advanced by the new 0.5
  });

  it('reseeds LOUDLY when the cell structure changes (never a silent reset)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plan = buildStatePlan({ init: 0, increment: 0.1 });
    const first = realizeScenePlan(plan);
    first.advanceStates({});
    first.advanceStates({}); // value now 0.2

    // Simulate a prior install whose cell had a *different structure* (a per-instance
    // fingerprint) — the structure-changing edit scalar authoring cannot yet produce.
    // Reconciling the scalar plan against it must not carry the incompatible value.
    const stale: RealizedScene = {
      ...first,
      states: new Map([
        [acc, { uniform: uniform(0.2), fingerprint: '{"kind":"perInstance","count":8}', update: add(state(acc), konst(0.1)) }],
      ]),
    };
    const reseeded = reconcileScenePlan(stale, plan);

    // [acceptance] the decision is explicit: reset to init, and surfaced loudly.
    expect(cellValue(reseeded)).toBe(0); // reseeded from init, not carried as 0.2
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/reseeded from init/));
  });
});
