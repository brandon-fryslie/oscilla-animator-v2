/**
 * src/pillars/fixtures/scalar-route.ts
 *
 * The scalar-routing proof target (oscilla-pillars-scene-nt56.25): a grid fed
 * through a `WaveOffset` whose `amplitude` knob is *routed* from a `Constant`
 * scalar source, not left to its config default. The routed value (0.45) is far
 * larger than the knob's default (0.15), so the wave the compiler builds is
 * visibly taller — the render is driven by the value crossing the scalar edge.
 *
 * This is the substrate a routed scalar folds onto: the `amplitude` PlanExpr in
 * the compiled plan is the Constant's `konst(0.45)`, reached through the scalar
 * edge, in place of the synthesized config default.
 *
 * [LAW:one-source-of-truth] The authored intent is these blocks + the scalar
 *   edge; `compileScenePlan` derives the ScenePlan, never a hand-authored copy.
 * [LAW:dataflow-not-control-flow] The routed value replaces a config leaf with no
 *   branch — the modifier reads `inputs.amplitude` whether wired or defaulted.
 */

import type { PillarPatch } from '../types';

export function makeScalarRoutePatch(): PillarPatch {
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
          rotationPerIndex: 0,
          rotationPerTime: 0,
        },
      },
      // The scalar source: a Constant whose value drives the wave's amplitude.
      { id: 'amp', kind: 'generator', type: 'Constant', config: { value: 0.45 } },
      {
        id: 'wave',
        kind: 'modifier',
        type: 'WaveOffset',
        // frequency/speed keep their knob defaults; amplitude is routed below.
        config: {},
      },
      {
        id: 'color',
        kind: 'modifier',
        type: 'SolidColor',
        config: { color: '#39d0ff' },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.05, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'grid', target: 'wave', inputSlot: 'primary', role: 'primary' },
      // The scalar route: Constant.value → WaveOffset.amplitude.
      { id: 'e1', source: 'amp', target: 'wave', inputSlot: 'amplitude', role: 'secondary' },
      { id: 'e2', source: 'wave', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e3', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
