/**
 * src/pillars/block-dsl/pass-builders/texture-materialize-pass.ts
 *
 * Pure builder for a compute pass that materializes a SourceBundle into
 * a 2D storage texture. The pass dispatches with `mode: 'Texture'` so
 * `global_invocation_id.{x,y}` give the destination texel directly.
 *
 * `[LAW:single-enforcer]` This is the ONE place that knows how to build
 * a bundle-to-texture compute pass. It enforces foreign-domain LoadField
 * dependency declaration (any cross-domain reads in the bundle's field
 * expressions get correctly declared) and the let-binding pattern that
 * the bundle's expressions reference.
 *
 * The pass:
 *   - Always emits `let gid_x = global_invocation_id.x` and
 *     `let gid_y = global_invocation_id.y` first.
 *   - Let-binds each of the four required color components from the
 *     bundle (color_r, color_g, color_b, color_a) so the final
 *     TextureStore value is a clean Construct of vec4<f32>.
 *   - Emits a single TextureStore at coords `vec2<u32>(gid_x, gid_y)`.
 *   - Declares the target texture as 'write' in dependencies.textures.
 *   - Scans the bundle for cross-domain LoadField references and
 *     declares them as 'read' in dependencies.domains.
 *
 * This module is a leaf — it imports only the boundary contract,
 * ir-builders, block-api (for the SourceBundle type), and the foreign-
 * domain scanner.
 */

import type {
  ComputePassSpec,
  StatementIR,
  TextureId,
} from '../../../render/rust/boundary-contract';
import {
  construct,
  intrinsic,
  let_,
  ref,
  textureStore_,
} from '../../../render/gpu-ir/ir-builders';
import type { SourceBundle } from '../../block-api';
import { collectForeignDomains } from '../ir/foreign-domains';

export interface BuildTextureMaterializePassArgs {
  /** Unique pass id within the roster (e.g. `${textureId}_materialize`). */
  readonly passId: string;
  /** The block id that produced this pass; included in sourceBlockIds. */
  readonly sourceBlockId: string;
  /** The destination storage texture id. */
  readonly textureId: string;
  /**
   * The bundle to materialize. Must contain at least the four fields
   * `color_r`, `color_g`, `color_b`, `color_a` (each f32). Validation
   * is the caller's responsibility (the Materialize block does it
   * before calling this builder).
   */
  readonly bundle: SourceBundle;
  /** Optional workgroup size override; defaults to [8, 8, 1]. */
  readonly workgroupSize?: readonly [number, number, number];
}

export function buildTextureMaterializePass(
  args: BuildTextureMaterializePassArgs,
): ComputePassSpec {
  const { passId, sourceBlockId, textureId, bundle } = args;
  const workgroupSize = args.workgroupSize ?? ([8, 8, 1] as const);

  const ast: StatementIR[] = [
    let_('gid_x', intrinsic('global_invocation_id.x')),
    let_('gid_y', intrinsic('global_invocation_id.y')),
    let_('color_r', bundle.color_r),
    let_('color_g', bundle.color_g),
    let_('color_b', bundle.color_b),
    let_('color_a', bundle.color_a),
    textureStore_(
      textureId as TextureId,
      construct('vec2<u32>', [ref('gid_x'), ref('gid_y')]),
      construct('vec4<f32>', [
        ref('color_r'),
        ref('color_g'),
        ref('color_b'),
        ref('color_a'),
      ]),
    ),
  ];

  // [LAW:single-enforcer] Foreign-domain dependency scan. Materialize has
  // no own domain, so the sentinel '__none__' makes every domain reference
  // foreign — exactly what we want.
  const foreignDomains = collectForeignDomains(ast, '__none__');
  const domainDeps: Record<string, 'read' | 'read_write'> = {};
  for (const foreign of foreignDomains) {
    domainDeps[foreign] = 'read';
  }

  return {
    type: 'Compute',
    passId,
    sourceBlockIds: [sourceBlockId],
    workgroupSize,
    dispatch: {
      mode: 'Texture',
      textureId: textureId as ComputePassSpec['dispatch'] extends {
        mode: 'Texture';
        textureId: infer T;
      }
        ? T
        : never,
    },
    dependencies: {
      requiresGlobals: true,
      domains: domainDeps as ComputePassSpec['dependencies']['domains'],
      textures: { [textureId]: 'write' } as ComputePassSpec['dependencies']['textures'],
    },
    ast,
  };
}
