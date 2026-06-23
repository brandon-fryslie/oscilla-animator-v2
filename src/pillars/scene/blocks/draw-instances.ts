/**
 * src/pillars/scene/blocks/draw-instances.ts
 *
 * Draw (sink) block: wraps an upstream instance bundle in a rendering shell —
 * a rectangle geometry, an unlit color material, an orthographic camera — and
 * draws it to the preview canvas.
 *
 * The optional `textureAssetId` selects the material: present → a `texturedUnlit`
 * material that samples that texture asset; absent → an `unlitColor` material
 * that takes its per-instance color from the upstream bundle. The texture
 * presence is config *data*; the lowering mints the texture handle.
 *
 * [LAW:decomposition] This block owns *how the instances are drawn* (geometry,
 *   material kind, framing, target); the instance-source block owns *what
 *   varies per instance*. The lowering joins the two at the primary edge.
 * [LAW:locality-or-seam] The shell names a geometry/material by shape only; the
 *   handles that turn it into resource-table entries are minted by the lowering,
 *   and the Three classes that realize them live behind the renderer seam.
 */

import { assetId as makeAssetId } from '../../../core/ids';
import type { MaterialShell, SceneBlockDefinition, SceneContribution } from '../scene-block';
import { readOptionalString, readPositiveNumber } from '../scene-block';

interface DrawInstancesConfig {
  readonly size: number;
  readonly cameraHalfExtentX: number;
  readonly cameraHalfExtentY: number;
  /** When set, the draw samples this texture asset instead of bundle color. */
  readonly textureAssetId: string | undefined;
}

export const DrawInstancesBlock: SceneBlockDefinition<DrawInstancesConfig> = {
  type: 'DrawInstances',
  role: 'draw',

  readConfig: (raw, blockId, diagnostics) => {
    const size = readPositiveNumber(raw, 'size', blockId, diagnostics);
    const cameraHalfExtentX = readPositiveNumber(raw, 'cameraHalfExtentX', blockId, diagnostics);
    const cameraHalfExtentY = readPositiveNumber(raw, 'cameraHalfExtentY', blockId, diagnostics);
    const textureAssetId = readOptionalString(raw, 'textureAssetId', blockId, diagnostics);

    if (
      size === null ||
      cameraHalfExtentX === null ||
      cameraHalfExtentY === null ||
      textureAssetId === null
    ) {
      return null;
    }
    return { size, cameraHalfExtentX, cameraHalfExtentY, textureAssetId };
  },

  contribute: (config): SceneContribution => {
    // [LAW:dataflow-not-control-flow] The material shell is selected from the
    //   texture-asset value, not from a mode flag on the block.
    const material: MaterialShell =
      config.textureAssetId === undefined
        ? { kind: 'unlitColor' }
        : { kind: 'texturedUnlit', assetId: makeAssetId(config.textureAssetId) };
    return {
      role: 'draw',
      shell: {
        geometry: { kind: 'rectangle', width: config.size, height: config.size },
        material,
        camera: {
          kind: 'orthographic',
          halfExtentX: config.cameraHalfExtentX,
          halfExtentY: config.cameraHalfExtentY,
        },
        // One render target exists today; the type pins it as a value, not a flag.
        target: 'previewCanvas',
      },
    };
  },
};
