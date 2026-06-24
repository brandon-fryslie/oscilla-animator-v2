/**
 * src/pillars/blocks/dot-material-block.ts
 *
 * DotMaterial — Material (Pillar 3). The first concrete material block.
 * Emits the WGSL that turns a particle bundle into a per-instance colored
 * dot: a vertex/fragment pair for render sinks (DrawBundle) and a compute
 * body for texture-materialize sinks (Materialize).
 *
 * The shader bodies are ported verbatim from the legacy `makeDotMaterial`
 * helper (block-dsl/materials/dot-material.ts) — the change is structural:
 * the composition is now a first-class block wired into a sink via a
 * `'material'`-role edge, not an inline call inside the sink's `lower()`.
 * [LAW:one-source-of-truth] this block is the sole owner of dot color
 * composition; sinks forward its fragments and never inline a vec4.
 *
 * Materials declare no manifest resources and have no inputs: `lower`
 * ignores `ctx` and builds the spec from config alone.
 */

import type { SymbolId } from '../../render/rust/boundary-contract';
import type {
  BlockDefinition,
  Diagnostic,
  LoweredBlock,
  LoweringContext,
  ManifestContribution,
} from '../block-api';
import {
  binop,
  construct,
  intrinsic,
  let_,
  litF32,
  loadField,
  ref,
  returnFragment,
  returnVertex,
  swizzle,
} from '../../render/gpu-ir/ir-builders';
import { defineMaterialSpec } from '../block-dsl/materials/material-spec';

interface DotMaterialConfig {
  readonly domainId: string;
}

type DotMaterialLowerArgs = DotMaterialConfig;

/**
 * The fields the dot material reads from the paired bundle. The single
 * source of truth for "what the bundle must contain"; sinks validate
 * against this list rather than hand-checking names. [LAW:single-enforcer]
 */
const REQUIRED_FIELDS: readonly string[] = [
  'pos_x',
  'pos_y',
  'color_r',
  'color_g',
  'color_b',
];

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): DotMaterialConfig | null {
  const domainId = raw.domainId;
  if (typeof domainId !== 'string') {
    diagnostics.push({ severity: 'error', message: '[DotMaterial] config.domainId must be a string' });
    return null;
  }
  return { domainId };
}

function buildManifestContribution(_config: DotMaterialConfig): ManifestContribution {
  // Materials compose color from fields the upstream generator already
  // declared; they own no GPU resources of their own.
  return {};
}

function lower(args: DotMaterialLowerArgs, _ctx: LoweringContext): LoweredBlock {
  const fieldSymbol = (name: string): SymbolId => `${args.domainId}:${name}` as SymbolId;

  const spec = defineMaterialSpec({
    vertexAst: [
      let_('iid', intrinsic('instance_index')),
      let_('px', loadField(fieldSymbol('pos_x'), ref('iid'))),
      let_('py', loadField(fieldSymbol('pos_y'), ref('iid'))),
      let_('cr', loadField(fieldSymbol('color_r'), ref('iid'))),
      let_('cg', loadField(fieldSymbol('color_g'), ref('iid'))),
      let_('cb', loadField(fieldSymbol('color_b'), ref('iid'))),
      returnVertex(
        construct('vec4<f32>', [
          binop('+', swizzle(ref('position'), 'x'), ref('px')),
          binop('+', swizzle(ref('position'), 'y'), ref('py')),
          litF32(0),
          litF32(1),
        ]),
        { color: construct('vec4<f32>', [ref('cr'), ref('cg'), ref('cb'), litF32(1)]) },
      ),
    ],
    fragmentAst: [returnFragment({ color: ref('color') })],
    // computeAst contract (see material-spec.ts): the texture-materialize
    // pass binds requiredFields from the bundle, then this final statement
    // let_-binds the color varying to a vec4<f32> the pass stores.
    computeAst: [
      let_('color', construct('vec4<f32>', [ref('color_r'), ref('color_g'), ref('color_b'), litF32(1)])),
    ],
    requiredFields: REQUIRED_FIELDS,
    pipelineState: {
      blendMode: 'opaque',
      cullMode: 'none',
      depthWrite: false,
      depthCompare: 'always',
    },
  });

  return { kind: 'material', spec };
}

export const DotMaterialBlock: BlockDefinition<DotMaterialConfig, DotMaterialLowerArgs> = {
  type: 'DotMaterial',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};
