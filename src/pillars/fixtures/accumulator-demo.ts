/**
 * src/pillars/fixtures/accumulator-demo.ts
 *
 * The stateful-value proof target (oscilla-pillars-scene-nt56.18): a grid whose
 * WaveOffset amplitude is driven ONLY by an Accumulator — a value that ramps by a
 * fixed increment every frame. WaveOffset's time-driven `speed` term is routed to
 * a Constant `0`, so the wave carries no time dependence; the amplitude grows
 * solely because the accumulator's renderer-owned cell advances frame over frame.
 *
 * This isolates statefulness: if the accumulator did not carry its value across
 * frames, the amplitude would be a constant and the grid would sit still. That it
 * grows — and, across a live reinstall, keeps growing from where it was rather
 * than snapping back to zero — is the accumulator's cell being advanced and
 * carried behind the renderer seam. // [LAW:no-silent-failure]
 *
 * [LAW:one-source-of-truth] The authored intent is these blocks + edges;
 *   `compileScenePlan` derives the ScenePlan (and mints the state cell), never a
 *   hand-authored copy.
 * [LAW:effects-at-boundaries] The Accumulator contributes a description of a
 *   recurrence; the renderer closes it at the frame boundary.
 */

import type { PillarPatch } from '../types';

export function makeAccumulatorPatch(): PillarPatch {
  return {
    blocks: [
      {
        id: 'grid',
        kind: 'generator',
        type: 'InstanceGrid',
        config: { rows: 8, cols: 8, spacing: 0.12, rotationPerIndex: 0, rotationPerTime: 0 },
      },
      // The stateful driver: a running total advancing 0.05 per frame from 0.
      { id: 'acc', kind: 'generator', type: 'Accumulator', config: { init: 0, increment: 0.05 } },
      // Neutralizes WaveOffset's time term, so the wave animates ONLY via the cell.
      { id: 'still', kind: 'generator', type: 'Constant', config: { value: 0 } },
      { id: 'wave', kind: 'modifier', type: 'WaveOffset', config: {} },
      { id: 'color', kind: 'modifier', type: 'SolidColor', config: { color: '#ffcc33' } },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.06, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'grid', target: 'wave', inputSlot: 'primary', role: 'primary' },
      // The accumulator drives the wave's amplitude — the only animator on the path.
      { id: 'e1', source: 'acc', target: 'wave', inputSlot: 'amplitude', role: 'secondary' },
      // speed = 0 removes the time term, isolating the accumulator's contribution.
      { id: 'e2', source: 'still', target: 'wave', inputSlot: 'speed', role: 'secondary' },
      { id: 'e3', source: 'wave', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e4', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
