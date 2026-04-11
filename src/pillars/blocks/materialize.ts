/**
 * src/pillars/blocks/materialize.ts
 *
 * Materialize — an Intent (Pillar 4) sink that writes a primary
 * SourceBundle into a 2D storage texture via a single compute pass.
 *
 * Where DrawBundle writes per-instance fields into a domain SoA and
 * renders them to the canvas with three roster entries (compute,
 * draw-prep, render), Materialize emits exactly one ComputePassSpec with
 * `dispatch.mode='Texture'` that writes the bundle's color components
 * into a storage texture as RGBA8 texels. There is no draw call.
 *
 * The block is the second sink type in the new pillar system. The
 * walker handles it without modification — the opaque-node design pays
 * off here: walker.ts calls node.lower(ctx) and gets back
 * { kind: 'intent', passes: [computeOnly] }, with no idea this sink
 * targets a texture.
 */

import type {
  BlockDefinition,
  Diagnostic,
  LoweredBlock,
  LoweringContext,
  ManifestContribution,
} from '../block-api';
import { makeStorageTexture2D } from '../block-dsl/presentation/storage-texture';
import { buildTextureMaterializePass } from '../block-dsl/pass-builders/texture-materialize-pass';

interface MaterializeConfig {
  readonly textureId: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
}

type MaterializeLowerArgs = MaterializeConfig;

const REQUIRED_FIELDS = ['color_r', 'color_g', 'color_b', 'color_a'] as const;

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): MaterializeConfig | null {
  let hadError = false;
  const push = (message: string): void => {
    diagnostics.push({ severity: 'error', message });
    hadError = true;
  };

  const textureId = raw.textureId;
  if (typeof textureId !== 'string') push('[Materialize] config.textureId must be a string');

  const width = raw.width;
  if (typeof width !== 'number' || width <= 0 || !Number.isInteger(width)) {
    push('[Materialize] config.width must be a positive integer');
  }

  const height = raw.height;
  if (typeof height !== 'number' || height <= 0 || !Number.isInteger(height)) {
    push('[Materialize] config.height must be a positive integer');
  }

  const formatRaw = raw.format ?? 'rgba8unorm';
  if (typeof formatRaw !== 'string') push('[Materialize] config.format must be a string');

  if (hadError) return null;
  return {
    textureId: textureId as string,
    width: width as number,
    height: height as number,
    format: formatRaw as string,
  };
}

function buildManifestContribution(config: MaterializeConfig): ManifestContribution {
  return {
    textures: {
      [config.textureId]: makeStorageTexture2D(config.width, config.height, config.format),
    },
  };
}

function lower(args: MaterializeLowerArgs, ctx: LoweringContext): LoweredBlock {
  const primary = ctx.inputBundles.primary;
  if (!primary) {
    throw new Error('[Materialize] requires a primary input bundle');
  }
  const missing = REQUIRED_FIELDS.filter((f) => !(f in primary));
  if (missing.length > 0) {
    throw new Error(
      `[Materialize] primary bundle is missing required field(s) ${missing
        .map((f) => `'${f}'`)
        .join(', ')}. Available: ${Object.keys(primary).sort().join(', ')}`,
    );
  }

  const computePass = buildTextureMaterializePass({
    passId: `${args.textureId}_materialize`,
    sourceBlockId: args.textureId,
    textureId: args.textureId,
    bundle: primary,
  });

  return { kind: 'intent', passes: [computePass] };
}

export const MaterializeBlock: BlockDefinition<MaterializeConfig, MaterializeLowerArgs> = {
  type: 'Materialize',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};
