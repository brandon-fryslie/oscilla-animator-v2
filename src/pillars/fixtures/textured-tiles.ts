/**
 * src/pillars/fixtures/textured-tiles.ts
 *
 * The asset-bridge proof patch (oscilla-pillars-cleanup-ulu.4): a grid of
 * texture-mapped tiles, each rotating over time, sampling a single checkerboard
 * texture asset. Authored as Oscilla graph semantics — the patch references the
 * texture by stable asset id, never an inline image or a Three object.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §5.3 ("Patch
 *   blocks should refer to assets by ID"); ticket oscilla-pillars-cleanup-ulu.4
 *   ("the first steel thread can resolve its assets through the registry").
 *
 * [LAW:one-source-of-truth] The asset id is the only link from patch to image;
 *   the bytes live in the asset metadata, decoded once by the loading bridge.
 * [LAW:effects-at-boundaries] This module is pure data: a patch and its asset
 *   metadata. Decoding the data URL into a Three texture happens behind the
 *   renderer seam.
 *
 * The texture is a self-contained `data:` URL (a 16×16 warm/teal checkerboard),
 * so the proof needs no external file server and stays hermetic.
 */

import { assetId } from '../../core/ids';
import type { AssetMetadata } from '../../assets';
import type { PillarPatch } from '../types';

/** Stable asset id the patch references and the registry resolves. */
const CHECKER_TILES_ASSET_ID = assetId('checker-tiles');

/** A 16×16 warm-orange / deep-teal checkerboard, encoded inline as a PNG. */
const CHECKER_TILES_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVR4nGMQqWj6j4w/9GigYELyDMPAAFI1oMsPBwMGPhYG3oCBj4UBNwAAZm5YH075PAMAAAAASUVORK5CYII=';

/** The assets the textured-tiles patch references, for the runtime registry. */
export const TEXTURED_TILES_ASSETS: readonly AssetMetadata[] = [
  {
    id: CHECKER_TILES_ASSET_ID,
    kind: 'texture',
    label: 'Checkerboard tiles',
    source: { kind: 'url', url: CHECKER_TILES_DATA_URL },
  },
];

export function makeTexturedTilesPatch(): PillarPatch {
  return {
    blocks: [
      {
        id: 'grid',
        kind: 'generator',
        type: 'InstanceGrid',
        config: {
          rows: 6,
          cols: 6,
          spacing: 0.16,
          rotationPerIndex: 0.3,
          rotationPerTime: 1.2,
        },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: {
          size: 0.12,
          cameraHalfExtentX: 0.7,
          cameraHalfExtentY: 0.7,
          textureAssetId: CHECKER_TILES_ASSET_ID,
        },
      },
    ],
    edges: [
      {
        id: 'e0',
        source: 'grid',
        target: 'draw',
        inputSlot: 'primary',
        role: 'primary',
      },
    ],
  };
}
