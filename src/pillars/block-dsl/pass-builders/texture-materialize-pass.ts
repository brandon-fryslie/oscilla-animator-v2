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
 * The pass owns the texel plumbing; the Material owns the color. It:
 *   - Always emits `let gid_x = global_invocation_id.x` and
 *     `let gid_y = global_invocation_id.y` first.
 *   - Let-binds each name in `material.requiredFields` from the bundle —
 *     by name, with zero hardcoded field names. [LAW:single-enforcer]
 *   - Appends the material's `computeAst`, whose final statement
 *     let-binds `material.colorVaryingName` to a vec4<f32>.
 *   - Emits a single TextureStore at coords `vec2<u32>(gid_x, gid_y)`
 *     whose value is `ref(material.colorVaryingName)`. The pass never
 *     constructs a color itself. [LAW:one-source-of-truth]
 *   - Declares the target texture as 'write' in dependencies.textures.
 *   - Scans the bundle for cross-domain LoadField references and
 *     declares them as 'read' in dependencies.domains.
 *
 * This module is a leaf — it imports only the boundary contract,
 * ir-builders, block-api (for the SourceBundle and MaterialSpec types),
 * and the foreign-domain scanner.
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
import type { MaterialSpec, SourceBundle } from '../../block-api';
import { collectForeignDomains } from '../ir/foreign-domains';

export interface BuildTextureMaterializePassArgs {
  /** Unique pass id within the roster (e.g. `${textureId}_materialize`). */
  readonly passId: string;
  /** The block id that produced this pass; included in sourceBlockIds. */
  readonly sourceBlockId: string;
  /** The destination storage texture id. */
  readonly textureId: string;
  /**
   * The bundle to materialize. Must contain every field in
   * `material.requiredFields`. Validation is the caller's responsibility
   * (the Materialize block does it via `consumeMaterial` before calling
   * this builder).
   */
  readonly bundle: SourceBundle;
  /**
   * The Material whose `computeAst` composes the stored color. Must define
   * `computeAst` — a texture-materialize sink has no vertex/fragment stage
   * to fall back on.
   */
  readonly material: MaterialSpec;
  /** Optional workgroup size override; defaults to [8, 8, 1]. */
  readonly workgroupSize?: readonly [number, number, number];
}

export function buildTextureMaterializePass(
  args: BuildTextureMaterializePassArgs,
): ComputePassSpec {
  const { passId, sourceBlockId, textureId, bundle, material } = args;
  const workgroupSize = args.workgroupSize ?? ([8, 8, 1] as const);

  // A texture-materialize sink has no vertex/fragment stage, so the material
  // MUST carry a compute color path. A material wired here without one is a
  // misconfiguration that must surface loudly. [LAW:no-silent-failure]
  if (!material.computeAst) {
    throw new Error(
      `[texture-materialize] material has no computeAst — a texture-materialize ` +
        `sink requires a material that defines the compute color path`,
    );
  }

  const ast: StatementIR[] = [
    let_('gid_x', intrinsic('global_invocation_id.x')),
    let_('gid_y', intrinsic('global_invocation_id.y')),
    // Bind every field the material declares it needs, by name. The pass has
    // zero hardcoded field names — requiredFields is the material's contract.
    // [LAW:single-enforcer]
    ...material.requiredFields.map((name) => let_(name, bundle[name])),
    // The material composes the color: its computeAst's final statement
    // let-binds colorVaryingName to a vec4<f32>. The pass only stores it.
    // [LAW:one-source-of-truth]
    ...material.computeAst,
    textureStore_(
      textureId as TextureId,
      construct('vec2<u32>', [ref('gid_x'), ref('gid_y')]),
      ref(material.colorVaryingName),
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
