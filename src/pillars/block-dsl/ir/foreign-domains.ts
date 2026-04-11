/**
 * src/pillars/block-dsl/ir/foreign-domains.ts
 *
 * Pure utility for walking a list of statements and discovering which
 * foreign domains are referenced via LoadField. A "foreign" domain is
 * any whose `<domain>:<field>` symbolId prefix differs from the
 * caller's own domain id.
 *
 * Used by `block-dsl/pass-builders/compute-from-bundle.ts` to populate
 * the compute pass's `dependencies.domains` declaration: foreign domains
 * must be marked 'read' so the scheduler can insert the necessary memory
 * barrier between the source domain's compute pass (which writes the
 * field) and this pass (which reads it).
 *
 * This module is a leaf in the dependency graph — it imports only from
 * the boundary contract.
 */

import type { StatementIR } from '../../../render/rust/boundary-contract';

/**
 * Walk a list of statements and return the set of foreign domain ids
 * referenced by any LoadField expression nested anywhere inside.
 *
 * Pure: no side effects, no allocation aside from the returned Set and
 * the walker's stack frames. Deterministic given the same input.
 */
export function collectForeignDomains(
  statements: readonly StatementIR[],
  ownDomainId: string,
): Set<string> {
  const out = new Set<string>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    const n = node as { type?: string; symbolId?: string };
    if (n.type === 'LoadField' && typeof n.symbolId === 'string') {
      const colon = n.symbolId.indexOf(':');
      if (colon > 0) {
        const domain = n.symbolId.slice(0, colon);
        if (domain !== ownDomainId) out.add(domain);
      }
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  };
  statements.forEach(visit);
  return out;
}
