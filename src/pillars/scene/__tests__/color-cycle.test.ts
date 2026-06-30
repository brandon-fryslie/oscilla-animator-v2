/**
 * Tests for the ColorCycle color source (oscilla-pillars-scene-nt56.19).
 *
 * ColorCycle spins each instance through the OKLCH hue wheel by rank (spread)
 * and time (drift). These assert the compiled *meaning* — an OKLab binding whose
 * chroma axes are cos/sin of a rank+time hue — not the exact PlanExpr tree.
 * [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import { makeGridOfSquaresPatch } from '../../fixtures/grid-of-squares';
import { sceneObjectRef, type ScenePlan } from '../../../render/scene-plan';

function compileOk(): ScenePlan {
  const result = compileScenePlan(makeGridOfSquaresPatch());
  if (result.kind !== 'ok') throw new Error(`expected ok, got: ${result.errors.join('; ')}`);
  return result.plan;
}

describe('ColorCycle color source — compiled meaning', () => {
  const plan = compileOk();
  const material = plan.resources.materials[plan.objects[sceneObjectRef('draw')].material];

  it('mints a perceptual OKLab color binding', () => {
    expect(material.kind).toBe('unlitColor');
    if (material.kind !== 'unlitColor') return;
    expect(material.color.space).toBe('oklab');
  });

  it('rotates hue by rank and time on the chroma axes (cos/sin of rank+time)', () => {
    if (material.kind !== 'unlitColor' || material.color.space !== 'oklab') {
      throw new Error('expected an unlitColor oklab material');
    }
    const a = JSON.stringify(material.color.a);
    const b = JSON.stringify(material.color.b);
    // a = C·cos(H), b = C·sin(H), with H = rank·spread + time·cycleSpeed.
    expect(a).toContain('"cos"');
    expect(b).toContain('"sin"');
    for (const axis of [a, b]) {
      expect(axis).toContain('"rank"');
      expect(axis).toContain('"time"');
    }
  });

  it('declares time as a derived runtime input the hue drift reads', () => {
    expect(plan.render.inputs).toContain('time');
  });
});
