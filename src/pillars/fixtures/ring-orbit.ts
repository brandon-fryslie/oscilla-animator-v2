/**
 * src/pillars/fixtures/ring-orbit.ts
 *
 * Native replacement for the legacy "orbit ring" demo: instances arranged evenly
 * around a circle that orbits the origin over time, colored across the ring by
 * rank so the rotation is visible frame-to-frame. Built entirely from native
 * scene blocks — a bare `InstanceCount` source with the circular placement and
 * orbital spin authored as a composable `RingLayout` *modifier*, never a fused
 * per-demo ring source.
 *
 * Chain: InstanceCount → RingLayout → ColorCycle → DrawInstances. This is also a
 * multi-block modifier chain (layout + color folded onto a count source).
 *
 * [LAW:composability] The motion (orbit) is `RingLayout`'s `angularSpeed` value,
 *   not a separate orbit block; the same layout is a static ring at speed 0.
 * [LAW:one-source-of-truth] These parameters are the authored intent; the
 *   ScenePlan is derived by `compileScenePlan`, never hand-authored alongside.
 */

import type { PillarPatch } from '../types';

export function makeRingOrbitPatch(): PillarPatch {
  return {
    blocks: [
      { id: 'count', kind: 'generator', type: 'InstanceCount', config: { count: 64 } },
      {
        id: 'ring',
        kind: 'modifier',
        type: 'RingLayout',
        config: { radius: 0.45, angularSpeed: 0.5 },
      },
      {
        id: 'color',
        kind: 'modifier',
        type: 'ColorCycle',
        config: { spread: 1, cycleSpeed: 0.1, vividness: 0.8, brightness: 0.6 },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.05, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'count', target: 'ring', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'ring', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
