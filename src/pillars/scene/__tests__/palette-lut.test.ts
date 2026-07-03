/**
 * Tests for the texture-backed palette/gradient color sources
 * (oscilla-pillars-scene-nt56.22): ColorByIndex and ColorFromGradient.
 *
 * Both lower to a `unlitColorLut` material sampling a `{kind:'data'}` LUT — the
 * selection/interpolation the pure-math PlanExpr vocabulary lacks is the texture
 * sample. These assert the compiled *meaning* (a data LUT of the right width and
 * filter, a coord reading the right intrinsic), not the exact coord PlanExpr
 * tree. [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import {
  sceneObjectRef,
  type MaterialDef,
  type ScenePlan,
  type TextureDef,
} from '../../../render/scene-plan';
import type { PillarPatch } from '../../types';

function colorBlockPatch(type: string, config: Record<string, unknown>): PillarPatch {
  return {
    blocks: [
      { id: 'count', kind: 'generator', type: 'InstanceCount', config: { count: 12 } },
      { id: 'color', kind: 'modifier', type, config },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'count', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}

function compileOk(patch: PillarPatch): ScenePlan {
  const result = compileScenePlan(patch);
  if (result.kind !== 'ok') throw new Error(`expected ok, got: ${result.errors.join('; ')}`);
  return result.plan;
}

function drawMaterial(plan: ScenePlan): MaterialDef {
  return plan.resources.materials[plan.objects[sceneObjectRef('draw')].material];
}

function lutTexture(plan: ScenePlan, material: MaterialDef): Extract<TextureDef, { kind: 'data' }> {
  if (material.kind !== 'unlitColorLut') throw new Error('expected a unlitColorLut material');
  const def = plan.resources.textures[material.texture];
  if (def.kind !== 'data') throw new Error('expected a data LUT texture');
  return def;
}

describe('ColorByIndex — compiled meaning', () => {
  const palette = ['#ff0000', '#00ff00', '#0000ff'];
  const plan = compileOk(colorBlockPatch('ColorByIndex', { palette }));
  const material = drawMaterial(plan);

  it('lowers to a unlitColorLut material sampling a data LUT', () => {
    expect(material.kind).toBe('unlitColorLut');
  });

  it('bakes one nearest-filtered RGBA texel per palette entry', () => {
    const lut = lutTexture(plan, material);
    expect(lut.width).toBe(palette.length);
    expect(lut.height).toBe(1);
    expect(lut.filter).toBe('nearest');
    expect(lut.pixels.length).toBe(palette.length * 4);
  });

  it('selects by the instance index (coord reads the index intrinsic)', () => {
    if (material.kind !== 'unlitColorLut') throw new Error('expected unlitColorLut');
    expect(JSON.stringify(material.coord)).toContain('"index"');
  });
});

describe('ColorFromGradient — N-stop, compiled meaning', () => {
  const stops = ['#ff0000', '#00ff00', '#0000ff', '#ffffff'];
  const plan = compileOk(colorBlockPatch('ColorFromGradient', { stops }));
  const material = drawMaterial(plan);

  it('lowers to a unlitColorLut material over a linear-filtered N-stop LUT', () => {
    const lut = lutTexture(plan, material);
    expect(lut.width).toBe(stops.length);
    expect(lut.filter).toBe('linear');
    expect(lut.pixels.length).toBe(stops.length * 4);
  });

  it('ramps by rank (coord reads the rank intrinsic)', () => {
    if (material.kind !== 'unlitColorLut') throw new Error('expected unlitColorLut');
    expect(JSON.stringify(material.coord)).toContain('"rank"');
  });
});

describe('Brightness composes onto a palette LUT', () => {
  const palette = ['#ffffff', '#808080'];
  const factor = 0.5;
  const patch: PillarPatch = {
    blocks: [
      { id: 'count', kind: 'generator', type: 'InstanceCount', config: { count: 4 } },
      { id: 'color', kind: 'modifier', type: 'ColorByIndex', config: { palette } },
      { id: 'dim', kind: 'modifier', type: 'Brightness', config: { factor } },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'count', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'color', target: 'dim', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'dim', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };

  it('scales the LUT texels by the brightness factor, preserving alpha', () => {
    const plan = compileOk(patch);
    const material = drawMaterial(plan);
    const lut = lutTexture(plan, material);
    // The un-brightened LUT bakes the OKLab triples directly; brightening scales
    // every L/a/b channel by `factor` and leaves alpha (every 4th value) at 1.
    const unbrightened = lutTexture(
      compileOk(colorBlockPatch('ColorByIndex', { palette })),
      drawMaterial(compileOk(colorBlockPatch('ColorByIndex', { palette }))),
    );
    lut.pixels.forEach((v, i) => {
      if (i % 4 === 3) expect(v).toBe(1);
      else expect(v).toBeCloseTo(unbrightened.pixels[i] * factor, 5);
    });
  });
});
