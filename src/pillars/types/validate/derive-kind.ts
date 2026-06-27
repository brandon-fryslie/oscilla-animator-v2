/**
 * src/pillars/types/validate/derive-kind.ts
 *
 * `deriveKind` — total function over `ZCanonicalType`. Kind is DERIVED from
 * extent axes, never stored. A stored `kind` field on any IR node is a
 * representation violation. [LAW:one-source-of-truth] [LAW:types-are-the-program]
 *
 * Classification:
 *   discrete temporality                → `event`
 *   continuous + cardinality many       → `field`
 *   continuous + cardinality one/zero   → `signal`
 */

import type { ZCanonicalType } from '../schemas';

export type SignalKind = 'signal' | 'field' | 'event';

export function deriveKind(type: ZCanonicalType): SignalKind {
  if (type.extent.temporality.kind === 'discrete') return 'event';
  if (type.extent.cardinality.kind === 'many') return 'field';
  return 'signal';
}
