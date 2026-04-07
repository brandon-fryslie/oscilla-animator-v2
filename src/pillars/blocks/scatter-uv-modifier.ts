/**
 * src/pillars/blocks/scatter-uv-modifier.ts
 *
 * ScatterUVModifier — a Modifier (Pillar 2) that overrides a primary
 * bundle's `pos_x` / `pos_y` fields with a 2D grid layout. Other fields
 * pass through unchanged.
 *
 * Useful as a drop-in replacement for "ParticlePool emits a ring, but
 * I want a grid" without writing an Expression DSL program every time.
 *
 *   col = gid % cols
 *   row = gid / cols
 *   pos_x = (col - (cols-1)/2) * spacing + centerX
 *   pos_y = (row - (rows-1)/2) * spacing + centerY
 *
 * `gid` is the per-instance index let-bound at the top of the consuming
 * compute pass. Math runs in WGSL at dispatch time — only the literal
 * configuration values are baked into the IR.
 */

import {
  binop,
  cast,
  litF32,
  litU32,
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

interface ScatterUVConfig {
  readonly cols: number;
  readonly rows: number;
  readonly spacing: number;
  readonly centerX: number;
  readonly centerY: number;
}

type ScatterUVLowerArgs = ScatterUVConfig;

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): ScatterUVConfig | null {
  let hadError = false;
  const push = (message: string): void => {
    diagnostics.push({ severity: 'error', message });
    hadError = true;
  };

  const cols = raw.cols;
  if (typeof cols !== 'number' || cols <= 0 || !Number.isInteger(cols)) {
    push('[ScatterUVModifier] config.cols must be a positive integer');
  }
  const rows = raw.rows;
  if (typeof rows !== 'number' || rows <= 0 || !Number.isInteger(rows)) {
    push('[ScatterUVModifier] config.rows must be a positive integer');
  }
  const spacing = raw.spacing;
  if (typeof spacing !== 'number') {
    push('[ScatterUVModifier] config.spacing must be a number');
  }
  const centerXRaw = raw.centerX ?? 0;
  if (typeof centerXRaw !== 'number') {
    push('[ScatterUVModifier] config.centerX must be a number');
  }
  const centerYRaw = raw.centerY ?? 0;
  if (typeof centerYRaw !== 'number') {
    push('[ScatterUVModifier] config.centerY must be a number');
  }

  if (hadError) return null;
  return {
    cols: cols as number,
    rows: rows as number,
    spacing: spacing as number,
    centerX: centerXRaw as number,
    centerY: centerYRaw as number,
  };
}

function buildManifestContribution(): ManifestContribution {
  return {};
}

function lower(args: ScatterUVLowerArgs, ctx: LoweringContext): LoweredBlock {
  const primary = ctx.inputBundles.primary;
  if (!primary) {
    throw new Error('[ScatterUVModifier] requires a primary input bundle');
  }

  // gid is the per-instance index, u32, let-bound at top of compute pass.
  const gid = ref('gid');
  const colsLit = litU32(args.cols);
  const colU32 = binop('%', gid, colsLit);
  const rowU32 = binop('/', gid, colsLit);

  const colF32 = cast('f32', colU32);
  const rowF32 = cast('f32', rowU32);

  const halfCols = (args.cols - 1) / 2;
  const halfRows = (args.rows - 1) / 2;

  // pos_x = (colF32 - halfCols) * spacing + centerX
  const posX = binop(
    '+',
    binop('*', binop('-', colF32, litF32(halfCols)), litF32(args.spacing)),
    litF32(args.centerX),
  );
  const posY = binop(
    '+',
    binop('*', binop('-', rowF32, litF32(halfRows)), litF32(args.spacing)),
    litF32(args.centerY),
  );

  const output: SourceBundle = {
    ...primary,
    pos_x: posX,
    pos_y: posY,
  };

  return { kind: 'bundle', output };
}

export const ScatterUVModifierBlock: BlockDefinition<ScatterUVConfig, ScatterUVLowerArgs> = {
  type: 'ScatterUVModifier',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};
