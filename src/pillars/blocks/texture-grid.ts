/**
 * src/pillars/blocks/texture-grid.ts
 *
 * TextureGrid — a Generator (Pillar 1) that pairs with Materialize. It
 * emits a SourceBundle of texel-coordinate-derived fields for a 2D
 * texture of the configured size.
 *
 * Bundle fields:
 *   u, v               — normalized texel coordinates in [0, 1]
 *   color_r, color_g   — initial values = u, v (a uv gradient)
 *   color_b            — constant 0
 *   color_a            — constant 1
 *
 * The expressions reference `gid_x` and `gid_y` (let-bound at the top
 * of the Materialize compute pass). Like Clock, TextureGrid has no
 * domainId — it lives outside the per-instance domain story so the
 * walker doesn't try to inherit a domain from it. Its
 * manifestContribution is empty (the texture is declared by Materialize,
 * not by the generator).
 *
 * The expression DSL on top of this generator works unchanged: an
 * ExpressionModifier sitting between TextureGrid and Materialize can
 * read `u` and `v` and write any of the color fields.
 */

import {
  binop,
  cast,
  litF32,
  ref,
} from '../../render/gpu-ir/ir-builders';
import type {
  BlockDefinition,
  Diagnostic,
  LoweredBlock,
  LoweringContext,
  ManifestContribution,
  SourceBundle,
} from '../block-api';

interface TextureGridConfig {
  readonly width: number;
  readonly height: number;
}

type TextureGridLowerArgs = TextureGridConfig;

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): TextureGridConfig | null {
  let hadError = false;
  const push = (message: string): void => {
    diagnostics.push({ severity: 'error', message });
    hadError = true;
  };

  const width = raw.width;
  if (typeof width !== 'number' || width <= 0 || !Number.isInteger(width)) {
    push('[TextureGrid] config.width must be a positive integer');
  }
  const height = raw.height;
  if (typeof height !== 'number' || height <= 0 || !Number.isInteger(height)) {
    push('[TextureGrid] config.height must be a positive integer');
  }

  if (hadError) return null;
  return { width: width as number, height: height as number };
}

function buildManifestContribution(): ManifestContribution {
  return {};
}

function lower(args: TextureGridLowerArgs, _ctx: LoweringContext): LoweredBlock {
  // The compute pass binds `let gid_x = global_invocation_id.x` and the
  // matching gid_y. Both are u32 — cast to f32 before normalizing.
  const u = binop('/', cast('f32', ref('gid_x')), litF32(args.width));
  const v = binop('/', cast('f32', ref('gid_y')), litF32(args.height));

  const output: SourceBundle = {
    u,
    v,
    color_r: u,
    color_g: v,
    color_b: litF32(0),
    color_a: litF32(1),
  };

  return { kind: 'bundle', output };
}

export const TextureGridBlock: BlockDefinition<TextureGridConfig, TextureGridLowerArgs> = {
  type: 'TextureGrid',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};
