/**
 * Tests for the Scatter layout modifier (oscilla-pillars-scene-nt56.23).
 *
 * Scatter places each instance pseudo-randomly within a rectangle by hashing its
 * integer `index`. These assert it composes onto a *bare* `InstanceCount` exactly
 * like the other layout modifiers — count preserved, placement folded onto the
 * upstream transform — and that it visibly changes the compiled plan (the render
 * must differ from the un-scattered source, and a different `seed` is a different
 * plan).
 *
 * Assertions target what the plan *means* (the position gains a hash-of-index
 * offset), not the exact PlanExpr tree, so the lowering stays free to refactor
 * expression construction. [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import { sceneObjectRef, type ScenePlan } from '../../../render/scene-plan';
import type { PillarBlock, PillarEdge, PillarPatch } from '../../types';

function compileOk(patch: PillarPatch): ScenePlan {
  const result = compileScenePlan(patch);
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok ScenePlan, got errors: ${result.errors.join('; ')}`);
  }
  return result.plan;
}

const COUNT: PillarBlock = {
  id: 'count',
  kind: 'generator',
  type: 'InstanceCount',
  config: { count: 64 },
};

const DRAW: PillarBlock = {
  id: 'draw',
  kind: 'intent',
  type: 'DrawInstances',
  config: { size: 0.04, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
};

function scatter(seed: number): PillarBlock {
  return {
    id: 'scatter',
    kind: 'modifier',
    type: 'Scatter',
    config: { width: 1.0, height: 1.0, seed },
  };
}

function edge(id: string, source: string, target: string): PillarEdge {
  return { id, source, target, inputSlot: 'primary', role: 'primary' };
}

function scatterChain(seed: number): ScenePlan {
  return compileOk({
    blocks: [COUNT, scatter(seed), DRAW],
    edges: [edge('e0', 'count', 'scatter'), edge('e1', 'scatter', 'draw')],
  });
}

function objectOf(plan: ScenePlan) {
  return plan.objects[sceneObjectRef('draw')];
}

describe('Scatter modifier — composes onto a bare InstanceCount', () => {
  const plan = scatterChain(0);

  it('compiles a count → scatter → draw chain to one object', () => {
    expect(plan.render.draws).toHaveLength(1);
    expect(objectOf(plan)).toBeDefined();
  });

  it('preserves the upstream instance count', () => {
    expect(objectOf(plan).instancing.count).toBe(64);
  });

  it('places each instance by a pseudo-random hash of its integer index', () => {
    const x = JSON.stringify(objectOf(plan).instancing.transform.positionX);
    const y = JSON.stringify(objectOf(plan).instancing.transform.positionY);
    for (const axis of [x, y]) {
      expect(axis).toContain('"hash"');
      expect(axis).toContain('"index"');
    }
  });

  it('reads decorrelated streams: X and Y are not the identical expression', () => {
    const x = JSON.stringify(objectOf(plan).instancing.transform.positionX);
    const y = JSON.stringify(objectOf(plan).instancing.transform.positionY);
    expect(x).not.toBe(y);
  });

  it('changes the render: the scattered transform differs from the bare source', () => {
    const bare = compileOk({
      blocks: [COUNT, DRAW],
      edges: [edge('e0', 'count', 'draw')],
    });
    const bareX = JSON.stringify(bare.objects[sceneObjectRef('draw')].instancing.transform.positionX);
    const scatteredX = JSON.stringify(objectOf(plan).instancing.transform.positionX);
    expect(scatteredX).not.toBe(bareX);
  });

  it('treats seed as a value lever: a different seed is a different plan', () => {
    const a = JSON.stringify(objectOf(scatterChain(0)).instancing.transform.positionX);
    const b = JSON.stringify(objectOf(scatterChain(7)).instancing.transform.positionX);
    expect(a).not.toBe(b);
  });

  it('keeps the chained output a JSON-serializable ScenePlan', () => {
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});
