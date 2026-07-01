/**
 * src/pillars/fixtures/point-dots.ts
 *
 * Isolated proof target for the size-correct point primitive
 * (oscilla-pillars-scene-nt56.24): a ring of large, well-separated round dots.
 * Where the dense `spirograph` trace proves points are *sized* (a thin curve, not
 * full-screen quads), this fixture proves each point is *round* — a filled disc,
 * not a square — by drawing few enough dots, large enough, that no two overlap.
 *
 * Chain: InstanceCount(16) → RingLayout → ColorCycle → DrawInstances(shape: point).
 *
 * [LAW:one-type-per-behavior] A round dot is a distinct primitive from a square
 *   quad; this fixture is the visible witness that `GeometryDef.point` realizes as
 *   a circle, so the two geometry variants never collapse into one.
 */

import type { PillarPatch } from '../types';

export function makePointDotsPatch(): PillarPatch {
  return {
    blocks: [
      { id: 'count', kind: 'generator', type: 'InstanceCount', config: { count: 16 } },
      {
        id: 'ring',
        kind: 'modifier',
        type: 'RingLayout',
        config: { radius: 0.42, angularSpeed: 0.3 },
      },
      {
        id: 'color',
        kind: 'modifier',
        type: 'ColorCycle',
        config: { spread: 1, cycleSpeed: 0.12, vividness: 0.85, brightness: 0.6 },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { shape: 'point', size: 0.16, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'count', target: 'ring', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'ring', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
