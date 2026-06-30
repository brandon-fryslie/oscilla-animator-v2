/**
 * src/pillars/fixtures/grid-of-squares.ts
 *
 * The first Three-migration proof patch, authored as Oscilla graph semantics:
 * a 10×10 grid of squares, each rotating over time, colored by a `ColorCycle`
 * block that spreads the hue across the field by rank and drifts it with time —
 * the DEMO-PATCHES spec color (hue = rank + time*0.2), realized on the
 * perceptual OKLab model.
 *
 * Scope source: design-docs/three-migration-first-proof-contract.md
 *   §"Required Compiler Capabilities"; design-docs/DEMO-PATCHES.md
 *   §"Grid of Squares".
 *
 * This patch carries only declarative *parameters*. The ScenePlan lowering
 * (src/pillars/scene) synthesizes the per-instance index/rank math from them —
 * the authored graph never spells out a `PlanExpr` or a Three scene.
 *
 * [LAW:one-source-of-truth] These parameters are the canonical authored intent.
 *   The compiled ScenePlan is derived execution data, produced by
 *   `compileScenePlan`, never hand-authored alongside this patch.
 *
 * It is compiled through `compileScenePlan` (NOT `compilePillarPatch`), so it is
 * deliberately absent from `PILLAR_FIXTURES`, which feeds the frozen GPU-IR
 * compiler-tester.
 */

import type { PillarPatch } from '../types';

export function makeGridOfSquaresPatch(): PillarPatch {
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
        id: 'color',
        kind: 'modifier',
        type: 'ColorCycle',
        // The DEMO-PATCHES spec color: hue = rank + time*0.2 (one wheel across
        // the field, drifting over time), at fixed vividness and brightness —
        // now on the perceptual OKLab model.
        config: { spread: 1, cycleSpeed: 0.2, vividness: 0.8, brightness: 0.6 },
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
      { id: 'e0', source: 'grid', target: 'color', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
