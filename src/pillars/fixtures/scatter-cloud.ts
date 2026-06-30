/**
 * src/pillars/fixtures/scatter-cloud.ts
 *
 * Native proof target for the Scatter layout modifier
 * (oscilla-pillars-scene-nt56.23): a field of points placed pseudo-randomly
 * across the frame by hashing each instance's integer `index`, colored across the
 * cloud by rank so the scatter is legible. Built entirely from native scene
 * blocks — a bare `InstanceCount` source with the placement authored as a
 * composable `Scatter` *modifier*, never a fused scatter source.
 *
 * Chain: InstanceCount → Scatter → ColorCycle → DrawInstances. This exercises the
 * new `hash` PlanExpr operator end-to-end (compiler → ScenePlan → TSL → WebGPU).
 *
 * [LAW:composability] The placement is `Scatter`'s `seed`/extent values folded
 *   onto a bare count source; the same modifier drops after any other layout to
 *   jitter it.
 * [LAW:one-source-of-truth] These parameters are the authored intent; the
 *   ScenePlan is derived by `compileScenePlan`, never hand-authored alongside.
 */

import type { PillarPatch } from '../types';

export function makeScatterCloudPatch(): PillarPatch {
  return {
    blocks: [
      { id: 'count', kind: 'generator', type: 'InstanceCount', config: { count: 400 } },
      {
        id: 'scatter',
        kind: 'modifier',
        type: 'Scatter',
        config: { width: 1.1, height: 1.1, seed: 1 },
      },
      {
        id: 'color',
        kind: 'modifier',
        type: 'ColorCycle',
        config: { spread: 1, cycleSpeed: 0.1, vividness: 0.8, brightness: 0.7 },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.03, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'count', target: 'scatter', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'scatter', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
