/**
 * src/pillars/block-dsl/materials/dot-material.ts
 *
 * The "dot" material — vertex shader, fragment shader, pipeline state,
 * and the set of bundle field names the material requires.
 *
 * This is the precursor to the Pillar 3 Material concept (slice 6+).
 * The material declares its data contract by NAME: any bundle wired into
 * a DrawBundle that uses this material must contain at least the fields
 * in `DOT_MATERIAL_REQUIRED_FIELDS`. Validation happens at compile time
 * via `validateBundleForDotMaterial`.
 *
 * When the Material pillar lands, this exact module will be called by a
 * `DotMaterialBlock.lower()` function instead of by DrawBundle directly.
 * The shape of the exports here doesn't need to change — only the caller
 * does.
 *
 * This module is a leaf — it imports only from the boundary contract
 * and ir-builders.
 */

import type {
  PipelineStateSpec,
  StatementIR,
  SymbolId,
} from '../../../render/rust/boundary-contract';
import type { SourceBundle } from '../../block-api';
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
} from '../../../render/gpu-ir/ir-builders';

/**
 * The set of fields that the dot material's vertex shader reads from
 * the source domain's SoA. Any bundle wired into a DrawBundle that uses
 * this material must contain at least these fields.
 */
export const DOT_MATERIAL_REQUIRED_FIELDS: readonly string[] = [
  'pos_x',
  'pos_y',
  'color_r',
  'color_g',
  'color_b',
];

export interface DotMaterial {
  readonly vertexAst: readonly StatementIR[];
  readonly fragmentAst: readonly StatementIR[];
  readonly pipelineState: PipelineStateSpec;
  readonly requiredFields: readonly string[];
}

/**
 * Build the dot material's vertex/fragment AST and pipeline state for a
 * given source domain.
 *
 * The vertex shader:
 *   - Loads pos_x, pos_y, color_r, color_g, color_b from the domain's SoA
 *     using `instance_index`.
 *   - Assembles the per-vertex position by adding the unit quad's local
 *     position to the per-instance offset.
 *   - Passes the color as a varying to the fragment shader.
 *
 * The fragment shader emits the varying color unchanged.
 *
 * The pipeline state is opaque, no culling, depth-test always, no depth
 * write. Suitable for non-overlapping 2D dot rendering.
 *
 * Pure: no side effects, returns a fresh value per call.
 */
export function makeDotMaterial(domainId: string): DotMaterial {
  const fieldSymbol = (name: string) => `${domainId}:${name}` as SymbolId;

  const vertexAst: StatementIR[] = [
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
  ];

  const fragmentAst: StatementIR[] = [
    returnFragment({ color: ref('color') }),
  ];

  const pipelineState: PipelineStateSpec = {
    blendMode: 'opaque',
    cullMode: 'none',
    depthWrite: false,
    depthCompare: 'always',
  };

  return {
    vertexAst,
    fragmentAst,
    pipelineState,
    requiredFields: DOT_MATERIAL_REQUIRED_FIELDS,
  };
}

/**
 * Throw if the bundle is missing any field the dot material requires.
 *
 * The `blockId` parameter is included in the error message so users can
 * locate the offending block in their patch without having to guess.
 *
 * This is one of the few places in the new system where throwing is
 * correct: a missing required field is an INVARIANT VIOLATION (the
 * frontend should have caught it during normalization). The throw is
 * an assertion that the frontend's validation has already happened.
 */
export function validateBundleForDotMaterial(
  bundle: SourceBundle,
  blockId: string,
): void {
  const missing: string[] = [];
  for (const required of DOT_MATERIAL_REQUIRED_FIELDS) {
    if (!(required in bundle)) {
      missing.push(required);
    }
  }
  if (missing.length > 0) {
    const have = Object.keys(bundle).sort().join(', ') || '(none)';
    throw new Error(
      `[DotMaterial] Block '${blockId}': bundle is missing required field(s) ` +
        `${missing.map((m) => `'${m}'`).join(', ')}. ` +
        `Available fields: ${have}`,
    );
  }
}
