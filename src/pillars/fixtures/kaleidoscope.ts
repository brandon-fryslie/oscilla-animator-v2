/**
 * src/pillars/fixtures/kaleidoscope.ts
 *
 * Native replacement for the "Kaleidoscope" demo (DEMO-PATCHES.md §1): a single
 * shape repeated N times with N-fold rotational symmetry from index math alone —
 * no mirror primitive. Built from native scene blocks: a bare `InstanceCount`
 * source, a `RingLayout` arranging the copies on a circle, and a `Kaleidoscope`
 * modifier giving each copy its `index`-derived facing (`index · TAU / N`). The
 * composition is a slowly-drifting pinwheel rosette colored across the ring.
 *
 * Chain: InstanceCount(12) → RingLayout → Kaleidoscope → ColorCycle → DrawInstances.
 * The copies are non-square bars (`aspect` ≠ 1), so the rosette reads as a
 * sharper N-fold pinwheel of spokes rather than a ring of squares.
 *
 * [LAW:composability] The symmetry order is the upstream count: the same
 *   `Kaleidoscope` modifier is 6-fold or 12-fold purely by the `InstanceCount`
 *   feeding it — no per-fold config.
 */

import type { PillarPatch } from '../types';

export function makeKaleidoscopePatch(): PillarPatch {
  return {
    blocks: [
      { id: 'count', kind: 'generator', type: 'InstanceCount', config: { count: 12 } },
      {
        id: 'ring',
        kind: 'modifier',
        type: 'RingLayout',
        config: { radius: 0.34, angularSpeed: 0.2 },
      },
      { id: 'kaleido', kind: 'modifier', type: 'Kaleidoscope', config: {} },
      {
        id: 'color',
        kind: 'modifier',
        type: 'ColorCycle',
        config: { spread: 1, cycleSpeed: 0.08, vividness: 0.85, brightness: 0.6 },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.16, aspect: 0.32, cameraHalfExtentX: 0.55, cameraHalfExtentY: 0.55 },
      },
    ],
    edges: [
      { id: 'e0', source: 'count', target: 'ring', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'ring', target: 'kaleido', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'kaleido', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e3', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
