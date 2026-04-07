/**
 * src/pillars/block-dsl/pass-builders/compute-from-bundle.ts
 *
 * Pure builder for a compute pass that materializes a SourceBundle into
 * a domain's SoA storage via StoreField.
 *
 * `[LAW:single-enforcer]` This is the ONE place that knows how to build
 * a bundle-materializing compute pass. It also enforces the foreign-domain
 * dependency declaration: any compute pass built this way correctly
 * declares its foreign LoadField reads via `collectForeignDomains`. Future
 * Intents (CameraUpdate, MaterializeTexture, etc.) that need to write a
 * SourceBundle reuse this builder and inherit the correct dependency
 * behavior automatically.
 *
 * The pass:
 *   - Always emits a `let gid = global_invocation_id.x` binding first.
 *   - Emits one StoreField per bundle field, sorted by field name for
 *     deterministic output.
 *   - Scans the resulting AST for foreign-domain LoadField references and
 *     adds them to `dependencies.domains` as 'read'.
 *   - Always declares its own domain as 'read_write'.
 *   - Defaults workgroupSize to [64, 1, 1].
 *
 * This module is a leaf — it imports only from the boundary contract,
 * ir-builders, block-api (for the SourceBundle type), and the foreign-
 * domain scanner module beside it.
 */

import type {
  ComputePassSpec,
  StatementIR,
  SymbolId,
} from '../../../render/rust/boundary-contract';
import { intrinsic, let_, ref, storeField } from '../../../render/gpu-ir/ir-builders';
import type { SourceBundle } from '../../block-api';
import { collectForeignDomains } from '../ir/foreign-domains';

export interface BuildComputePassFromBundleArgs {
  /** Unique pass id within the roster (e.g. `${domainId}_eval`). */
  readonly passId: string;
  /** The block id that produced this pass; included in sourceBlockIds. */
  readonly sourceBlockId: string;
  /** The domain whose SoA the bundle's fields are written into. */
  readonly domainId: string;
  /** The bundle to materialize. Field names become the SoA field names. */
  readonly bundle: SourceBundle;
  /** Optional workgroup size override; defaults to [64, 1, 1]. */
  readonly workgroupSize?: readonly [number, number, number];
}

export function buildComputePassFromBundle(
  args: BuildComputePassFromBundleArgs,
): ComputePassSpec {
  const { passId, sourceBlockId, domainId, bundle } = args;
  const workgroupSize = args.workgroupSize ?? ([64, 1, 1] as const);

  // Sort field names for deterministic output. Compile-time order doesn't
  // affect correctness (each StoreField is independent) but a stable order
  // makes diffs easier to read and tests easier to write.
  const fieldNames = Object.keys(bundle).sort();

  const ast: StatementIR[] = [let_('gid', intrinsic('global_invocation_id.x'))];
  for (const fieldName of fieldNames) {
    ast.push(
      storeField(
        `${domainId}:${fieldName}` as SymbolId,
        ref('gid'),
        bundle[fieldName],
      ),
    );
  }

  // [LAW:single-enforcer] Foreign-domain dependency declaration is owned
  // here. Any block that uses this builder gets the correct deps without
  // having to know about the cross-domain mechanism.
  const foreignDomains = collectForeignDomains(ast, domainId);
  const domainDeps: Record<string, 'read' | 'read_write'> = {
    [domainId]: 'read_write',
  };
  for (const foreign of foreignDomains) {
    domainDeps[foreign] = 'read';
  }

  return {
    type: 'Compute',
    passId,
    sourceBlockIds: [sourceBlockId],
    workgroupSize,
    dispatch: {
      mode: 'Domain',
      domainId: domainId as ComputePassSpec['dispatch'] extends {
        mode: 'Domain';
        domainId: infer D;
      }
        ? D
        : never,
    },
    dependencies: {
      requiresGlobals: true,
      domains: domainDeps as ComputePassSpec['dependencies']['domains'],
      textures: {},
    },
    ast,
  };
}
