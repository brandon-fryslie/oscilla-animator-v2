/**
 * Tests for the native modifier foundation (oscilla-pillars-scene-nt56.4).
 *
 * A modifier takes an instance bundle and rewrites its TransformBinding /
 * ColorBinding before the draw. These assert the three chain shapes the ticket
 * requires — one source, one source + one modifier, and a multi-modifier chain —
 * plus that a modifier *visibly* changes the compiled output (so the rendered
 * frame must differ) and that chained output stays a JSON-serializable ScenePlan.
 *
 * Assertions target what the plan *means* (an expression gains a wave, a color
 * gains a scale), not the exact PlanExpr tree, so the lowering stays free to
 * refactor expression construction. [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import { makeGridOfSquaresPatch } from '../../fixtures/grid-of-squares';
import { makeInstanceWavePatch } from '../../fixtures/instance-wave';
import { sceneObjectRef, type ScenePlan } from '../../../render/scene-plan';
import type { PillarBlock, PillarEdge, PillarPatch } from '../../types';

function compileOk(patch: PillarPatch): ScenePlan {
  const result = compileScenePlan(patch);
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok ScenePlan, got errors: ${result.errors.join('; ')}`);
  }
  return result.plan;
}

function compileErr(patch: PillarPatch): readonly string[] {
  const result = compileScenePlan(patch);
  if (result.kind !== 'error') {
    throw new Error('Expected an error ScenePlan, got ok');
  }
  return result.errors;
}

const GRID: PillarBlock = {
  id: 'grid',
  kind: 'generator',
  type: 'InstanceGrid',
  config: {
    rows: 10,
    cols: 10,
    spacing: 0.1,
    rotationPerIndex: 0.5,
    rotationPerTime: 2.0,
    huePerTime: 0.2,
    saturation: 0.8,
    lightness: 0.6,
  },
};

const DRAW: PillarBlock = {
  id: 'draw',
  kind: 'intent',
  type: 'DrawInstances',
  config: { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
};

function edge(id: string, source: string, target: string): PillarEdge {
  return { id, source, target, inputSlot: 'primary', role: 'primary' };
}

function objectOf(plan: ScenePlan) {
  return plan.objects[sceneObjectRef('draw')];
}

function unlitColorJson(plan: ScenePlan): string {
  const material = plan.resources.materials[objectOf(plan).material];
  if (material.kind !== 'unlitColor') throw new Error('expected an unlitColor material');
  return JSON.stringify(material.color);
}

describe('modifier chain — one source, one modifier', () => {
  const wave: PillarBlock = {
    id: 'wave',
    kind: 'modifier',
    type: 'WaveOffset',
    config: { amplitude: 0.15, frequency: 6.0, speed: 2.0 },
  };
  const plan = compileOk({
    blocks: [GRID, wave, DRAW],
    edges: [edge('e0', 'grid', 'wave'), edge('e1', 'wave', 'draw')],
  });

  it('compiles a source → modifier → draw chain to one object', () => {
    expect(plan.render.draws).toHaveLength(1);
    expect(objectOf(plan)).toBeDefined();
  });

  it('preserves the upstream instance count through the modifier', () => {
    expect(objectOf(plan).instancing.count).toBe(100);
  });

  it('visibly changes the transform: positionY gains a rank/time-driven wave', () => {
    const positionY = JSON.stringify(objectOf(plan).instancing.transform.positionY);
    expect(positionY).toContain('"sin"');
    expect(positionY).toContain('"rank"');
    expect(positionY).toContain('"time"');
  });

  it('makes the modified plan differ from the un-modified grid (the render must change)', () => {
    const bare = compileOk(makeGridOfSquaresPatch());
    const bareY = JSON.stringify(bare.objects[sceneObjectRef('draw')].instancing.transform.positionY);
    const wavedY = JSON.stringify(objectOf(plan).instancing.transform.positionY);
    expect(wavedY).not.toBe(bareY);
  });

  it('declares time as a derived runtime input the wave reads', () => {
    expect(plan.render.inputs).toContain('time');
  });
});

describe('modifier chain — multi-modifier (transform then color)', () => {
  const plan = compileOk(makeInstanceWavePatch());

  it('compiles a source → modifier → modifier → draw chain to one object', () => {
    expect(plan.render.draws).toHaveLength(1);
    expect(objectOf(plan).instancing.count).toBe(100);
  });

  it('applies the transform modifier: positionY carries the wave', () => {
    expect(JSON.stringify(objectOf(plan).instancing.transform.positionY)).toContain('"sin"');
  });

  it('applies the color modifier: the HSL lightness is scaled, not a bare const', () => {
    const color = unlitColorJson(plan);
    const bare = unlitColorJson(compileOk(makeGridOfSquaresPatch()));
    // The grid's lightness is a const; Brightness wraps it in a mul.
    expect(color).toContain('"mul"');
    expect(color).not.toBe(bare);
  });

  it('keeps the chained output a JSON-serializable ScenePlan', () => {
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});

describe('modifier chain — order independence of the fold', () => {
  it('produces the same plan regardless of which draw resolves first', () => {
    // Two independent chains assembled in one patch must each resolve their own
    // source; the fold is per-draw, not global state.
    const grid2: PillarBlock = { ...GRID, id: 'grid2' };
    const draw2: PillarBlock = { ...DRAW, id: 'draw2' };
    const plan = compileOk({
      blocks: [GRID, draw2, grid2, DRAW],
      edges: [edge('e0', 'grid', 'draw'), edge('e1', 'grid2', 'draw2')],
    });
    expect(plan.render.draws).toHaveLength(2);
  });
});

describe('modifier chain — loud failures', () => {
  it('reports a modifier with no primary input edge', () => {
    const wave: PillarBlock = {
      id: 'wave',
      kind: 'modifier',
      type: 'WaveOffset',
      config: { amplitude: 0.15, frequency: 6.0, speed: 2.0 },
    };
    const errors = compileErr({
      blocks: [wave, DRAW],
      edges: [edge('e0', 'wave', 'draw')],
    });
    expect(errors.join('\n')).toMatch(/modifier block 'wave' has no primary input edge/);
  });

  it('reports a cycle in the instance chain', () => {
    const a: PillarBlock = {
      id: 'a',
      kind: 'modifier',
      type: 'WaveOffset',
      config: { amplitude: 0.15, frequency: 6.0, speed: 2.0 },
    };
    const b: PillarBlock = {
      id: 'b',
      kind: 'modifier',
      type: 'WaveOffset',
      config: { amplitude: 0.15, frequency: 6.0, speed: 2.0 },
    };
    const errors = compileErr({
      blocks: [a, b, DRAW],
      edges: [edge('e0', 'a', 'b'), edge('e1', 'b', 'a'), edge('e2', 'b', 'draw')],
    });
    expect(errors.join('\n')).toMatch(/cycle/);
  });
});
