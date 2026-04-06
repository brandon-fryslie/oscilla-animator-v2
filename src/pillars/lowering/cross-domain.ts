/**
 * src/pillars/lowering/cross-domain.ts
 *
 * Cross-domain LoadField rewriting + cardinality validation. Pure functions
 * extracted from the legacy walker.
 */

import type { ExprIR, MemoryManifest, SymbolId } from '../../render/rust/boundary-contract';
import { loadField, ref } from '../../render/gpu-ir/ir-builders';
import type { SourceBundle } from '../block-api';

export function rewriteAsLoadFields(
  bundle: SourceBundle,
  sourceDomainId: string,
): SourceBundle {
  const out: Record<string, ExprIR> = {};
  for (const fieldName of Object.keys(bundle)) {
    const symbolId = `${sourceDomainId}:${fieldName}` as SymbolId;
    out[fieldName] = loadField(symbolId, ref('gid'));
  }
  return out;
}

export type CardinalityCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export function validateCardinality(
  manifest: MemoryManifest,
  sourceDomainId: string,
  primaryDomainId: string,
  targetBlockId: string,
  slot: string,
): CardinalityCheck {
  const sourceDomain = manifest.domains[sourceDomainId];
  const primaryDomain = manifest.domains[primaryDomainId];
  if (!sourceDomain || !primaryDomain) {
    return {
      ok: false,
      message:
        `[pillars walker] Block '${targetBlockId}' input slot '${slot}': ` +
        `cross-domain read references domain not in manifest ` +
        `(source='${sourceDomainId}', primary='${primaryDomainId}')`,
    };
  }
  if (sourceDomain.capacity !== primaryDomain.capacity) {
    return {
      ok: false,
      message:
        `[pillars walker] Block '${targetBlockId}' input slot '${slot}': ` +
        `cross-domain cardinality mismatch — source domain '${sourceDomainId}' ` +
        `has capacity ${sourceDomain.capacity} but primary domain '${primaryDomainId}' ` +
        `has capacity ${primaryDomain.capacity}. Insert an explicit resampling block ` +
        `between the domains (or pick matching capacities).`,
    };
  }
  return { ok: true };
}
