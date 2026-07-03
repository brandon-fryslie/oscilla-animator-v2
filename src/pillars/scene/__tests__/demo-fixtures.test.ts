/**
 * Integration tests for the native target-animation fixtures
 * (oscilla-pillars-scene-nt56.8): each recreates a legacy demo behavior from
 * native scene blocks only and compiles through `compileScenePlan` to a
 * ScenePlan with the expected user-visible behavior and contracts.
 *
 * [LAW:behavior-not-structure] Assertions target what each plan *means* — the
 *   instance count, that placement varies per instance (rank/index), that motion
 *   is a runtime `time` input, that visibility is a per-instance opacity — not
 *   the exact PlanExpr tree shape, which the lowering is free to refactor.
 * [LAW:verifiable-goals] The registry sweep proves every demo the app can boot
 *   via `?scenePlan=<id>` actually compiles, so a broken fixture fails loudly in
 *   CI rather than only at runtime.
 */

import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import { sceneObjectRef, type ScenePlan } from '../../../render/scene-plan';
import { SCENE_PLAN_DEMOS } from '../../fixtures/scene-demos';
import { makeRingOrbitPatch } from '../../fixtures/ring-orbit';
import { makeSpirographPatch } from '../../fixtures/spirograph';
import { makeKaleidoscopePatch } from '../../fixtures/kaleidoscope';
import { makeConditionalVisibilityPatch } from '../../fixtures/conditional-visibility';
import type { PillarPatch } from '../../types';

function compileOk(patch: PillarPatch): ScenePlan {
  const result = compileScenePlan(patch);
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok ScenePlan, got errors: ${result.errors.join('; ')}`);
  }
  return result.plan;
}

function drawObject(plan: ScenePlan) {
  return plan.objects[sceneObjectRef('draw')];
}

/** The one geometry the single draw renders. */
function drawGeometry(plan: ScenePlan) {
  return plan.resources.geometries[drawObject(plan).geometry];
}

/** The one material the single draw is shaded by. */
function drawMaterial(plan: ScenePlan) {
  return plan.resources.materials[drawObject(plan).material];
}

describe('native target-animation fixtures — registry sweep', () => {
  it('every registered ScenePlan demo compiles to an ok plan', () => {
    for (const [id, demo] of Object.entries(SCENE_PLAN_DEMOS)) {
      const result = compileScenePlan(demo.makePatch());
      if (result.kind !== 'ok') {
        throw new Error(`demo '${id}' failed to compile: ${result.errors.join('; ')}`);
      }
      expect(result.plan.render.draws.length).toBeGreaterThan(0);
    }
  });

  it('every demo is built on a bare InstanceCount source, not a fused layout source', () => {
    // [LAW:composability] The foundational cut: layouts are modifiers folded onto
    //   a count source. The only legacy fused source still in use is the grid.
    const layoutDemos = ['ring-orbit', 'spirograph', 'kaleidoscope', 'conditional-visibility', 'scatter-cloud'];
    for (const id of layoutDemos) {
      const patch = SCENE_PLAN_DEMOS[id].makePatch();
      const sources = patch.blocks.filter((b) => b.kind === 'generator');
      expect(sources.map((b) => b.type)).toEqual(['InstanceCount']);
    }
  });
});

describe('ring-orbit — circular layout that orbits over time', () => {
  const plan = compileOk(makeRingOrbitPatch());
  const object = drawObject(plan);

  it('declares the authored instance count', () => {
    expect(object.instancing.count).toBe(64);
  });

  it('places instances on a ring: position varies per instance via rank, with trig', () => {
    const px = JSON.stringify(object.instancing.transform.positionX);
    expect(px).toContain('"rank"');
    expect(px).toContain('"cos"');
    const py = JSON.stringify(object.instancing.transform.positionY);
    expect(py).toContain('"rank"');
    expect(py).toContain('"sin"');
  });

  it('orbits over time: position reads the runtime time channel', () => {
    expect(plan.render.inputs).toContain('time');
    expect(JSON.stringify(object.instancing.transform.positionX)).toContain('"time"');
  });

  it('colors the ring by the ColorCycle block (perceptual oklab)', () => {
    const material = drawMaterial(plan);
    expect(material.kind).toBe('unlitColor');
    if (material.kind !== 'unlitColor') return;
    expect(material.color.space).toBe('oklab');
  });
});

describe('spirograph — Lissajous trace from rank-as-phase', () => {
  const plan = compileOk(makeSpirographPatch());
  const object = drawObject(plan);

  it('declares a dense instance field', () => {
    expect(object.instancing.count).toBe(600);
  });

  it('uses rank as a phase delay and animates over time', () => {
    const px = JSON.stringify(object.instancing.transform.positionX);
    expect(px).toContain('"rank"');
    expect(px).toContain('"time"');
    expect(plan.render.inputs).toContain('time');
  });

  it('draws true round points, sized as dots rather than faked with squares', () => {
    const geo = drawGeometry(plan);
    expect(geo.kind).toBe('point');
    if (geo.kind !== 'point') return;
    expect(geo.size).toBeLessThan(0.05);
    expect(geo.size).toBeGreaterThan(0);
  });
});

describe('kaleidoscope — N-fold symmetry from index math', () => {
  const plan = compileOk(makeKaleidoscopePatch());
  const object = drawObject(plan);

  it('declares the N copies (symmetry order)', () => {
    expect(object.instancing.count).toBe(12);
  });

  it('derives per-instance facing from the index intrinsic', () => {
    expect(JSON.stringify(object.instancing.transform.rotation)).toContain('"index"');
  });

  it('arranges the copies on a ring (position varies by rank)', () => {
    expect(JSON.stringify(object.instancing.transform.positionX)).toContain('"rank"');
  });

  it('draws non-square bars so the rosette reads as spokes, not squares', () => {
    const geo = drawGeometry(plan);
    expect(geo.kind).toBe('rectangle');
    if (geo.kind !== 'rectangle') return;
    expect(geo.width).not.toBeCloseTo(geo.height);
  });
});

describe('conditional-visibility — show/hide as per-instance opacity', () => {
  const plan = compileOk(makeConditionalVisibilityPatch());

  it('shades the draw with a per-instance rgba opacity, not an opaque space', () => {
    const material = drawMaterial(plan);
    expect(material.kind).toBe('unlitColor');
    if (material.kind !== 'unlitColor') return;
    expect(material.color.space).toBe('rgba');
  });

  it('drives opacity by a threshold (step) over a per-instance, time-varying field', () => {
    const material = drawMaterial(plan);
    if (material.kind !== 'unlitColor' || material.color.space !== 'rgba') {
      throw new Error('expected an rgba unlit material');
    }
    const alpha = JSON.stringify(material.color.a);
    expect(alpha).toContain('"step"');
    expect(alpha).toContain('"rank"');
    expect(alpha).toContain('"time"');
    expect(plan.render.inputs).toContain('time');
  });

  it('draws every instance — visibility is opacity, not a dropped instance', () => {
    expect(drawObject(plan).instancing.count).toBe(240);
  });
});
