/**
 * src/pillars/fixtures/color-palette.ts
 *
 * A native palette color-source proof patch (oscilla-pillars-scene-nt56.22): a
 * grid of squares colored by a `ColorByIndex` block that gives each instance the
 * palette entry at its index, wrapping across the field — "every dot a different
 * color". Proves the texture-backed palette LUT (a `{kind:'data'}` texture
 * sampled with `nearest` filter through the OKLab→display map) renders the
 * authored palette colors through the Three backend.
 *
 * The grid rotates over time (`rotationPerTime`) so the proof also exercises the
 * shared animation gate; the palette colors themselves are static per instance.
 *
 * [LAW:one-source-of-truth] These parameters are the canonical authored intent;
 *   the compiled ScenePlan (the baked LUT, the index→coord mapping) is derived by
 *   `compileScenePlan`, never hand-authored.
 */

import type { PillarPatch } from '../types';

/** Six saturated hues; index % 6 cycles them across the grid. */
const PALETTE = ['#ff2d55', '#ff9500', '#ffcc00', '#34c759', '#2e8bff', '#af52de'];

export function makeColorPalettePatch(): PillarPatch {
  return {
    blocks: [
      {
        id: 'grid',
        kind: 'generator',
        type: 'InstanceGrid',
        config: {
          rows: 12,
          cols: 12,
          spacing: 0.09,
          rotationPerIndex: 0.0,
          rotationPerTime: 1.5,
        },
      },
      {
        id: 'palette',
        kind: 'modifier',
        type: 'ColorByIndex',
        config: { palette: PALETTE },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.07, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'grid', target: 'palette', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'palette', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
