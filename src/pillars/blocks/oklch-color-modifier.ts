/**
 * src/pillars/blocks/oklch-color-modifier.ts
 *
 * OklchColorModifier — a Modifier (Pillar 2) that overrides a primary
 * bundle's `color_r` / `color_g` / `color_b` fields with a constant
 * RGB triple converted from an OKLCH input at compile time.
 *
 * The OKLCH→linear sRGB conversion runs once in TypeScript during
 * lower(). The IR sees only the resulting three LiteralF32 constants —
 * the GPU never executes the conversion math. `color_a` (and any other
 * fields) pass through unchanged.
 *
 * OKLCH formula reference: https://bottosson.github.io/posts/oklab/
 */

import { litF32 } from '../../render/gpu-ir/ir-builders';
import type {
  BlockDefinition,
  Diagnostic,
  LoweredBlock,
  LoweringContext,
  ManifestContribution,
  SourceBundle,
} from '../block-api';

interface OklchColorConfig {
  /** Lightness, [0, 1]. */
  readonly l: number;
  /** Chroma, typically [0, 0.4]. */
  readonly c: number;
  /** Hue in degrees, [0, 360). */
  readonly h: number;
}

type OklchColorLowerArgs = OklchColorConfig;

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): OklchColorConfig | null {
  let hadError = false;
  const push = (message: string): void => {
    diagnostics.push({ severity: 'error', message });
    hadError = true;
  };

  const l = raw.l;
  if (typeof l !== 'number') push('[OklchColorModifier] config.l must be a number');
  const c = raw.c;
  if (typeof c !== 'number') push('[OklchColorModifier] config.c must be a number');
  const h = raw.h;
  if (typeof h !== 'number') push('[OklchColorModifier] config.h must be a number');

  if (hadError) return null;
  return { l: l as number, c: c as number, h: h as number };
}

function buildManifestContribution(): ManifestContribution {
  return {};
}

/**
 * Convert OKLCH (lightness/chroma/hue°) to linear sRGB. Closed-form
 * implementation of the OKLab → linear sRGB transform from Björn
 * Ottosson's reference. Returns floats in [0, 1] before sRGB encoding —
 * good enough for our test fixture rendering, which currently sends
 * linear values straight to a fragment output.
 */
function oklchToLinearRgb(l: number, c: number, hDeg: number): { r: number; g: number; b: number } {
  const hRad = (hDeg * Math.PI) / 180;
  const a = Math.cos(hRad) * c;
  const b = Math.sin(hRad) * c;

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const lc = l_ ** 3;
  const mc = m_ ** 3;
  const sc = s_ ** 3;

  const r = +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bOut = -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc;

  return {
    r: Math.max(0, Math.min(1, r)),
    g: Math.max(0, Math.min(1, g)),
    b: Math.max(0, Math.min(1, bOut)),
  };
}

function lower(args: OklchColorLowerArgs, ctx: LoweringContext): LoweredBlock {
  const primary = ctx.inputBundles.primary;
  if (!primary) {
    throw new Error('[OklchColorModifier] requires a primary input bundle');
  }
  const { r, g, b } = oklchToLinearRgb(args.l, args.c, args.h);

  const output: SourceBundle = {
    ...primary,
    color_r: litF32(r),
    color_g: litF32(g),
    color_b: litF32(b),
  };

  return { kind: 'bundle', output };
}

export const OklchColorModifierBlock: BlockDefinition<OklchColorConfig, OklchColorLowerArgs> = {
  type: 'OklchColorModifier',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};

// Re-exported for tests so they can compute the expected color values.
export { oklchToLinearRgb };
