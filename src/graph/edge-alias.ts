/**
 * Edge alias derivation (shared helper).
 *
 * [LAW:single-enforcer] Edge aliases are derived once from source endpoint identity.
 */

import { normalizeCanonicalName } from '../core/canonical-name';

export interface EdgeAliasEndpoint {
  readonly kind: 'port';
  readonly blockId: string;
  readonly slotId: string;
}

export interface EdgeAliasBlockSource {
  readonly id: string;
  readonly displayName?: string | null;
}

export function deriveEdgeAlias(
  from: EdgeAliasEndpoint,
  blocks: ReadonlyMap<string, EdgeAliasBlockSource>,
  explicitAlias?: string,
): string {
  if (explicitAlias !== undefined) return explicitAlias;
  if (from.kind !== 'port') {
    throw new Error(`Cannot derive edge alias from endpoint kind '${from.kind}'`);
  }
  const source = blocks.get(from.blockId);
  if (!source) {
    throw new Error(`Cannot derive edge alias: source block '${from.blockId}' not found`);
  }
  // [LAW:dataflow-not-control-flow] Alias derivation is endpoint-based and
  // does not branch on output-port registration details (hidden/composite ports).
  const canonical = source.displayName ? normalizeCanonicalName(source.displayName) : source.id;
  return `${canonical}.${from.slotId}`;
}
