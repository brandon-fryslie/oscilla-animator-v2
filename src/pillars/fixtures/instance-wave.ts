/**
 * src/pillars/fixtures/instance-wave.ts
 *
 * A native modifier-chain proof patch (oscilla-pillars-scene-nt56.4, extended by
 * nt56.5): a grid of squares fed through a `WaveOffset` transform modifier, a
 * `SolidColor` color source, and a `Brightness` color adjustment before the
 * draw. Proves a `source → modifier → modifier → modifier → draw` chain compiles
 * to one ScenePlan, with each modifier visibly altering the output (a travelling
 * vertical wave, a solid color, then a luminance scale). This is the nt56.5
 * color-source-plus-adjustment proof: the dimmed orange is `SolidColor` set then
 * `Brightness`-scaled.
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
        },
      },
      {
        id: 'wave',
        kind: 'modifier',
        type: 'WaveOffset',
        config: { amplitude: 0.15, frequency: 6.0, speed: 2.0 },
      },
      {
        id: 'color',
        kind: 'modifier',
        type: 'SolidColor',
        config: { color: '#ff7a1a' },
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
      { id: 'e1', source: 'wave', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'color', target: 'dim', inputSlot: 'primary', role: 'primary' },
      { id: 'e3', source: 'dim', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
