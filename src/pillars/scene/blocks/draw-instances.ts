/**
 * src/pillars/scene/blocks/draw-instances.ts
 *
 * Draw (sink) block: wraps an upstream instance bundle in a rendering shell —
 * a rectangle geometry, an unlit color material, an orthographic camera — and
 * draws it to the preview canvas.
 *
 * [LAW:decomposition] This block owns *how the instances are drawn* (geometry,
 *   material kind, framing, target); the instance-source block owns *what
 *   varies per instance*. The lowering joins the two at the primary edge.
 * [LAW:locality-or-seam] The shell names a geometry/material by shape only; the
 *   handles that turn it into resource-table entries are minted by the lowering,
 *   and the Three classes that realize them live behind the renderer seam.
 */

import type { SceneBlockDefinition, SceneContribution } from '../scene-block';
import { readPositiveNumber } from '../scene-block';

interface DrawInstancesConfig {
  readonly size: number;
  readonly cameraHalfExtentX: number;
  readonly cameraHalfExtentY: number;
}

export const DrawInstancesBlock: SceneBlockDefinition<DrawInstancesConfig> = {
  type: 'DrawInstances',
  role: 'draw',

  readConfig: (raw, blockId, diagnostics) => {
    const size = readPositiveNumber(raw, 'size', blockId, diagnostics);
    const cameraHalfExtentX = readPositiveNumber(raw, 'cameraHalfExtentX', blockId, diagnostics);
    const cameraHalfExtentY = readPositiveNumber(raw, 'cameraHalfExtentY', blockId, diagnostics);

    if (size === null || cameraHalfExtentX === null || cameraHalfExtentY === null) {
      return null;
    }
    return { size, cameraHalfExtentX, cameraHalfExtentY };
  },

  contribute: (config): SceneContribution => ({
    role: 'draw',
    shell: {
      geometry: { kind: 'rectangle', width: config.size, height: config.size },
      material: { kind: 'unlitColor' },
      camera: {
        kind: 'orthographic',
        halfExtentX: config.cameraHalfExtentX,
        halfExtentY: config.cameraHalfExtentY,
      },
      // One render target exists today; the type pins it as a value, not a flag.
      target: 'previewCanvas',
    },
  }),
};
