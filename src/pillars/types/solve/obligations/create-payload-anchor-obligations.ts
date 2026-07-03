/**
 * src/pillars/types/solve/obligations/create-payload-anchor-obligations.ts
 *
 * `needsPayloadAnchor` obligation creator: for a polymorphic group with no
 * concrete payload evidence, anchor the first field port that still has an
 * unresolved payload variable.
 *
 * MONOTONE ONE-AT-A-TIME: only ONE payload anchor obligation is emitted per
 * iteration. Inserting two anchors at once risks committing two groups to
 * conflicting types if they share a hidden variable.
 * [LAW:no-ambient-temporal-coupling]
 */

import type { Obligation, TypeFacts, FactDependency } from '../typed-graph';
import { obligationId, parseDraftPortKey } from '../typed-graph';

export function createPayloadAnchorObligations(facts: TypeFacts): Obligation[] {
  for (const [key, hint] of facts.ports) {
    if (hint.status !== 'unknown') continue;
    if (!hint.inference || hint.inference.payload.kind !== 'var') continue;

    const id = obligationId(`needsPayloadAnchor:${key}`);
    const deps: FactDependency[] = [{ kind: 'portHasUnresolvedPayload', port: key }];
    const { blockId, slotName } = parseDraftPortKey(key);

    // ONE per iteration — return on the first unanchored field
    return [{
      id,
      kind: 'needsPayloadAnchor',
      anchor: { kind: 'port', blockId, slotName },
      status: { kind: 'open' },
      deps,
      policy: { name: 'payloadAnchor.v1' },
      debug: { createdBy: 'createPayloadAnchorObligations', note: `first unanchored field: ${key}` },
    }];
  }

  return [];
}
