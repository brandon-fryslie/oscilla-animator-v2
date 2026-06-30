/**
 * src/pillars/fixtures/instance-gradient.ts
 *
 * A native color-source proof patch (oscilla-pillars-scene-nt56.21): a grid of
 * squares colored by a `Gradient` block that ramps each instance between two
 * opaque colors by its `rank`. Proves the perceptual OKLab gradient renders as a
 * smooth ramp across the field — the "Gradient Ribbon" coloring idea on the
 * native scene contract.
 *
 * [LAW:one-source-of-truth] These parameters are the canonical authored intent;
 *   the compiled ScenePlan is derived by `compileScenePlan`, never hand-authored.
 */

import type { PillarPatch } from '../types';

export function makeInstanceGradientPatch(): PillarPatch {
  return {
    blocks: [
      {
        id: 'grid',
        kind: 'generator',
        type: 'InstanceGrid',
        config: {
          rows: 10,
          cols: 10,
          spacing: 0.1,
          rotationPerIndex: 0.5,
          rotationPerTime: 2.0,
        },
      },
      {
        id: 'gradient',
        kind: 'modifier',
        type: 'Gradient',
        config: { colorStart: '#ff2d55', colorEnd: '#2e8bff' },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'grid', target: 'gradient', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'gradient', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
