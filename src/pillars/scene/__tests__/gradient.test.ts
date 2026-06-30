/**
 * Tests for the Gradient color source (oscilla-pillars-scene-nt56.21).
 *
 * A Gradient ramps each instance's color between two opaque endpoints by its
 * normalized rank, in OKLab. These assert the *meaning* — the compiled color is
 * a per-instance OKLab binding whose channels lerp over rank — not the exact
 * PlanExpr tree. [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import { makeInstanceGradientPatch } from '../../fixtures/instance-gradient';
import { sceneObjectRef, type ScenePlan } from '../../../render/scene-plan';

function compileOk(): ScenePlan {
  const result = compileScenePlan(makeInstanceGradientPatch());
  if (result.kind !== 'ok') throw new Error(`expected ok, got: ${result.errors.join('; ')}`);
  return result.plan;
}

describe('Gradient color source — compiled meaning', () => {
  const plan = compileOk();
  const material = plan.resources.materials[plan.objects[sceneObjectRef('draw')].material];

  it('mints a perceptual OKLab color binding', () => {
    expect(material.kind).toBe('unlitColor');
    if (material.kind !== 'unlitColor') return;
    expect(material.color.space).toBe('oklab');
  });

  it('ramps every channel over rank (a lerp, not a bare const)', () => {
    if (material.kind !== 'unlitColor' || material.color.space !== 'oklab') {
      throw new Error('expected an unlitColor oklab material');
    }
    for (const channel of [material.color.l, material.color.a, material.color.b]) {
      const json = JSON.stringify(channel);
      // c0 + (c1 - c0) * (rank / span): the ramp reads rank and combines it.
      expect(json).toContain('"rank"');
      expect(json).toContain('"add"');
      expect(json).toContain('"mul"');
    }
  });
});
