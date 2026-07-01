/**
 * src/pillars/fixtures/spirograph.ts
 *
 * Native replacement for the "Spirograph Trace" demo (DEMO-PATCHES.md §1): a
 * dense field of points tracing a Lissajous figure, with `rank` used as a phase
 * delay so each instance is a different moment along the curve and the whole
 * trace flows over time. Built from native scene blocks only — a bare
 * `InstanceCount` source and a `Spirograph` layout *modifier*; the emergent
 * geometry comes from the `freqA:freqB` oscillator ratio, not a fused source.
 *
 * Chain: InstanceCount(600) → Spirograph(3:2) → ColorCycle → DrawInstances.
 * The dots are true round points (`shape: 'point'`): a sized disc per instance,
 * not a faked square.
 *
 * [LAW:dataflow-not-control-flow] The figure is the value of the frequency ratio;
 *   a different ratio is a different curve with no new block.
 */

import type { PillarPatch } from '../types';

export function makeSpirographPatch(): PillarPatch {
  return {
    blocks: [
      { id: 'count', kind: 'generator', type: 'InstanceCount', config: { count: 600 } },
      {
        id: 'spiro',
        kind: 'modifier',
        type: 'Spirograph',
        config: { radius: 0.5, freqA: 3, freqB: 2, speed: 0.4 },
      },
      {
        id: 'color',
        kind: 'modifier',
        type: 'ColorCycle',
        config: { spread: 1, cycleSpeed: 0.15, vividness: 0.9, brightness: 0.6 },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { shape: 'point', size: 0.02, cameraHalfExtentX: 0.65, cameraHalfExtentY: 0.65 },
      },
    ],
    edges: [
      { id: 'e0', source: 'count', target: 'spiro', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'spiro', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
