/**
 * src/pillars/fixtures/instance-wave.ts
 *
 * A native modifier-chain proof patch (oscilla-pillars-scene-nt56.4): a grid of
 * squares fed through a `WaveOffset` transform modifier and a `Brightness` color
 * modifier before the draw. Proves a `source → modifier → modifier → draw` chain
 * compiles to one ScenePlan, with each modifier visibly altering the output (a
 * travelling vertical wave, then a luminance scale).
 *
 * [LAW:one-source-of-truth] These parameters are the canonical authored intent;
 *   the compiled ScenePlan is derived by `compileScenePlan`, never hand-authored.
 */

import type { PillarPatch } from '../types';

export function makeInstanceWavePatch(): PillarPatch {
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
          huePerTime: 0.2,
          saturation: 0.8,
          lightness: 0.6,
        },
      },
      {
        id: 'wave',
        kind: 'modifier',
        type: 'WaveOffset',
        config: { amplitude: 0.15, frequency: 6.0, speed: 2.0 },
      },
      {
        id: 'dim',
        kind: 'modifier',
        type: 'Brightness',
        config: { factor: 0.6 },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: {
          size: 0.08,
          cameraHalfExtentX: 0.6,
          cameraHalfExtentY: 0.6,
        },
      },
    ],
    edges: [
      { id: 'e0', source: 'grid', target: 'wave', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'wave', target: 'dim', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'dim', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
