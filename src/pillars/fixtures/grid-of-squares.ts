/**
 * src/pillars/fixtures/grid-of-squares.ts
 *
 * The first Three-migration proof patch, authored as Oscilla graph semantics:
 * a 10×10 grid of squares, each rotating over time, with a single opaque color
 * set by a `SolidColor` block.
 *
 * The DEMO-PATCHES spec colors this grid by a rank+time HSL hue. That is a
 * channel-driven, position-varying color the opaque-color slice (nt56.5)
 * deliberately defers to the follow-on color-by-position block; until it lands,
 * the grid is a single solid color. Its rotation is still time-driven, so the
 * first-proof-contract requirement that frames differ over time still holds.
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
        type: 'SolidColor',
        config: { color: '#2e8bff' },
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
